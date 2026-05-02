package ru.carpet.service;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.*;
import ru.carpet.repository.*;

import java.math.BigDecimal;
import java.util.List;

@Service
public class OrderItemService {

    private final OrderItemRepository orderItemRepository;
    private final OrderItemServiceInstanceRepository serviceInstanceRepository;
    private final OrderRepository orderRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final ServiceDefinitionRepository serviceDefinitionRepository;
    private final PricingService pricingService;
    private final OrderService orderService;
    private final PriceListRepository priceListRepository;

    public OrderItemService(
            OrderItemRepository orderItemRepository,
            OrderItemServiceInstanceRepository serviceInstanceRepository,
            OrderRepository orderRepository,
            ItemTypeRepository itemTypeRepository,
            ServiceDefinitionRepository serviceDefinitionRepository,
            PricingService pricingService,
            @Lazy OrderService orderService,
            PriceListRepository priceListRepository
    ) {
        this.orderItemRepository = orderItemRepository;
        this.serviceInstanceRepository = serviceInstanceRepository;
        this.orderRepository = orderRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.serviceDefinitionRepository = serviceDefinitionRepository;
        this.pricingService = pricingService;
        this.orderService = orderService;
        this.priceListRepository = priceListRepository;
    }

    @Transactional
    public OrderItem addItem(Long orderId, Long itemTypeId, String description) {
        orderRepository.findById(orderId)
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + orderId));
        itemTypeRepository.findById(itemTypeId)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + itemTypeId));

        OrderItem item = orderItemRepository.save(orderId, itemTypeId, description);

        // Не добавляем услуги автоматически - пользователь будет добавлять их вручную

        return item;
    }

    public List<OrderItem> findByOrderId(Long orderId) {
        return orderItemRepository.findByOrderId(orderId);
    }

    public OrderItem findById(Long id) {
        return orderItemRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + id));
    }

    /** Ручное изменение статуса позиции — только отмена разрешена вручную,
     *  остальные статусы вычисляются автоматически из услуг */
    public OrderItem updateStatus(Long itemId, OrderItemStatus newStatus) {
        if (newStatus != OrderItemStatus.CANCELLED) {
            throw new ru.carpet.exception.BusinessRuleException(
                "Статус позиции меняется автоматически на основе услуг. Вручную можно только отменить.");
        }
        findById(itemId);
        orderItemRepository.updateStatus(itemId, newStatus);
        OrderItem item = orderItemRepository.findById(itemId).orElseThrow();
        orderService.recalculateOrderStatus(item.orderId());
        return item;
    }

    /** Обновление описания и дефектов позиции */
    public OrderItem updateDescription(Long itemId, String description, String defects) {
        findById(itemId);
        orderItemRepository.updateDescription(itemId, description, defects);
        return orderItemRepository.findById(itemId).orElseThrow();
    }

    /** Установка цены позиции */
    public OrderItem updatePrice(Long itemId, BigDecimal price) {
        OrderItem item = findById(itemId);
        orderItemRepository.updatePrice(itemId, price);
        orderService.recalculateTotalAmount(item.orderId());
        return orderItemRepository.findById(itemId).orElseThrow();
    }

    /** Обновление параметров ковра (длина, ширина, вес, площадь, погонные метры) */
    @Transactional
    public OrderItem updateDimensions(Long itemId, BigDecimal length, BigDecimal width, BigDecimal weight,
                                       BigDecimal area, BigDecimal runningMeters) {
        OrderItem item = findById(itemId);

        // Блокируем редактирование для DELIVERED и CANCELLED заказов
        Order order = orderRepository.findById(item.orderId())
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + item.orderId()));
        if (order.status() == OrderStatus.DELIVERED || order.status() == OrderStatus.CANCELLED) {
            throw new ru.carpet.exception.BusinessRuleException(
                    "Нельзя редактировать параметры позиции для заказа в статусе " + order.status());
        }

        orderItemRepository.updateDimensions(itemId, length, width, weight, area, runningMeters);

        // Пересчитываем стоимость всех услуг с автоматическим расчетом
        recalculateServicePrices(itemId);

        return orderItemRepository.findById(itemId).orElseThrow();
    }

    /**
     * Автоматический пересчёт статуса позиции на основе статусов её услуг.
     * Вызывается после изменения статуса услуги.
     */
    @Transactional
    public void recalculateItemStatus(Long orderItemId) {
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(orderItemId);
        if (services.isEmpty()) {
            return;
        }

        OrderItemStatus newStatus = computeItemStatus(services);
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        if (newStatus != item.status()) {
            orderItemRepository.updateStatus(orderItemId, newStatus);
            // Пересчитываем статус заказа
            orderService.recalculateOrderStatus(item.orderId());
        }
    }

    /**
     * Автоматический пересчёт стоимости позиции на основе стоимости её услуг.
     * Вызывается после изменения стоимости услуги.
     */
    @Transactional
    public void recalculateItemPrice(Long orderItemId) {
        BigDecimal totalServicePrice = serviceInstanceRepository.sumPriceByOrderItemId(orderItemId);
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        orderItemRepository.updatePrice(orderItemId, totalServicePrice);
        // Всегда пересчитываем общую стоимость заказа
        orderService.recalculateTotalAmount(item.orderId());
    }

    /**
     * Пересчет стоимости всех услуг позиции на основе новых параметров.
     * Пересчитываются только услуги с is_manual_price = false.
     */
    @Transactional
    public void recalculateServicePrices(Long orderItemId) {
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(orderItemId);

        for (OrderItemServiceInstance service : services) {
            if (!service.isManualPrice()) {
                ServiceDefinition serviceDef = serviceDefinitionRepository.findById(service.serviceDefId()).orElse(null);
                if (serviceDef != null) {
                    // Получаем цену из прайс-листа
                    BigDecimal basePrice = priceListRepository
                            .findByItemTypeIdAndServiceDefId(item.itemTypeId(), service.serviceDefId())
                            .map(ru.carpet.model.PriceListEntry::price)
                            .orElse(serviceDef.basePrice());
                    BigDecimal newPrice = pricingService.calculateServicePrice(basePrice, serviceDef.pricingType(), item);
                    serviceInstanceRepository.updateCalculatedPrice(service.id(), newPrice);
                }
            }
        }

        // Пересчитываем стоимость позиции
        recalculateItemPrice(orderItemId);
    }

    private OrderItemStatus computeItemStatus(List<OrderItemServiceInstance> services) {
        long doneCount = services.stream().filter(s -> s.status() == ServiceStatus.DONE).count();
        long cancelledCount = services.stream().filter(s -> s.status() == ServiceStatus.CANCELLED).count();
        long inProgressCount = services.stream().filter(s -> s.status() == ServiceStatus.IN_PROGRESS).count();
        long doneOrCancelledCount = doneCount + cancelledCount;

        // Если все услуги выполнены или отменены
        if (doneOrCancelledCount == services.size()) {
            // Если есть хотя бы одна выполненная услуга - статус DONE
            if (doneCount > 0) return OrderItemStatus.DONE;
            // Если все отменены - статус CANCELLED
            return OrderItemStatus.CANCELLED;
        }
        
        // Если есть выполненные услуги, но не все услуги завершены
        if (doneCount > 0) return OrderItemStatus.PARTIALLY_DONE;
        
        // Если есть услуги в работе
        if (inProgressCount > 0) return OrderItemStatus.IN_PROGRESS;
        
        return OrderItemStatus.CREATED;
    }
}
