package ru.carpet.service;

import org.springframework.stereotype.Service;
import ru.carpet.dto.OrderItemServiceWithAssignees;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.*;
import ru.carpet.repository.*;

import java.math.BigDecimal;
import java.util.List;

@Service
public class OrderItemServiceInstanceService {

    private final OrderItemServiceInstanceRepository repository;
    private final ServiceAssigneeRepository assigneeRepository;
    private final EmployeeRepository employeeRepository;
    private final ServiceDefinitionRepository serviceDefinitionRepository;
    private final OrderItemRepository orderItemRepository;
    private final PricingService pricingService;
    private final OrderItemService orderItemService;
    private final PriceListRepository priceListRepository;

    public OrderItemServiceInstanceService(
            OrderItemServiceInstanceRepository repository,
            ServiceAssigneeRepository assigneeRepository,
            EmployeeRepository employeeRepository,
            ServiceDefinitionRepository serviceDefinitionRepository,
            OrderItemRepository orderItemRepository,
            PricingService pricingService,
            OrderItemService orderItemService,
            PriceListRepository priceListRepository
    ) {
        this.repository = repository;
        this.assigneeRepository = assigneeRepository;
        this.employeeRepository = employeeRepository;
        this.serviceDefinitionRepository = serviceDefinitionRepository;
        this.orderItemRepository = orderItemRepository;
        this.pricingService = pricingService;
        this.orderItemService = orderItemService;
        this.priceListRepository = priceListRepository;
    }

    public List<OrderItemServiceInstance> findByOrderItemId(Long orderItemId) {
        return repository.findByOrderItemId(orderItemId);
    }

    public List<OrderItemServiceWithAssignees> findByOrderItemIdWithAssignees(Long orderItemId) {
        List<OrderItemServiceInstance> services = repository.findByOrderItemId(orderItemId);
        return services.stream().map(this::mapToWithAssignees).toList();
    }

    public List<OrderItemServiceInstance> findByEmployeeId(Long employeeId, String status) {
        return repository.findByEmployeeId(employeeId, status);
    }

    public java.math.BigDecimal sumPriceByEmployeeId(Long employeeId, String status, String dateFrom, String dateTo) {
        return repository.sumPriceByEmployeeId(employeeId, status, dateFrom, dateTo);
    }

    public OrderItemServiceInstance addService(Long orderItemId, Long serviceDefId) {
        // Получаем позицию заказа
        OrderItem orderItem = orderItemRepository.findById(orderItemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + orderItemId));

        // Проверяем доступность услуги для данного типа позиции через прайс-лист
        PriceListEntry priceListEntry = priceListRepository.findByItemTypeIdAndServiceDefId(orderItem.itemTypeId(), serviceDefId)
                .filter(PriceListEntry::isActive)
                .orElseThrow(() -> new BusinessRuleException("Услуга не доступна для данного типа позиции"));

        // Создаем новую услугу для позиции
        repository.saveAll(orderItemId, List.of(serviceDefId));

        // Получаем созданную услугу
        List<OrderItemServiceInstance> services = repository.findByOrderItemId(orderItemId);
        OrderItemServiceInstance service = services.stream()
                .filter(s -> s.serviceDefId().equals(serviceDefId))
                .reduce((first, second) -> second) // получаем последнюю созданную
                .orElseThrow(() -> new EntityNotFoundException("Service not created"));

        // Рассчитываем стоимость услуги используя цену из прайс-листа
        ServiceDefinition serviceDef = serviceDefinitionRepository.findById(serviceDefId).orElse(null);

        if (serviceDef != null) {
            BigDecimal calculatedPrice = pricingService.calculateServicePrice(priceListEntry.price(), serviceDef.pricingType(), orderItem);
            repository.updateCalculatedPrice(service.id(), calculatedPrice);
            // Пересчитываем стоимость позиции
            orderItemService.recalculateItemPrice(orderItemId);
        }

        return repository.findById(service.id()).orElseThrow();
    }

    public OrderItemServiceWithAssignees addServiceWithAssignees(Long orderItemId, Long serviceDefId) {
        OrderItemServiceInstance service = addService(orderItemId, serviceDefId);
        return mapToWithAssignees(service);
    }

    public OrderItemServiceInstance updateStatus(Long serviceId, ServiceStatus status) {
        OrderItemServiceInstance instance = repository.findById(serviceId)
                .orElseThrow(() -> new EntityNotFoundException("Service instance not found: " + serviceId));

        // Блокировка: если размеры не заполнены для данного pricing_type, нельзя переводить дальше CREATED
        if (status != ServiceStatus.CREATED && status != ServiceStatus.CANCELLED) {
            OrderItem orderItem = orderItemRepository.findById(instance.orderItemId()).orElse(null);
            ServiceDefinition serviceDef = serviceDefinitionRepository.findById(instance.serviceDefId()).orElse(null);
            if (orderItem != null && serviceDef != null) {
                String missing = checkDimensionsForPricing(serviceDef.pricingType(), orderItem);
                if (missing != null) {
                    throw new ru.carpet.exception.BusinessRuleException(
                            "Невозможно сменить статус услуги: не заполнены " + missing + " в позиции заказа");
                }
            }
        }

        repository.updateStatus(serviceId, status);
        // Автоматически пересчитываем статус позиции
        orderItemService.recalculateItemStatus(instance.orderItemId());
        return repository.findById(serviceId).orElseThrow();
    }

    public OrderItemServiceInstance updatePrice(Long serviceId, java.math.BigDecimal price) {
        OrderItemServiceInstance instance = repository.findById(serviceId)
                .orElseThrow(() -> new EntityNotFoundException("Service instance not found: " + serviceId));
        repository.updatePrice(serviceId, price);
        // Автоматически пересчитываем стоимость позиции
        orderItemService.recalculateItemPrice(instance.orderItemId());
        return repository.findById(serviceId).orElseThrow();
    }

    public OrderItemServiceWithAssignees updateStatusWithAssignees(Long serviceId, ServiceStatus status) {
        OrderItemServiceInstance service = updateStatus(serviceId, status);
        return mapToWithAssignees(service);
    }

    public OrderItemServiceWithAssignees updatePriceWithAssignees(Long serviceId, java.math.BigDecimal price) {
        OrderItemServiceInstance service = updatePrice(serviceId, price);
        return mapToWithAssignees(service);
    }

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
        OrderItemServiceInstance service = repository.findById(serviceId).orElseThrow();
        return mapToWithAssignees(service);
    }

    private OrderItemServiceWithAssignees mapToWithAssignees(OrderItemServiceInstance service) {
        List<Long> employeeIds = assigneeRepository.findEmployeeIdsByServiceId(service.id());
        List<Employee> assignees = employeeIds.stream()
                .map(id -> employeeRepository.findById(id).orElse(null))
                .filter(emp -> emp != null)
                .toList();

        ServiceDefinition serviceDef = serviceDefinitionRepository.findById(service.serviceDefId()).orElse(null);
        String serviceDefName = serviceDef != null ? serviceDef.name() : null;

        return new OrderItemServiceWithAssignees(
                service.id(),
                service.orderItemId(),
                service.serviceDefId(),
                serviceDefName,
                service.status(),
                service.price(),
                service.isManualPrice(),
                assignees,
                service.createdAt(),
                service.updatedAt()
        );
    }

    /** Проверяет, заполнены ли нужные размеры для pricing_type. Возвращает null если ОК, иначе описание недостающих полей. */
    private String checkDimensionsForPricing(ru.carpet.model.PricingType pricingType, OrderItem item) {
        return switch (pricingType) {
            case BY_AREA -> (item.length() == null || item.width() == null) ? "длина и ширина" : null;
            case BY_WEIGHT -> item.weight() == null ? "вес" : null;
            case BY_PERIMETER -> (item.runningMeters() == null && (item.length() == null || item.width() == null))
                    ? "погонные метры или длина и ширина" : null;
            case FIXED -> null;
        };
    }
}
