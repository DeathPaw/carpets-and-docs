package ru.carpet.service;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.ConflictException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.*;
import ru.carpet.repository.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
public class OrderService {

    private final OrderRepository repository;
    private final OrderItemRepository itemRepository;
    private final OrderStatusHistoryRepository historyRepository;
    private final OrderItemServiceInstanceRepository serviceInstanceRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final ServiceDefinitionRepository serviceDefinitionRepository;
    private final PriceListRepository priceListRepository;
    private final AuditLogService auditLogService;
    private final PricingService pricingService;
    private final OrderItemService orderItemService;
    private final OrderModifierRepository orderModifierRepository;
    private final PriceModifierRepository priceModifierRepository;
    private final ClientModifierRepository clientModifierRepository;
    private final ClientEventRepository clientEventRepository;

    public OrderService(
            OrderRepository repository,
            OrderItemRepository itemRepository,
            OrderStatusHistoryRepository historyRepository,
            OrderItemServiceInstanceRepository serviceInstanceRepository,
            ItemTypeRepository itemTypeRepository,
            ServiceDefinitionRepository serviceDefinitionRepository,
            PriceListRepository priceListRepository,
            AuditLogService auditLogService,
            PricingService pricingService,
            @Lazy OrderItemService orderItemService,
            OrderModifierRepository orderModifierRepository,
            PriceModifierRepository priceModifierRepository,
            ClientModifierRepository clientModifierRepository,
            ClientEventRepository clientEventRepository
    ) {
        this.repository = repository;
        this.itemRepository = itemRepository;
        this.historyRepository = historyRepository;
        this.serviceInstanceRepository = serviceInstanceRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.serviceDefinitionRepository = serviceDefinitionRepository;
        this.priceListRepository = priceListRepository;
        this.auditLogService = auditLogService;
        this.pricingService = pricingService;
        this.orderItemService = orderItemService;
        this.orderModifierRepository = orderModifierRepository;
        this.priceModifierRepository = priceModifierRepository;
        this.clientModifierRepository = clientModifierRepository;
        this.clientEventRepository = clientEventRepository;
    }

    public List<Order> findAll(OrderStatus status, int page, int size) {
        return repository.findAll(status, null, null, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, legacyId, null, null, null, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, Long orderId, String paymentType, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, null, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, Long orderId, String paymentType,
                               String clientPhone, String clientName, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, clientPhone, clientName, null, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, Long orderId, String paymentType,
                               String clientPhone, String clientName, String sortBy, String sortDir, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, clientPhone, clientName, sortBy, sortDir, page, size);
    }

    public long countAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, Long orderId, String paymentType,
                         String clientPhone, String clientName) {
        return repository.countAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, clientPhone, clientName);
    }

    public Order findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + id));
    }

    @Transactional
    public Order create(Long clientId, String clientName, String comment,
                        String pickupAddress, String deliveryAddress, Long legacyId) {
        Order order = repository.save(clientId, clientName, comment, pickupAddress, deliveryAddress, legacyId);
        // Автоматически добавляем позиции с is_default = true
        List<ItemType> defaults = itemTypeRepository.findDefaults();
        for (ItemType defaultType : defaults) {
            itemRepository.save(order.id(), defaultType.id(), null);
        }
        // Копируем модификаторы клиента в заказ
        if (clientId != null) {
            orderModifierRepository.copyFromClient(clientId, order.id());
        }
        // Пересчитываем сумму и дефолтные позиции
        recalculateTotalAmount(order.id());
        // Автоматически создаём событие клиента
        if (clientId != null) {
            clientEventRepository.save(clientId, "ORDER_CREATED", "Создан заказ #" + order.id());
        }
        return repository.findById(order.id()).orElseThrow();
    }

    /**
     * Пересчитывает цены дефолтных позиций (например, доставка).
     * Логика: если freeThreshold задан и сумма остальных позиций >= threshold → цена = 0,
     * иначе цена = defaultPrice.
     */
    @Transactional
    public void recalculateDefaultItemPrices(Long orderId) {
        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        List<ItemType> defaults = itemTypeRepository.findDefaults();

        for (ItemType defaultType : defaults) {
            if (defaultType.defaultPrice() == null) continue;

            // Сумма всех НЕ-дефолтных позиций
            BigDecimal nonDefaultSum = items.stream()
                    .filter(i -> !isDefaultType(i.itemTypeId(), defaults))
                    .map(OrderItem::price)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            // Найти позицию этого дефолтного типа в заказе
            items.stream()
                    .filter(i -> i.itemTypeId().equals(defaultType.id()))
                    .forEach(item -> {
                        BigDecimal newPrice;
                        if (defaultType.freeThreshold() != null
                                && nonDefaultSum.compareTo(defaultType.freeThreshold()) >= 0) {
                            newPrice = BigDecimal.ZERO;
                        } else {
                            newPrice = defaultType.defaultPrice();
                        }
                        if (newPrice.compareTo(item.price()) != 0) {
                            itemRepository.updatePrice(item.id(), newPrice);
                        }
                    });
        }

        // Пересчитываем итоговую сумму заказа
        BigDecimal total = itemRepository.sumPriceByOrderId(orderId);
        repository.updateBaseAmount(orderId, total);
        recalculateTotalWithModifiers(orderId, total);
    }

    private boolean isDefaultType(Long itemTypeId, List<ItemType> defaults) {
        return defaults.stream().anyMatch(d -> d.id().equals(itemTypeId));
    }

    /** Ручное изменение статуса заказа */
    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus) {
        Order order = findById(orderId);
        validateStatusTransition(order.status(), newStatus);
        OrderStatus oldStatus = order.status();
        repository.updateStatus(orderId, newStatus);
        historyRepository.save(orderId, oldStatus, newStatus);
        auditLogService.log("ORDER", orderId, "STATUS_CHANGE",
                "Статус заказа #" + orderId + " изменён: " + oldStatus + " → " + newStatus);
        return repository.findById(orderId).orElseThrow();
    }

    private void validateStatusTransition(OrderStatus current, OrderStatus next) {
        // Ручные переходы: LEAD→CREATED, CREATED→FOR_PICKUP, DONE→DELIVERED, любой→CANCELLED
        // IN_PROGRESS, PARTIALLY_DONE, DONE — автоматически из позиций через recalculateOrderStatus
        boolean allowed = switch (current) {
            case LEAD -> next == OrderStatus.CREATED || next == OrderStatus.CANCELLED;
            case CREATED -> next == OrderStatus.FOR_PICKUP || next == OrderStatus.CANCELLED;
            case FOR_PICKUP -> next == OrderStatus.CANCELLED;
            case IN_PROGRESS -> next == OrderStatus.CANCELLED;
            case PARTIALLY_DONE -> next == OrderStatus.CANCELLED;
            case DONE -> next == OrderStatus.DELIVERED;
            case DELIVERED -> false;
            case CANCELLED -> false;
        };
        if (!allowed) {
            throw new BusinessRuleException(
                "Переход из статуса " + current + " в " + next + " не разрешён"
            );
        }
    }

    /**
     * Автоматический пересчёт статуса заказа на основе статусов позиций.
     * Не затрагивает LEAD и DELIVERED — они управляются только вручную.
     * FOR_PICKUP может переходить в IN_PROGRESS/PARTIALLY_DONE/DONE автоматически.
     */
    @Transactional
    public void recalculateOrderStatus(Long orderId) {
        Order order = findById(orderId);
        // Не трогаем LEAD и DELIVERED
        if (order.status() == OrderStatus.LEAD || order.status() == OrderStatus.DELIVERED) {
            return;
        }

        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        if (items.isEmpty()) {
            return;
        }

        OrderStatus newStatus = computeOrderStatus(items);
        if (newStatus != null && newStatus != order.status()) {
            repository.updateStatus(orderId, newStatus);
            historyRepository.save(orderId, order.status(), newStatus);
            auditLogService.log("ORDER", orderId, "STATUS_CHANGE",
                    "Автоматическая смена статуса заказа #" + orderId + ": " + order.status() + " → " + newStatus);
        }
    }

    private OrderStatus computeOrderStatus(List<OrderItem> items) {
        // Исключаем default-позиции (доставка, оформление) — они не влияют на статус заказа
        List<ItemType> defaults = itemTypeRepository.findDefaults();
        List<OrderItem> meaningful = items.stream()
                .filter(i -> !isDefaultType(i.itemTypeId(), defaults))
                .toList();

        // Если нет значимых позиций — считаем по всем
        List<OrderItem> target = meaningful.isEmpty() ? items : meaningful;

        long doneCount = target.stream().filter(i -> i.status() == OrderItemStatus.DONE).count();
        long cancelledCount = target.stream().filter(i -> i.status() == OrderItemStatus.CANCELLED).count();
        long inProgressCount = target.stream().filter(i -> i.status() == OrderItemStatus.IN_PROGRESS).count();
        long partiallyDoneCount = target.stream().filter(i -> i.status() == OrderItemStatus.PARTIALLY_DONE).count();
        long doneOrCancelledCount = doneCount + cancelledCount;

        // Если все позиции выполнены или отменены
        if (doneOrCancelledCount == target.size()) {
            if (doneCount > 0) return OrderStatus.DONE;
            return OrderStatus.CANCELLED;
        }

        // Если есть выполненные или частично выполненные
        if (doneCount > 0 || partiallyDoneCount > 0) return OrderStatus.PARTIALLY_DONE;

        // Если есть позиции в работе
        if (inProgressCount > 0) return OrderStatus.IN_PROGRESS;

        // Все позиции ещё CREATED — не меняем статус заказа назад
        return null; // null = не менять
    }

    /** Оплата заказа */
    @Transactional
    public Order pay(Long orderId, PaymentType paymentType) {
        Order order = findById(orderId);
        if (order.paid()) {
            throw new ConflictException("Order already paid: " + orderId);
        }
        if (order.status() != OrderStatus.DONE) {
            throw new BusinessRuleException("Order must be in DONE status to be paid, current: " + order.status());
        }
        repository.pay(orderId, paymentType);
        auditLogService.log("PAYMENT", orderId, "CREATE", "Оплата заказа #" + orderId + " (" + paymentType + ")");
        return repository.findById(orderId).orElseThrow();
    }

    /** Гарантийный возврат — только из статуса DELIVERED, с выбором позиций */
    @Transactional
    public Order createWarranty(Long orderId, List<Long> itemIds, String warrantyComment) {
        Order original = findById(orderId);
        if (original.status() != OrderStatus.DELIVERED) {
            throw new BusinessRuleException("Гарантийный возврат возможен только для заказов в статусе ДОСТАВЛЕН");
        }

        // Создаём гарантийный заказ с total_amount = 0
        Order warranty = repository.saveWarranty(original.clientId(), original.clientName(), warrantyComment, orderId);

        // Копируем только выбранные позиции (с их ценами, услугами и размерами)
        List<OrderItem> allItems = itemRepository.findByOrderId(orderId);
        for (OrderItem item : allItems) {
            if (!itemIds.contains(item.id())) continue;
            OrderItem newItem = itemRepository.saveWithDimensions(
                    warranty.id(), item.itemTypeId(), item.description(),
                    item.length(), item.width(), item.weight(), item.area(), item.runningMeters()
            );
            // Копируем услуги
            List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(item.id());
            List<Long> serviceDefIds = services.stream().map(OrderItemServiceInstance::serviceDefId).toList();
            serviceInstanceRepository.saveAll(newItem.id(), serviceDefIds);
        }

        // Автоматически создаём событие клиента о гарантийном возврате
        if (original.clientId() != null) {
            clientEventRepository.save(original.clientId(), "WARRANTY", "Гарантийный возврат по заказу #" + orderId);
        }
        return repository.findById(warranty.id()).orElseThrow();
    }

    public List<Order> findWarrantyOrders(Long orderId) {
        findById(orderId); // проверяем существование
        return repository.findWarrantyOrders(orderId);
    }

    public List<OrderStatusHistory> getHistory(Long orderId) {
        return historyRepository.findByOrderId(orderId);
    }

    /** Обновление комментария заказа */
    public Order updateComment(Long orderId, String comment) {
        findById(orderId);
        repository.updateComment(orderId, comment);
        auditLogService.log("ORDER", orderId, "UPDATE", "Обновлён комментарий заказа #" + orderId);
        return repository.findById(orderId).orElseThrow();
    }

    /** Обновление деталей заказа (адреса, даты, legacy_id) */
    public Order updateDetails(Long orderId, String pickupAddress, String deliveryAddress, Long legacyId,
                               java.time.LocalDate pickupDate, String pickupTimeSlot,
                               java.time.LocalDate deliveryDate, String deliveryTimeSlot,
                               String pickupDistrict, String deliveryDistrict) {
        findById(orderId);
        repository.updateDetails(orderId, pickupAddress, deliveryAddress, legacyId,
                pickupDate, pickupTimeSlot, deliveryDate, deliveryTimeSlot, pickupDistrict, deliveryDistrict);
        auditLogService.log("ORDER", orderId, "UPDATE", "Обновлены детали заказа #" + orderId);
        return repository.findById(orderId).orElseThrow();
    }

    /** Обновление фактических дат забора/доставки */
    public Order updateActualDates(Long orderId, java.time.LocalDate actualPickupDate, String actualPickupTimeSlot,
                                   java.time.LocalDate actualDeliveryDate, String actualDeliveryTimeSlot) {
        findById(orderId);
        repository.updateActualDates(orderId, actualPickupDate, actualPickupTimeSlot, actualDeliveryDate, actualDeliveryTimeSlot);
        return repository.findById(orderId).orElseThrow();
    }

    /** Дублирование заказа — копирует все позиции, услуги, модификаторы. Новый заказ в статусе LEAD, цены из прайс-листа */
    @Transactional
    public Order duplicateOrder(Long orderId) {
        Order original = findById(orderId);
        // Создаём новый заказ
        Order newOrder = repository.save(original.clientId(), original.clientName(), original.comment(),
                original.pickupAddress(), original.deliveryAddress(), null);
        // Копируем модификаторы
        List<OrderModifier> mods = orderModifierRepository.findByOrderId(orderId);
        for (OrderModifier m : mods) {
            orderModifierRepository.add(newOrder.id(), m.modifierId(), m.modifierName(), m.percent());
        }
        // Копируем не-дефолтные позиции
        List<ItemType> defaults = itemTypeRepository.findDefaults();
        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        for (OrderItem item : items) {
            if (defaults.stream().anyMatch(d -> d.id().equals(item.itemTypeId()))) continue;
            duplicateItemInternal(newOrder.id(), item);
        }
        recalculateTotalAmount(newOrder.id());
        auditLogService.log("ORDER", newOrder.id(), "CREATE",
                "Дублирован заказ #" + orderId + " → #" + newOrder.id());
        return repository.findById(newOrder.id()).orElseThrow();
    }

    /** Дублирование позиции внутри заказа — копирует услуги с ценами из прайс-листа */
    public OrderItem duplicateItem(Long orderId, Long itemId) {
        findById(orderId);
        OrderItem original = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + itemId));
        OrderItem newItem = duplicateItemInternal(orderId, original);
        recalculateTotalAmount(orderId);
        return newItem;
    }

    private OrderItem duplicateItemInternal(Long orderId, OrderItem original) {
        OrderItem newItem = itemRepository.saveWithDimensions(
                orderId, original.itemTypeId(), original.description(),
                original.length(), original.width(), original.weight(), original.area(), original.runningMeters()
        );
        // Обновить дефекты
        if (original.defects() != null) {
            itemRepository.updateDescription(newItem.id(), original.description(), original.defects());
        }
        // Копируем услуги — цены берём из прайс-листа (актуальные)
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(original.id());
        for (OrderItemServiceInstance svc : services) {
            serviceInstanceRepository.saveAll(newItem.id(), List.of(svc.serviceDefId()));
            // Пересчитываем цену из прайс-листа
            var priceListEntry = priceListRepository.findByItemTypeIdAndServiceDefId(original.itemTypeId(), svc.serviceDefId());
            var serviceDef = serviceDefinitionRepository.findById(svc.serviceDefId()).orElse(null);
            if (priceListEntry.isPresent() && serviceDef != null) {
                OrderItem freshItem = itemRepository.findById(newItem.id()).orElseThrow();
                BigDecimal price = pricingService.calculateServicePrice(priceListEntry.get().price(), serviceDef.pricingType(), freshItem);
                List<OrderItemServiceInstance> newServices = serviceInstanceRepository.findByOrderItemId(newItem.id());
                OrderItemServiceInstance last = newServices.get(newServices.size() - 1);
                serviceInstanceRepository.updateCalculatedPrice(last.id(), price);
            }
        }
        // Пересчитать стоимость позиции
        orderItemService.recalculateItemPrice(newItem.id());
        return itemRepository.findById(newItem.id()).orElseThrow();
    }

    /** Пересчёт итоговой суммы заказа */
    public void recalculateTotalAmount(Long orderId) {
        // Сначала пересчитываем дефолтные позиции (доставка и т.п.)
        // они зависят от суммы остальных позиций
        recalculateDefaultItemPrices(orderId);
        // recalculateDefaultItemPrices сам обновляет total_amount в конце
    }

    /** Пересчёт итоговой суммы с учётом модификаторов */
    @Transactional
    public void recalculateTotalWithModifiers(Long orderId, BigDecimal baseAmount) {
        List<OrderModifier> modifiers = orderModifierRepository.findByOrderId(orderId);
        BigDecimal modifierSum = BigDecimal.ZERO;
        for (OrderModifier m : modifiers) {
            modifierSum = modifierSum.add(baseAmount.multiply(m.percent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
        }
        BigDecimal total = baseAmount.add(modifierSum);
        repository.updateTotalAmount(orderId, total);
    }

    /** Получить модификаторы заказа */
    public List<OrderModifier> getModifiers(Long orderId) {
        findById(orderId);
        return orderModifierRepository.findByOrderId(orderId);
    }

    /** Добавить модификатор к заказу */
    @Transactional
    public Order addModifier(Long orderId, Long modifierId) {
        findById(orderId);
        PriceModifier pm = priceModifierRepository.findById(modifierId)
                .orElseThrow(() -> new EntityNotFoundException("Modifier not found: " + modifierId));
        orderModifierRepository.add(orderId, modifierId, pm.name(), pm.percent());
        recalculateTotalAmount(orderId);
        return findById(orderId);
    }

    /** Удалить модификатор из заказа */
    @Transactional
    public Order removeModifier(Long orderId, Long modifierId) {
        findById(orderId);
        orderModifierRepository.removeByOrderIdAndModifierId(orderId, modifierId);
        recalculateTotalAmount(orderId);
        return findById(orderId);
    }

    /** Перенести модификаторы заказа на клиента */
    @Transactional
    public void pushModifiersToClient(Long orderId) {
        Order order = findById(orderId);
        if (order.clientId() == null) {
            throw new BusinessRuleException("Заказ не привязан к клиенту");
        }
        List<OrderModifier> orderMods = orderModifierRepository.findByOrderId(orderId);
        clientModifierRepository.removeAll(order.clientId());
        for (OrderModifier om : orderMods) {
            clientModifierRepository.add(order.clientId(), om.modifierId());
        }
    }
}
