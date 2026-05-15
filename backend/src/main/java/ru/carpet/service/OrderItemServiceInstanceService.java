package ru.carpet.service;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.dto.OrderItemServiceWithAssignees;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.*;
import ru.carpet.repository.*;

import java.math.BigDecimal;
import java.util.*;

/**
 * Услуги на позициях заказа (V10).
 *
 * <p>Привязка теперь к SKU (см. {@link Sku}). Имя и группа берутся snapshot'ом
 * из конкретной версии SKU через {@link OrderItemServiceInstanceRepository}.
 *
 * <p>При добавлении услуги к позиции рассчитываем цену через {@link PricingHelper}
 * по pricingType SKU и параметрам позиции (вес/площадь/периметр и т.д.).
 */
@Service
public class OrderItemServiceInstanceService {

    private final OrderItemServiceInstanceRepository repository;
    private final ServiceAssigneeRepository assigneeRepository;
    private final EmployeeRepository employeeRepository;
    private final OrderItemRepository orderItemRepository;
    private final OrderItemService orderItemService;
    private final SkuService skuService;
    private final OrderService orderService;

    public OrderItemServiceInstanceService(
            OrderItemServiceInstanceRepository repository,
            ServiceAssigneeRepository assigneeRepository,
            EmployeeRepository employeeRepository,
            OrderItemRepository orderItemRepository,
            OrderItemService orderItemService,
            SkuService skuService,
            @Lazy OrderService orderService
    ) {
        this.repository = repository;
        this.assigneeRepository = assigneeRepository;
        this.employeeRepository = employeeRepository;
        this.orderItemRepository = orderItemRepository;
        this.orderItemService = orderItemService;
        this.skuService = skuService;
        this.orderService = orderService;
    }

    public List<OrderItemServiceInstance> findByOrderItemId(Long orderItemId) {
        return repository.findByOrderItemId(orderItemId);
    }

    public List<OrderItemServiceWithAssignees> findByOrderItemIdWithAssignees(Long orderItemId) {
        List<OrderItemServiceInstance> services = repository.findByOrderItemId(orderItemId);
        return enrichWithAssignees(services);
    }

    /** Все услуги по заказу одним батчем — устраняет N+1 на странице заказа. */
    public List<OrderItemServiceWithAssignees> findByOrderIdWithAssignees(Long orderId) {
        List<OrderItem> items = orderItemRepository.findByOrderId(orderId);
        if (items.isEmpty()) return List.of();
        List<Long> itemIds = items.stream().map(OrderItem::id).toList();
        List<OrderItemServiceInstance> services = repository.findByOrderItemIds(itemIds);
        return enrichWithAssignees(services);
    }

    private List<OrderItemServiceWithAssignees> enrichWithAssignees(List<OrderItemServiceInstance> services) {
        if (services.isEmpty()) return List.of();
        List<Long> serviceIds = services.stream().map(OrderItemServiceInstance::id).toList();
        Map<Long, List<Long>> assigneeMap = assigneeRepository.findEmployeeIdsByServiceIds(serviceIds);
        Set<Long> allEmpIds = new HashSet<>();
        assigneeMap.values().forEach(allEmpIds::addAll);
        Map<Long, Employee> empMap = allEmpIds.isEmpty() ? Map.of()
                : employeeRepository.findByIds(new ArrayList<>(allEmpIds));
        return services.stream().map(s -> {
            List<Long> empIds = assigneeMap.getOrDefault(s.id(), List.of());
            List<Employee> assignees = empIds.stream().map(empMap::get).filter(Objects::nonNull).toList();
            return new OrderItemServiceWithAssignees(
                    s.id(), s.orderItemId(), s.skuId(), s.skuName(), s.skuGroupName(),
                    s.pricingType(), s.status(), s.price(), s.isManualPrice(),
                    assignees, s.cancellationReason(), s.createdAt(), s.updatedAt()
            );
        }).toList();
    }

    public List<OrderItemServiceInstance> findByEmployeeId(Long employeeId, String status) {
        return repository.findByEmployeeId(employeeId, status);
    }

    public java.math.BigDecimal sumPriceByEmployeeId(Long employeeId, String status, String dateFrom, String dateTo) {
        return repository.sumPriceByEmployeeId(employeeId, status, dateFrom, dateTo);
    }

    /**
     * Добавить услугу к позиции по выбранному SKU.
     * Цена рассчитывается через {@link PricingHelper} (SKU.price × соответствующий
     * параметр позиции в зависимости от pricingType).
     */
    @Transactional
    public OrderItemServiceInstance addService(Long orderItemId, Long skuId) {
        OrderItem orderItem = orderItemRepository.findById(orderItemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + orderItemId));
        Sku sku = skuService.findById(skuId);

        // Запрет дублей: одну и ту же SKU нельзя повесить на позицию дважды.
        boolean alreadyExists = repository.findByOrderItemId(orderItemId).stream()
                .anyMatch(s -> Objects.equals(s.skuId(), skuId)
                        && s.status() != ServiceStatus.CANCELLED);
        if (alreadyExists) {
            throw new BusinessRuleException("Эта услуга уже добавлена к позиции");
        }

        BigDecimal price = PricingHelper.calculate(sku.price(), sku.pricingType(), orderItem);
        Long newId = repository.saveOne(orderItemId, skuId, price);
        orderItemService.recalculateItemPrice(orderItemId);
        return repository.findById(newId).orElseThrow();
    }

    public OrderItemServiceWithAssignees addServiceWithAssignees(Long orderItemId, Long skuId) {
        OrderItemServiceInstance service = addService(orderItemId, skuId);
        return mapToWithAssignees(service);
    }

    @Transactional
    public OrderItemServiceInstance updateStatus(Long serviceId, ServiceStatus status) {
        return updateStatus(serviceId, status, null);
    }

    @Transactional
    public OrderItemServiceInstance updateStatus(Long serviceId, ServiceStatus status, String cancellationReason) {
        OrderItemServiceInstance instance = repository.findById(serviceId)
                .orElseThrow(() -> new EntityNotFoundException("Service instance not found: " + serviceId));

        if (status != ServiceStatus.CREATED && status != ServiceStatus.CANCELLED) {
            List<Long> assigneeIds = assigneeRepository.findEmployeeIdsByServiceId(serviceId);
            if (assigneeIds.isEmpty()) {
                throw new BusinessRuleException("Невозможно сменить статус: не назначен исполнитель");
            }
            OrderItem orderItem = orderItemRepository.findById(instance.orderItemId()).orElse(null);
            String missing = PricingHelper.checkDimensions(instance.pricingType(), orderItem);
            if (missing != null) {
                throw new BusinessRuleException(
                        "Невозможно сменить статус услуги: не заполнено в позиции — " + missing);
            }
        }

        if (status == ServiceStatus.CANCELLED) {
            String reason = cancellationReason == null ? "" : cancellationReason.trim();
            if (reason.length() < 10) {
                throw new BusinessRuleException("Для отмены услуги укажите причину (минимум 10 символов).");
            }
            repository.updateStatusWithReason(serviceId, status, reason);
        } else {
            repository.updateStatus(serviceId, status);
        }
        orderItemService.recalculateItemStatus(instance.orderItemId());

        // V11 lifecycle: если услуга стала DONE и у SKU есть triggers_order_status — двигаем заказ.
        if (status == ServiceStatus.DONE && instance.skuId() != null) {
            orderService.checkServiceTrigger(instance.orderItemId(), instance.skuId());
        }

        return repository.findById(serviceId).orElseThrow();
    }

    @Transactional
    public OrderItemServiceInstance updatePrice(Long serviceId, java.math.BigDecimal price) {
        OrderItemServiceInstance instance = repository.findById(serviceId)
                .orElseThrow(() -> new EntityNotFoundException("Service instance not found: " + serviceId));
        repository.updatePrice(serviceId, price);
        orderItemService.recalculateItemPrice(instance.orderItemId());
        return repository.findById(serviceId).orElseThrow();
    }

    public OrderItemServiceWithAssignees updateStatusWithAssignees(Long serviceId, ServiceStatus status) {
        return mapToWithAssignees(updateStatus(serviceId, status));
    }

    public OrderItemServiceWithAssignees updateStatusWithAssignees(Long serviceId, ServiceStatus status, String cancellationReason) {
        return mapToWithAssignees(updateStatus(serviceId, status, cancellationReason));
    }

    public OrderItemServiceWithAssignees updatePriceWithAssignees(Long serviceId, java.math.BigDecimal price) {
        return mapToWithAssignees(updatePrice(serviceId, price));
    }

    @Transactional
    public void assignEmployees(Long serviceId, List<Long> employeeIds) {
        repository.findById(serviceId)
                .orElseThrow(() -> new EntityNotFoundException("Service instance not found: " + serviceId));
        for (Long empId : employeeIds) {
            employeeRepository.findById(empId)
                    .orElseThrow(() -> new EntityNotFoundException("Employee not found: " + empId));
        }
        assigneeRepository.assignEmployees(serviceId, employeeIds);
    }

    public OrderItemServiceWithAssignees assignEmployeesWithAssignees(Long serviceId, List<Long> employeeIds) {
        assignEmployees(serviceId, employeeIds);
        return mapToWithAssignees(repository.findById(serviceId).orElseThrow());
    }

    private OrderItemServiceWithAssignees mapToWithAssignees(OrderItemServiceInstance s) {
        List<Long> employeeIds = assigneeRepository.findEmployeeIdsByServiceId(s.id());
        List<Employee> assignees = employeeIds.stream()
                .map(id -> employeeRepository.findById(id).orElse(null))
                .filter(Objects::nonNull).toList();
        return new OrderItemServiceWithAssignees(
                s.id(), s.orderItemId(), s.skuId(), s.skuName(), s.skuGroupName(),
                s.pricingType(), s.status(), s.price(), s.isManualPrice(),
                assignees, s.cancellationReason(), s.createdAt(), s.updatedAt()
        );
    }
}
