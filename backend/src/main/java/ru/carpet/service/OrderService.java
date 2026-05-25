package ru.carpet.service;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.ConflictException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.*;
import ru.carpet.repository.*;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;

@Service
public class OrderService {

    private final OrderRepository repository;
    private final OrderItemRepository itemRepository;
    private final OrderStatusHistoryRepository historyRepository;
    private final OrderItemServiceInstanceRepository serviceInstanceRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final SkuService skuService;
    private final AuditLogService auditLogService;
    private final OrderItemService orderItemService;
    private final OrderModifierRepository orderModifierRepository;
    private final PriceModifierRepository priceModifierRepository;
    private final ClientModifierRepository clientModifierRepository;
    private final ClientEventRepository clientEventRepository;
    private final AppUserRepository userRepository;

    public OrderService(
            OrderRepository repository,
            OrderItemRepository itemRepository,
            OrderStatusHistoryRepository historyRepository,
            OrderItemServiceInstanceRepository serviceInstanceRepository,
            ItemTypeRepository itemTypeRepository,
            SkuService skuService,
            AuditLogService auditLogService,
            @Lazy OrderItemService orderItemService,
            OrderModifierRepository orderModifierRepository,
            PriceModifierRepository priceModifierRepository,
            ClientModifierRepository clientModifierRepository,
            ClientEventRepository clientEventRepository,
            AppUserRepository userRepository
    ) {
        this.repository = repository;
        this.itemRepository = itemRepository;
        this.historyRepository = historyRepository;
        this.serviceInstanceRepository = serviceInstanceRepository;
        this.itemTypeRepository = itemTypeRepository;
        this.skuService = skuService;
        this.auditLogService = auditLogService;
        this.orderItemService = orderItemService;
        this.orderModifierRepository = orderModifierRepository;
        this.priceModifierRepository = priceModifierRepository;
        this.clientModifierRepository = clientModifierRepository;
        this.clientEventRepository = clientEventRepository;
        this.userRepository = userRepository;
    }

    public List<Order> findAll(OrderStatus status, int page, int size) {
        return repository.findAll(status, null, null, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, null, page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, int page, int size) {
        return repository.findAll(status, dateFrom, dateTo, legacyId, page, size);
    }

    public List<Order> findAll(List<OrderStatus> statuses, String dateFrom, String dateTo, String dateField,
                               Long legacyId, Long orderId, String paymentType,
                               String clientPhone, String clientName, Long clientId,
                               List<String> sortBy, List<String> sortDir, int page, int size) {
        return repository.findAll(statuses, dateFrom, dateTo, dateField, legacyId, orderId, paymentType,
                clientPhone, clientName, clientId, sortBy, sortDir, page, size);
    }

    public long countAll(List<OrderStatus> statuses, String dateFrom, String dateTo, String dateField,
                         Long legacyId, Long orderId, String paymentType,
                         String clientPhone, String clientName, Long clientId) {
        return repository.countAll(statuses, dateFrom, dateTo, dateField, legacyId, orderId, paymentType,
                clientPhone, clientName, clientId);
    }

    /** Выборка по {@link ru.carpet.repository.OrderQuery} — для расширенных фильтров (noCoords и пр.). */
    public List<Order> findAll(ru.carpet.repository.OrderQuery query, int page, int size) {
        return repository.findAll(query, page, size);
    }

    public long countAll(ru.carpet.repository.OrderQuery query) {
        return repository.countAll(query);
    }

    public Order findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + id));
    }

    @Transactional
    public Order create(Long clientId, String clientName, String comment,
                        String pickupAddress, String deliveryAddress, Long legacyId) {
        Order order = repository.save(clientId, clientName, comment, pickupAddress, deliveryAddress, legacyId);
        // V10: автоматически добавляем SKU с is_auto_add=true (бывшие «default»-типы).
        // Каждый такой SKU имеет один или несколько атрибутов item_type — для каждого
        // прикрепляемого типа создаём позицию и навешиваем SKU как услугу.
        attachAutoAddSkus(order.id());
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
     * V10: автоматически прикрепляет к заказу все SKU с {@code is_auto_add=true}
     * (бывшая логика default-типов). Для каждого SKU берём первый связанный
     * item_type из его атрибутов и создаём позицию + услугу.
     */
    private void attachAutoAddSkus(Long orderId) {
        var autoSkus = skuService.findAutoAdd();
        // V11: текущий оператор из SecurityContext — для авто-назначения на «Оформление».
        Long currentEmployeeId = resolveCurrentEmployeeId();

        for (var sku : autoSkus) {
            var typeIds = sku.attributes().get("item_type");
            if (typeIds == null || typeIds.isEmpty()) continue;
            Long itemTypeId;
            try { itemTypeId = Long.parseLong(typeIds.get(0)); }
            catch (NumberFormatException e) { continue; }
            OrderItem item = itemRepository.save(orderId, itemTypeId, null);
            BigDecimal price = sku.price() == null ? BigDecimal.ZERO : sku.price();
            Long serviceId = serviceInstanceRepository.saveOne(item.id(), sku.id(), price);
            itemRepository.updatePrice(item.id(), price);

            // V11: если у SKU есть auto_complete_on_status (lifecycle SKU) и мы знаем employee_id
            // текущего оператора — назначаем его исполнителем сразу. Иначе услуге не сменить статус
            // (валидация требует хотя бы одного исполнителя).
            if (currentEmployeeId != null && sku.autoCompleteOnStatus() != null) {
                serviceInstanceRepository.assignEmployee(serviceId, currentEmployeeId);
            }
        }
    }

    /**
     * V11: достаёт employee_id текущего пользователя из SecurityContext → users.employee_id.
     * Если пользователь не привязан к сотруднику — null.
     */
    private Long resolveCurrentEmployeeId() {
        try {
            String username = ru.carpet.audit.AuditUser.current();
            if ("system".equals(username)) return null;
            return userRepository.findByUsername(username)
                    .map(ru.carpet.model.AppUser::employeeId)
                    .orElse(null);
        } catch (Exception e) { return null; }
    }

    /**
     * Пересчитывает цены auto-add позиций с учётом {@code sku.free_threshold}:
     * если базовая сумма НЕ auto-add позиций ≥ free_threshold — цена становится 0.
     */
    @Transactional
    public void recalculateDefaultItemPrices(Long orderId) {
        var autoSkus = skuService.findAutoAdd();
        if (autoSkus.isEmpty()) {
            BigDecimal total = itemRepository.sumPriceByOrderId(orderId);
            repository.updateBaseAmount(orderId, total);
            recalculateTotalWithModifiers(orderId, total);
            return;
        }
        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        // Все услуги заказа, чтобы по sku_id определить auto-add позиции.
        var allServices = serviceInstanceRepository.findByOrderItemIds(
                items.stream().map(OrderItem::id).toList());
        java.util.Set<Long> autoSkuIds = new java.util.HashSet<>();
        for (var s : autoSkus) autoSkuIds.add(s.id());
        // Определяем для каждой позиции — auto или нет (по её первой услуге).
        java.util.Map<Long, Long> itemToSkuId = new java.util.HashMap<>();
        for (var svc : allServices) {
            itemToSkuId.putIfAbsent(svc.orderItemId(), svc.skuId());
        }
        // Сумма не-auto-add позиций — база для проверки free_threshold.
        BigDecimal nonAutoSum = items.stream()
                .filter(i -> !autoSkuIds.contains(itemToSkuId.get(i.id())))
                .map(OrderItem::price)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // Пересчёт цены каждой auto-add позиции по free_threshold.
        for (var sku : autoSkus) {
            if (sku.freeThreshold() == null) continue;
            for (var item : items) {
                if (!java.util.Objects.equals(itemToSkuId.get(item.id()), sku.id())) continue;
                BigDecimal newPrice = nonAutoSum.compareTo(sku.freeThreshold()) >= 0
                        ? BigDecimal.ZERO
                        : (sku.price() == null ? BigDecimal.ZERO : sku.price());
                if (newPrice.compareTo(item.price()) != 0) {
                    itemRepository.updatePrice(item.id(), newPrice);
                }
            }
        }
        BigDecimal total = itemRepository.sumPriceByOrderId(orderId);
        repository.updateBaseAmount(orderId, total);
        recalculateTotalWithModifiers(orderId, total);
    }

    /** Ручное изменение статуса заказа (без причины — для не-CANCELLED). */
    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus) {
        return updateStatus(orderId, newStatus, null);
    }

    /** Ручное изменение статуса заказа. При CANCELLED reason обязателен (≥ 10 символов после trim). */
    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus, String cancellationReason) {
        Order order = findById(orderId);
        validateStatusTransition(order.status(), newStatus);
        // DELIVERED можно ставить только если назначена фактическая дата доставки —
        // иначе оператор «забыл прокликать» в Логистике, и аналитика по доставкам поедет.
        if (newStatus == OrderStatus.DELIVERED && order.actualDeliveryDate() == null) {
            throw new BusinessRuleException(
                "Нельзя перевести заказ в «Доставлен», пока не указана фактическая дата доставки. " +
                "Назначьте её в разделе «Логистика и детали» или перетащите карточку на нужный день в Логистике."
            );
        }
        // Для отмены требуем причину минимум 10 символов.
        String reasonTrimmed = cancellationReason == null ? "" : cancellationReason.trim();
        if (newStatus == OrderStatus.CANCELLED && reasonTrimmed.length() < 10) {
            throw new BusinessRuleException(
                "Для отмены заказа укажите причину (минимум 10 символов)."
            );
        }
        OrderStatus oldStatus = order.status();
        if (newStatus == OrderStatus.CANCELLED) {
            repository.updateStatusWithReason(orderId, newStatus, reasonTrimmed);
        } else {
            repository.updateStatus(orderId, newStatus);
        }
        historyRepository.save(orderId, oldStatus, newStatus);
        auditLogService.log("ORDER", orderId, "STATUS_CHANGE",
                "Статус заказа #" + orderId + " изменён: " + oldStatus + " → " + newStatus
                        + (newStatus == OrderStatus.CANCELLED ? " (причина: " + reasonTrimmed + ")" : ""));

        // V11 lifecycle: авто-завершаем услуги, у которых SKU.auto_complete_on_status = newStatus.
        // Например, LEAD → CREATED → услуга «Оформление» (auto_complete_on_status=CREATED) → DONE.
        autoCompleteServicesOnOrderStatus(orderId, newStatus);

        return repository.findById(orderId).orElseThrow();
    }

    private void validateStatusTransition(OrderStatus current, OrderStatus next) {
        // Ручные переходы: LEAD→CREATED, CREATED→FOR_PICKUP, DONE→DELIVERED, DELIVERED→COMPLETED (через оплату), любой активный→CANCELLED
        // IN_PROGRESS, PARTIALLY_DONE, DONE — автоматически из позиций через recalculateOrderStatus
        boolean allowed = switch (current) {
            case LEAD -> next == OrderStatus.CREATED || next == OrderStatus.CANCELLED;
            case CREATED -> next == OrderStatus.FOR_PICKUP || next == OrderStatus.CANCELLED;
            case FOR_PICKUP -> next == OrderStatus.CANCELLED;
            case IN_PROGRESS -> next == OrderStatus.CANCELLED;
            case PARTIALLY_DONE -> next == OrderStatus.CANCELLED;
            case DONE -> next == OrderStatus.DELIVERED;
            case DELIVERED -> next == OrderStatus.COMPLETED; // только через оплату; см. pay()
            // PARTIALLY_DELIVERED ставится автоматически из delivery_state позиций
            // (Спринт V9). Ручной переход — только в DELIVERED (когда оператор
            // решил «всё ок, потеря закрыта гарантией») или COMPLETED через оплату.
            case PARTIALLY_DELIVERED -> next == OrderStatus.DELIVERED || next == OrderStatus.COMPLETED;
            case COMPLETED -> false;                          // финальный — никаких изменений
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
        // Не трогаем LEAD, DELIVERED и COMPLETED — они управляются только вручную/через оплату.
        if (order.status() == OrderStatus.LEAD
                || order.status() == OrderStatus.DELIVERED
                || order.status() == OrderStatus.COMPLETED) {
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

    /**
     * V11: вычисляет статус заказа, учитывая {@code exclude_from_status_calc} на SKU.
     * Позиции, ВСЕ услуги которых ссылаются на SKU с exclude=true, не участвуют
     * в подсчёте. Если значимых позиций нет — считаем по всем.
     */
    private OrderStatus computeOrderStatus(List<OrderItem> items) {
        // Собираем ID исключённых позиций через SQL (exclude_from_status_calc = TRUE на SKU).
        // Это дешевле, чем грузить все услуги: один запрос.
        Set<Long> excludedItemIds = findExcludedItemIds(items);

        List<OrderItem> meaningful = items.stream()
                .filter(i -> !excludedItemIds.contains(i.id()))
                .toList();
        List<OrderItem> target = meaningful.isEmpty() ? items : meaningful;

        long doneCount = target.stream().filter(i -> i.status() == OrderItemStatus.DONE).count();
        long cancelledCount = target.stream().filter(i -> i.status() == OrderItemStatus.CANCELLED).count();
        long inProgressCount = target.stream().filter(i -> i.status() == OrderItemStatus.IN_PROGRESS).count();
        long partiallyDoneCount = target.stream().filter(i -> i.status() == OrderItemStatus.PARTIALLY_DONE).count();
        long doneOrCancelledCount = doneCount + cancelledCount;

        if (doneOrCancelledCount == target.size()) {
            if (doneCount > 0) return OrderStatus.DONE;
            return OrderStatus.CANCELLED;
        }
        if (doneCount > 0 || partiallyDoneCount > 0) return OrderStatus.PARTIALLY_DONE;
        if (inProgressCount > 0) return OrderStatus.IN_PROGRESS;
        return null;
    }

    /**
     * Возвращает ID позиций, которые привязаны к SKU с {@code exclude_from_status_calc = TRUE}.
     * Позиция «исключена», если ХОТЯ БЫ ОДНА её услуга ссылается на такую SKU.
     */
    private Set<Long> findExcludedItemIds(List<OrderItem> items) {
        if (items.isEmpty()) return Set.of();
        var ids = items.stream().map(OrderItem::id).toList();
        var rows = itemRepository.getJdbc().queryForList(
                "SELECT DISTINCT ois.order_item_id " +
                "FROM order_item_services ois " +
                "JOIN skus s ON s.id = ois.sku_id AND s.exclude_from_status_calc = TRUE " +
                "WHERE ois.order_item_id IN (:ids)",
                new MapSqlParameterSource("ids", ids));
        return rows.stream()
                .map(r -> ((Number) r.get("order_item_id")).longValue())
                .collect(java.util.stream.Collectors.toSet());
    }

    /**
     * V11 lifecycle: при смене статуса заказа находим все услуги с
     * {@code SKU.auto_complete_on_status = newStatus} и ставим им DONE.
     * Например, заказ LEAD→CREATED → услуга «Оформление» (auto_complete_on_status=CREATED) → DONE.
     */
    private void autoCompleteServicesOnOrderStatus(Long orderId, OrderStatus newStatus) {
        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        for (OrderItem item : items) {
            var services = serviceInstanceRepository.findByOrderItemId(item.id());
            for (var svc : services) {
                if (svc.status() == ServiceStatus.DONE || svc.status() == ServiceStatus.CANCELLED) continue;
                if (svc.skuId() == null) continue;
                try {
                    Sku sku = skuService.findById(svc.skuId());
                    if (sku.autoCompleteOnStatus() != null
                            && sku.autoCompleteOnStatus().equals(newStatus.name())) {
                        serviceInstanceRepository.updateStatus(svc.id(), ServiceStatus.DONE);
                        // Пересчитываем статус позиции
                        orderItemService.recalculateItemStatus(item.id());
                    }
                } catch (Exception ignored) {}
            }
        }
    }

    /**
     * V11 lifecycle: когда услуга с {@code SKU.triggers_order_status} завершается,
     * переводим заказ в этот статус. Вызывается из
     * {@link OrderItemServiceInstanceService#updateStatus}.
     */
    public void checkServiceTrigger(Long orderItemId, Long skuId) {
        if (skuId == null) return;
        try {
            Sku sku = skuService.findById(skuId);
            if (sku.triggersOrderStatus() == null) return;
            OrderItem item = itemRepository.findById(orderItemId).orElse(null);
            if (item == null) return;
            OrderStatus targetStatus = OrderStatus.valueOf(sku.triggersOrderStatus());
            Order order = findById(item.orderId());
            // Не понижаем статус (например, не переводим DELIVERED→CREATED)
            if (order.status().ordinal() >= targetStatus.ordinal()) return;
            repository.updateStatus(item.orderId(), targetStatus);
            historyRepository.save(item.orderId(), order.status(), targetStatus);
            auditLogService.log("ORDER", item.orderId(), "LIFECYCLE_TRIGGER",
                    "SKU «" + sku.name() + "» завершена → заказ #" + item.orderId() + " → " + targetStatus);
        } catch (Exception ignored) {}
    }

    /** Оплата заказа */
    @Transactional
    public Order pay(Long orderId, PaymentType paymentType) {
        Order order = findById(orderId);
        if (order.paid()) {
            throw new ConflictException("Order already paid: " + orderId);
        }
        // Оплачивать можно только заказ, который реально доставлен клиенту.
        if (order.status() != OrderStatus.DELIVERED) {
            throw new BusinessRuleException(
                "Оплата возможна только в статусе «Доставлен». Текущий статус: " + order.status()
            );
        }
        repository.pay(orderId, paymentType);
        // После оплаты заказ переходит в финальный статус — изменения и отмена больше невозможны.
        repository.updateStatus(orderId, OrderStatus.COMPLETED);
        historyRepository.save(orderId, OrderStatus.DELIVERED, OrderStatus.COMPLETED);
        auditLogService.log("PAYMENT", orderId, "CREATE",
                "Оплата заказа #" + orderId + " (" + paymentType + ") — переведён в COMPLETED");
        return repository.findById(orderId).orElseThrow();
    }

    /** Гарантийный возврат — только из DELIVERED или COMPLETED, с выбором позиций */
    @Transactional
    public Order createWarranty(Long orderId, List<Long> itemIds, String warrantyComment) {
        Order original = findById(orderId);
        if (original.status() != OrderStatus.DELIVERED && original.status() != OrderStatus.COMPLETED) {
            throw new BusinessRuleException("Гарантийный возврат возможен только для заказов в статусе ДОСТАВЛЕН или ЗАВЕРШЁН");
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
            // V10: копируем услуги через sku_id
            List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(item.id());
            List<Long> skuIds = services.stream()
                    .map(OrderItemServiceInstance::skuId)
                    .filter(java.util.Objects::nonNull)
                    .toList();
            serviceInstanceRepository.saveAll(newItem.id(), skuIds);
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

    /**
     * Гард на изменения: запрещаем мутации в финальных статусах (COMPLETED, CANCELLED).
     * Кидает 422 BusinessRuleException с человеческим сообщением.
     */
    private void assertEditable(Order order) {
        if (order.status() == OrderStatus.COMPLETED) {
            throw new BusinessRuleException(
                "Заказ в статусе ЗАВЕРШЁН — изменения запрещены. Создайте дубль или гарантийный возврат."
            );
        }
        if (order.status() == OrderStatus.CANCELLED) {
            throw new BusinessRuleException(
                "Заказ отменён — изменения запрещены."
            );
        }
    }

    /**
     * Обновление комментария заказа. Разрешено даже в COMPLETED — оператору иногда нужно
     * добавить пометку «клиент жаловался», «фото в чате» уже после закрытия.
     * В CANCELLED тоже разрешаем — там комментарий может пояснить причину/обстоятельства.
     */
    public Order updateComment(Long orderId, String comment) {
        findById(orderId);
        repository.updateComment(orderId, comment);
        auditLogService.log("ORDER", orderId, "UPDATE", "Обновлён комментарий заказа #" + orderId);
        return repository.findById(orderId).orElseThrow();
    }

    /** Обновление деталей заказа (адреса, даты, legacy_id, координаты) */
    public Order updateDetails(Long orderId, String pickupAddress, String deliveryAddress, Long legacyId,
                               java.time.LocalDate pickupDate, String pickupTimeSlot,
                               java.time.LocalDate deliveryDate, String deliveryTimeSlot,
                               String pickupDistrict, String deliveryDistrict,
                               BigDecimal pickupLat, BigDecimal pickupLon,
                               BigDecimal deliveryLat, BigDecimal deliveryLon) {
        Order order = findById(orderId);
        assertEditable(order);
        repository.updateDetails(orderId, pickupAddress, deliveryAddress, legacyId,
                pickupDate, pickupTimeSlot, deliveryDate, deliveryTimeSlot,
                pickupDistrict, deliveryDistrict,
                pickupLat, pickupLon, deliveryLat, deliveryLon);
        auditLogService.log("ORDER", orderId, "UPDATE", "Обновлены детали заказа #" + orderId);
        return repository.findById(orderId).orElseThrow();
    }

    /** Обновление фактических дат забора/доставки. Разрешено в DELIVERED — иначе оператор не сможет
     *  поставить дату «задним числом» перед оплатой. В COMPLETED уже нельзя. */
    public Order updateActualDates(Long orderId, java.time.LocalDate actualPickupDate, String actualPickupTimeSlot,
                                   java.time.LocalDate actualDeliveryDate, String actualDeliveryTimeSlot) {
        Order order = findById(orderId);
        if (order.status() == OrderStatus.COMPLETED) {
            throw new BusinessRuleException("Заказ в статусе ЗАВЕРШЁН — изменения запрещены.");
        }
        if (order.status() == OrderStatus.CANCELLED) {
            throw new BusinessRuleException("Заказ отменён — изменения запрещены.");
        }
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
        // V10: копируем позиции, кроме тех, что используют auto-add SKU
        // (доставка/приём — они уже автоматически добавились в новый заказ).
        java.util.Set<Long> autoSkuIds = new java.util.HashSet<>();
        for (var s : skuService.findAutoAdd()) autoSkuIds.add(s.id());
        List<OrderItem> items = itemRepository.findByOrderId(orderId);
        var allServices = serviceInstanceRepository.findByOrderItemIds(
                items.stream().map(OrderItem::id).toList());
        java.util.Map<Long, Long> itemToFirstSku = new java.util.HashMap<>();
        for (var svc : allServices) itemToFirstSku.putIfAbsent(svc.orderItemId(), svc.skuId());
        for (OrderItem item : items) {
            Long itemSkuId = itemToFirstSku.get(item.id());
            if (itemSkuId != null && autoSkuIds.contains(itemSkuId)) continue;
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
        if (original.defects() != null) {
            itemRepository.updateDescription(newItem.id(), original.description(), original.defects());
        }
        // V10: копируем услуги вместе с sku_id — цена пересчитывается через PricingHelper.
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(original.id());
        for (OrderItemServiceInstance svc : services) {
            if (svc.skuId() == null) continue;
            ru.carpet.model.Sku sku = null;
            try { sku = skuService.findById(svc.skuId()); } catch (Exception ignored) {}
            if (sku == null) continue;
            OrderItem freshItem = itemRepository.findById(newItem.id()).orElseThrow();
            BigDecimal newPrice = PricingHelper.calculate(sku.price(), sku.pricingType(), freshItem);
            Long newSvcId = serviceInstanceRepository.saveOne(newItem.id(), svc.skuId(), newPrice);
            if (newSvcId != null) {
                serviceInstanceRepository.updateCalculatedPrice(newSvcId, newPrice);
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
