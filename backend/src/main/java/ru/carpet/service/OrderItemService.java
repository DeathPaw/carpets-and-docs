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
    private final OrderService orderService;
    private final SkuService skuService;

    public OrderItemService(
            OrderItemRepository orderItemRepository,
            OrderItemServiceInstanceRepository serviceInstanceRepository,
            OrderRepository orderRepository,
            ItemTypeRepository itemTypeRepository,
            @Lazy OrderService orderService,
            SkuService skuService
    ) {
        this.orderItemRepository = orderItemRepository;
        this.serviceInstanceRepository = serviceInstanceRepository;
        this.orderRepository = orderRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.orderService = orderService;
        this.skuService = skuService;
    }

    @Transactional
    public OrderItem addItem(Long orderId, Long itemTypeId, String description) {
        orderRepository.findById(orderId)
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + orderId));
        itemTypeRepository.findById(itemTypeId)
                .orElseThrow(() -> new EntityNotFoundException("ItemType not found: " + itemTypeId));
        return orderItemRepository.save(orderId, itemTypeId, description);
    }

    public List<OrderItem> findByOrderId(Long orderId) {
        return orderItemRepository.findByOrderId(orderId);
    }

    public OrderItem findById(Long id) {
        return orderItemRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + id));
    }

    public OrderItem updateStatus(Long itemId, OrderItemStatus newStatus) {
        return updateStatus(itemId, newStatus, null);
    }

    public OrderItem updateStatus(Long itemId, OrderItemStatus newStatus, String cancellationReason) {
        if (newStatus != OrderItemStatus.CANCELLED) {
            throw new ru.carpet.exception.BusinessRuleException(
                "Статус позиции меняется автоматически на основе услуг. Вручную можно только отменить.");
        }
        String reason = cancellationReason == null ? "" : cancellationReason.trim();
        if (reason.length() < 10) {
            throw new ru.carpet.exception.BusinessRuleException(
                "Для отмены позиции укажите причину (минимум 10 символов).");
        }
        findById(itemId);
        orderItemRepository.updateStatusWithReason(itemId, newStatus, reason);
        OrderItem item = orderItemRepository.findById(itemId).orElseThrow();
        orderService.recalculateOrderStatus(item.orderId());
        return item;
    }

    public OrderItem updateDescription(Long itemId, String description, String defects) {
        findById(itemId);
        orderItemRepository.updateDescription(itemId, description, defects);
        return orderItemRepository.findById(itemId).orElseThrow();
    }

    public OrderItem updatePrice(Long itemId, BigDecimal price) {
        OrderItem item = findById(itemId);
        orderItemRepository.updatePrice(itemId, price);
        orderService.recalculateTotalAmount(item.orderId());
        return orderItemRepository.findById(itemId).orElseThrow();
    }

    @Transactional
    public OrderItem updateDimensions(Long itemId, BigDecimal length, BigDecimal width, BigDecimal weight,
                                       BigDecimal area, BigDecimal runningMeters) {
        OrderItem item = findById(itemId);
        Order order = orderRepository.findById(item.orderId())
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + item.orderId()));
        if (order.status() == OrderStatus.DELIVERED
                || order.status() == OrderStatus.COMPLETED
                || order.status() == OrderStatus.CANCELLED) {
            throw new ru.carpet.exception.BusinessRuleException(
                    "Нельзя редактировать параметры позиции для заказа в статусе " + order.status());
        }
        orderItemRepository.updateDimensions(itemId, length, width, weight, area, runningMeters);
        lastSwitches = recalculateServicePrices(itemId);
        return orderItemRepository.findById(itemId).orElseThrow();
    }

    /** V11: результат последнего recalculate для передачи в контроллер. */
    private List<SkuSwitchInfo> lastSwitches = List.of();
    public List<SkuSwitchInfo> getLastSwitches() { return lastSwitches; }

    @Transactional
    public void recalculateItemStatus(Long orderItemId) {
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(orderItemId);
        if (services.isEmpty()) return;
        OrderItemStatus newStatus = computeItemStatus(services);
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        if (newStatus != item.status()) {
            orderItemRepository.updateStatus(orderItemId, newStatus);
            orderService.recalculateOrderStatus(item.orderId());
        }
    }

    @Transactional
    public void recalculateItemPrice(Long orderItemId) {
        BigDecimal totalServicePrice = serviceInstanceRepository.sumPriceByOrderItemId(orderItemId);
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        orderItemRepository.updatePrice(orderItemId, totalServicePrice);
        orderService.recalculateTotalAmount(item.orderId());
    }

    /**
     * V10+V11: при изменении размеров пересчитываем + автозамена SKU.
     *
     * <p>Логика: для каждой услуги (не manual, не exclude) проверяем, подходит ли
     * текущая SKU к обновлённым параметрам позиции через {@link SkuService#findMatching}.
     * Если нет — ищем замену и подменяем. Возвращаем список замен для тоста на фронте.
     */
    @Transactional
    public List<SkuSwitchInfo> recalculateServicePrices(Long orderItemId) {
        OrderItem item = orderItemRepository.findById(orderItemId).orElseThrow();
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(orderItemId);
        List<SkuSwitchInfo> switches = new java.util.ArrayList<>();

        for (OrderItemServiceInstance service : services) {
            if (service.isManualPrice()) continue;
            if (service.skuId() == null) continue;
            Sku currentSku;
            try { currentSku = skuService.findById(service.skuId()); } catch (Exception e) { continue; }
            if (currentSku.excludeFromStatusCalc()) {
                // Lifecycle-SKU (доставка/приём/оформление) — не трогаем, цена от размеров не зависит
                continue;
            }

            // Проверяем: matches ли текущая SKU к обновлённым параметрам?
            boolean matches = skuService.checkMatch(currentSku, item);
            if (matches) {
                // Подходит — просто пересчитываем цену
                BigDecimal newPrice = PricingHelper.calculate(currentSku.price(), currentSku.pricingType(), item);
                serviceInstanceRepository.updateCalculatedPrice(service.id(), newPrice);
            } else {
                // Не подходит — ищем замену
                Sku replacement = skuService.findBestReplacement(currentSku, item);
                if (replacement != null) {
                    // Подменяем SKU
                    serviceInstanceRepository.switchSku(service.id(), replacement.id());
                    BigDecimal newPrice = PricingHelper.calculate(replacement.price(), replacement.pricingType(), item);
                    serviceInstanceRepository.updateCalculatedPrice(service.id(), newPrice);
                    switches.add(new SkuSwitchInfo(currentSku.name(), replacement.name(), newPrice));
                } else {
                    // Не нашли замену — пересчитываем как есть, помечать будем на фронте
                    BigDecimal newPrice = PricingHelper.calculate(currentSku.price(), currentSku.pricingType(), item);
                    serviceInstanceRepository.updateCalculatedPrice(service.id(), newPrice);
                    switches.add(new SkuSwitchInfo(currentSku.name(), null, newPrice));
                }
            }
        }
        recalculateItemPrice(orderItemId);
        return switches;
    }

    /** Информация о замене SKU для тоста на фронте. */
    public record SkuSwitchInfo(String oldSkuName, String newSkuName, BigDecimal newPrice) {
        public boolean switched() { return newSkuName != null; }
    }

    private OrderItemStatus computeItemStatus(List<OrderItemServiceInstance> services) {
        long doneCount = services.stream().filter(s -> s.status() == ServiceStatus.DONE).count();
        long cancelledCount = services.stream().filter(s -> s.status() == ServiceStatus.CANCELLED).count();
        long inProgressCount = services.stream().filter(s -> s.status() == ServiceStatus.IN_PROGRESS).count();
        long doneOrCancelledCount = doneCount + cancelledCount;
        if (doneOrCancelledCount == services.size()) {
            if (doneCount > 0) return OrderItemStatus.DONE;
            return OrderItemStatus.CANCELLED;
        }
        if (doneCount > 0) return OrderItemStatus.PARTIALLY_DONE;
        if (inProgressCount > 0) return OrderItemStatus.IN_PROGRESS;
        return OrderItemStatus.CREATED;
    }
}
