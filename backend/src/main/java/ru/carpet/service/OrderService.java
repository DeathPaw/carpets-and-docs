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
    private final NotificationService notificationService;
    private final PresenceService presenceService;
    /** V45: возвраты и компенсации по претензиям (правка №3 от 19.09). */
    private final OrderRefundRepository refundRepository;
    /** V46: справочник причин отмены (правка №3 от 13.09). */
    private final CancellationReasonRepository cancellationReasonRepository;
    /** ТЗ v2: точки водителя следуют за датами выезда. */
    private final PayrollService payrollService;
    private final DeliveryZoneService deliveryZoneService;

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
            AppUserRepository userRepository,
            NotificationService notificationService,
            PresenceService presenceService,
            OrderRefundRepository refundRepository,
            CancellationReasonRepository cancellationReasonRepository,
            PayrollService payrollService,
            DeliveryZoneService deliveryZoneService
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
        this.notificationService = notificationService;
        this.presenceService = presenceService;
        this.refundRepository = refundRepository;
        this.cancellationReasonRepository = cancellationReasonRepository;
        this.payrollService = payrollService;
        this.deliveryZoneService = deliveryZoneService;
    }

    /**
     * Уведомление операторам/админам о событии заказа. Логика:
     *  • не дублируем автору действия (selfUsername),
     *  • не шлём тем, кто сейчас смотрит страницу этого заказа (PresenceService),
     *  • в первую очередь шлём «закреплённому» оператору-оформителю (assignedOperatorId),
     *  • всем остальным OPERATOR/ADMIN/SUPERVISOR — общий broadcast.
     */
    private void notifyOperators(String type, String message, String entityType, Long entityId,
                                 Long assignedOperatorEmployeeId) {
        String selfUsername = null;
        try { selfUsername = ru.carpet.audit.AuditUser.current(); } catch (Exception ignored) {}

        // ID пользователя-оформителя (если у заказа есть assigned_operator_id) — таргетная цель.
        Long primaryTargetUserId = null;
        if (assignedOperatorEmployeeId != null) {
            primaryTargetUserId = userRepository.findByEmployeeId(assignedOperatorEmployeeId)
                    .map(u -> u.id()).orElse(null);
        }

        for (var u : userRepository.findActiveOperatorsAndAdmins()) {
            if (selfUsername != null && selfUsername.equals(u.username())) continue;
            // «ORDER»-уведомления подавляем, если пользователь сейчас на странице этого заказа.
            if ("ORDER".equals(entityType) && entityId != null && presenceService.isViewing(u.id(), entityId)) continue;
            // Если есть закреплённый оператор — шлём ТОЛЬКО ему (плюс админам/супервайзерам,
            // чтобы они тоже видели — но НЕ другим операторам, иначе спам).
            if (primaryTargetUserId != null && "OPERATOR".equals(u.role())
                    && !u.id().equals(primaryTargetUserId)) continue;
            try {
                notificationService.createNotification(u.id(), type, message, entityType, entityId);
            } catch (Exception ignored) {}
        }
    }

    /** Перегрузка без явного оператора — broadcast всем (используется для новых заказов). */
    private void notifyOperators(String type, String message, String entityType, Long entityId) {
        notifyOperators(type, message, entityType, entityId, null);
    }

    /** Уведомление только админам — для проблемных заказов. */
    private void notifyAdmins(String type, String message, String entityType, Long entityId) {
        String selfUsername = null;
        try { selfUsername = ru.carpet.audit.AuditUser.current(); } catch (Exception ignored) {}
        for (var u : userRepository.findActiveOperatorsAndAdmins()) {
            if (!"ADMIN".equals(u.role()) && !"SUPERVISOR".equals(u.role())) continue;
            if (selfUsername != null && selfUsername.equals(u.username())) continue;
            if ("ORDER".equals(entityType) && entityId != null && presenceService.isViewing(u.id(), entityId)) continue;
            try {
                notificationService.createNotification(u.id(), type, message, entityType, entityId);
            } catch (Exception ignored) {}
        }
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

    /** V46: плоские строки для выгрузки в Excel (правка №3 от 13.09). */
    public List<java.util.Map<String, Object>> exportRows(ru.carpet.repository.OrderQuery query, int limit) {
        return repository.exportRows(query, limit);
    }

    public Order findById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Order not found: " + id));
    }

    @Transactional
    public Order create(Long clientId, String clientName, String comment,
                        String pickupAddress, String deliveryAddress, Long legacyId) {
        return create(clientId, clientName, comment, pickupAddress, deliveryAddress, legacyId, null);
    }

    @Transactional
    public Order create(Long clientId, String clientName, String comment,
                        String pickupAddress, String deliveryAddress, Long legacyId,
                        java.time.LocalDateTime createdAt) {
        Order order = repository.save(clientId, clientName, comment, pickupAddress, deliveryAddress, legacyId);
        auditLogService.log("ORDER", order.id(), "CREATE", "Создан заказ " + orderNo(order.id()) + " · " + clientName
                + (legacyId != null ? " (перенос из старой системы, ID " + legacyId + ")" : ""));
        // V5: при импорте из старой системы оператор может указать дату создания в прошлом.
        // Разрешено только если задан legacy_id (=это импорт), иначе игнорируем.
        if (legacyId != null && createdAt != null) {
            itemRepository.getJdbc().update(
                "UPDATE orders SET created_at = :ts WHERE id = :id",
                java.util.Map.of("ts", java.sql.Timestamp.valueOf(createdAt), "id", order.id()));
        }
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
        // V17: если текущий пользователь — оператор/админ/супервайзер с привязанным
        // employee — закрепляем его как «оформителя» заказа. По нему дальше пойдут
        // персональные уведомления о смене статуса.
        Long currentEmployeeId = resolveCurrentEmployeeId();
        if (currentEmployeeId != null) {
            repository.setAssignedOperator(order.id(), currentEmployeeId);
        }
        // V17: проблемный клиент → уведомление админам. Не используем notifyOperators —
        // эти алерты только для контрольной роли.
        if (clientId != null) {
            try {
                String isProblem = itemRepository.getJdbc().queryForObject(
                        "SELECT is_problem::text FROM clients WHERE id = :id",
                        java.util.Map.of("id", clientId), String.class);
                if ("true".equals(isProblem)) {
                    notifyAdmins("ORDER_PROBLEM_CLIENT",
                            "Заказ #" + String.format("%05d", order.id()) + " от проблемного клиента: " + clientName,
                            "ORDER", order.id());
                }
            } catch (Exception ignored) {}
        }
        // Уведомление о новом заказе: оператору-оформителю (если есть) + админам.
        notifyOperators(
            "ORDER_CREATED",
            "Новый заказ #" + String.format("%05d", order.id()) + " от " + clientName,
            "ORDER",
            order.id(),
            currentEmployeeId
        );
        return repository.findById(order.id()).orElseThrow();
    }

    /**
     * V10: автоматически прикрепляет к заказу все SKU с {@code is_auto_add=true}
     * (бывшая логика default-типов). Для каждого SKU берём первый связанный
     * item_type из его атрибутов и создаём позицию + услугу.
     */
    /**
     * V20: одна auto-add SKU = одна позиция (description = название SKU, одна услуга внутри).
     * После V20 миграции auto-add'ом помечены 3 SKU: Прием, Доставка, Оформление —
     * каждая порождает отдельную позицию с одной одноимённой услугой. Существующие заказы
     * не трогаем (attachAutoAddSkus вызывается только при создании).
     */
    private void attachAutoAddSkus(Long orderId) {
        var autoSkus = skuService.findAutoAdd();
        Long currentEmployeeId = resolveCurrentEmployeeId();

        for (var sku : autoSkus) {
            // item_type подтягивается из атрибута самой SKU.
            Long itemTypeId = resolveDeliveryItemTypeId(java.util.List.of(sku));
            if (itemTypeId == null) continue;
            OrderItem item = itemRepository.save(orderId, itemTypeId, sku.name());
            attachLifecycleSkus(item.id(), java.util.List.of(sku), currentEmployeeId);
        }
    }

    /** Определяет item_type «Доставка» по атрибутам auto-add SKU (обычно id=12). */
    private Long resolveDeliveryItemTypeId(java.util.List<ru.carpet.model.Sku> autoSkus) {
        for (var sku : autoSkus) {
            var typeIds = sku.attributes().get("item_type");
            if (typeIds != null && !typeIds.isEmpty()) {
                try { return Long.parseLong(typeIds.get(0)); } catch (NumberFormatException e) {}
            }
        }
        return null;
    }

    /** Подвесить набор SKU как услуги на позицию + проставить начальную цену позиции. */
    private void attachLifecycleSkus(Long itemId, java.util.List<ru.carpet.model.Sku> skus,
                                     Long currentEmployeeId) {
        BigDecimal totalPrice = BigDecimal.ZERO;
        for (var sku : skus) {
            BigDecimal price = sku.price() == null ? BigDecimal.ZERO : sku.price();
            Long serviceId = serviceInstanceRepository.saveOne(itemId, sku.id(), price);
            totalPrice = totalPrice.add(price);
            // V17/V21: услуга «Оформление» (triggers_order_status='CREATED') —
            // автоназначаем оператора-создателя как исполнителя.
            // Раньше тут стояла проверка sku.autoCompleteOnStatus(), но у «Оформление»
            // оно с V16 было NULL — поэтому автоназначение не срабатывало.
            if (currentEmployeeId != null && "CREATED".equals(sku.triggersOrderStatus())) {
                serviceInstanceRepository.assignEmployee(serviceId, currentEmployeeId);
            }
        }
        itemRepository.updatePrice(itemId, totalPrice);
    }

    /**
     * V18: свап платной услуги Доставка ↔ Самовывоз на позиции. Используется кнопкой
     * «Заменить на самовывоз» / «Вернуть платную». Старая услуга отменяется (CANCELLED),
     * новая добавляется. Цена позиции пересчитывается через recalculateItemPrice.
     */
    @Transactional
    public ru.carpet.model.OrderItemServiceInstance swapDeliveryService(
            Long orderItemId, Long oldServiceId, Long newSkuId) {
        var oldSvc = serviceInstanceRepository.findById(oldServiceId)
                .orElseThrow(() -> new EntityNotFoundException("Service not found: " + oldServiceId));
        // Отменяем старую (минимально — с reason, иначе бизнес-валидация на CANCELLED ругается).
        serviceInstanceRepository.updateStatusWithReason(oldServiceId, ServiceStatus.CANCELLED,
                "Заменено на альтернативный способ доставки");
        // V42: новая услуга встаёт по прайсу заказа — замена доставки на самовывоз
        // и обратно не должна переоценивать заказ по свежему прайсу.
        var newSkuAsOf = skuService.findAsOf(newSkuId, orderItemService.priceDateOfItem(orderItemId));
        var newSku = newSkuAsOf.sku();
        BigDecimal price = newSku.price() == null ? BigDecimal.ZERO : newSku.price();
        Long newServiceId = serviceInstanceRepository.saveOne(orderItemId, newSkuId, price, newSkuAsOf.versionId());
        orderItemService.recalculateItemPrice(orderItemId);
        String oldName = skuNameOr(oldSvc.skuId(), "услуга #" + oldServiceId);
        itemRepository.findById(orderItemId).ifPresent(item -> auditLogService.log("ORDER", item.orderId(), "LOGISTICS",
                "Заказ " + orderNo(item.orderId()) + ": «" + oldName + "» заменена на «" + newSku.name() + "»"));
        return serviceInstanceRepository.findById(newServiceId).orElseThrow();
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
        // V42: цена приёма/доставки и порог бесплатной доставки — тоже по прайсу
        // заказа: иначе старый заказ при любом пересчёте получал новую доставку.
        Order orderForPrices = repository.findById(orderId).orElse(null);
        java.time.LocalDate priceDate = orderForPrices == null ? null : orderForPrices.priceDate();
        var autoSkus = skuService.findAutoAdd().stream()
                .map(s -> skuService.findAsOf(s.id(), priceDate).sku())
                .toList();
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
        // Определяем для каждой позиции — auto или нет — по её АКТИВНОЙ услуге.
        // CANCELLED игнорируем: после свапа Доставка→Самовывоз исходная Доставка
        // (auto-add) остаётся в позиции отменённой, а активная — Самовывоз (не auto-add).
        // Без фильтра по статусу putIfAbsent цеплял первую CANCELLED Доставку и
        // ошибочно считал позицию auto-add, перезатирая её цену через free_threshold.
        java.util.Map<Long, Long> itemToSkuId = new java.util.HashMap<>();
        // ПР-012: позиции, где оператор задал цену приёма/доставки вручную (в т.ч. 0 ₽).
        // Их цену порог бесплатности не трогает — она равна сумме услуг, как у любой позиции.
        java.util.Set<Long> manualItems = new java.util.HashSet<>();
        for (var svc : allServices) {
            if (svc.status() == ServiceStatus.CANCELLED) continue;
            itemToSkuId.putIfAbsent(svc.orderItemId(), svc.skuId());
            if (Boolean.TRUE.equals(svc.isManualPrice())) manualItems.add(svc.orderItemId());
        }
        // Сумма не-auto-add позиций (без отменённых) — база для проверки free_threshold.
        BigDecimal nonAutoSum = items.stream()
                .filter(i -> i.status() != OrderItemStatus.CANCELLED)
                .filter(i -> !autoSkuIds.contains(itemToSkuId.get(i.id())))
                .map(OrderItem::price)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // ПР-018: промокод «бесплатная доставка» обнуляет позиции приёма/доставки
        // целиком — и автоматические, и с ручной ценой. Сколько это сэкономило
        // клиенту, пишем в скидку заказа для отчётов.
        List<OrderModifier> freeDeliveryMods = orderModifierRepository.findByOrderId(orderId).stream()
                .filter(m -> "FREE_DELIVERY".equals(m.kind())).toList();
        boolean freeDelivery = !freeDeliveryMods.isEmpty();
        BigDecimal freed = BigDecimal.ZERO;
        // Пересчёт цены каждой auto-add позиции по free_threshold.
        for (var sku : autoSkus) {
            for (var item : items) {
                if (!java.util.Objects.equals(itemToSkuId.get(item.id()), sku.id())) continue;
                if (item.status() == OrderItemStatus.CANCELLED) continue;
                BigDecimal price;
                if (manualItems.contains(item.id())) {
                    // Ручная цена — это сумма услуг позиции (ПР-012).
                    price = serviceInstanceRepository.sumPriceByOrderItemId(item.id());
                } else if (zoneLegPrice(orderForPrices, sku, nonAutoSum) != null) {
                    // ПР-006: приём и доставка по зоне адреса и сумме стирки.
                    price = zoneLegPrice(orderForPrices, sku, nonAutoSum);
                } else if (sku.freeThreshold() == null) {
                    price = item.price();
                } else {
                    price = nonAutoSum.compareTo(sku.freeThreshold()) >= 0
                            ? BigDecimal.ZERO
                            : (sku.price() == null ? BigDecimal.ZERO : sku.price());
                }
                if (price == null) price = BigDecimal.ZERO;
                BigDecimal newPrice = price;
                if (freeDelivery) {
                    freed = freed.add(price);
                    newPrice = BigDecimal.ZERO;
                }
                if (newPrice.compareTo(item.price()) != 0) {
                    itemRepository.updatePrice(item.id(), newPrice);
                }
            }
        }
        BigDecimal total = itemRepository.sumPriceByOrderId(orderId);
        repository.updateBaseAmount(orderId, total);
        recalculateTotalWithModifiers(orderId, total);
        for (OrderModifier m : freeDeliveryMods) {
            orderModifierRepository.updateDiscountAmount(m.id(), freed.negate());
        }
    }

    /**
     * ПР-006: цена поездки по зоне. Забор — позиция с SKU, который переводит
     * заказ в IN_PROGRESS (Приём), отвоз — в DELIVERED (Доставка). Координаты
     * берём своего этапа, иначе второго. null — зоны не действуют для заказа,
     * адрес без координат или вне зон: тогда цена по SKU и порогу, как раньше.
     */
    private BigDecimal zoneLegPrice(Order order, ru.carpet.model.Sku sku, BigDecimal cleaningSum) {
        if (order == null || !deliveryZoneService.appliesTo(order.priceDate())) return null;
        boolean pickup = "IN_PROGRESS".equals(sku.triggersOrderStatus());
        boolean delivery = "DELIVERED".equals(sku.triggersOrderStatus());
        if (!pickup && !delivery) return null;
        return legZone(order, pickup)
                .map(z -> DeliveryZoneService.legPrice(z, cleaningSum))
                .orElse(null);
    }

    /** Зона этапа заказа: координаты своего этапа, иначе второго. */
    public java.util.Optional<DeliveryZoneService.ZoneInfo> legZone(Order order, boolean pickup) {
        BigDecimal lat = pickup ? order.pickupLat() : order.deliveryLat();
        BigDecimal lon = pickup ? order.pickupLon() : order.deliveryLon();
        if (lat == null || lon == null) {
            lat = pickup ? order.deliveryLat() : order.pickupLat();
            lon = pickup ? order.deliveryLon() : order.pickupLon();
        }
        return deliveryZoneService.find(lat, lon);
    }

    /** ПР-006: зоны забора и отвоза заказа — для показа в карточке. */
    public java.util.Map<String, Object> deliveryZones(Long orderId) {
        Order order = findById(orderId);
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("applies", deliveryZoneService.appliesTo(order.priceDate()));
        legZone(order, true).ifPresent(z -> result.put("pickup", z));
        legZone(order, false).ifPresent(z -> result.put("delivery", z));
        return result;
    }

    /** Ручное изменение статуса заказа (без причины — для не-CANCELLED). */
    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus) {
        return updateStatus(orderId, newStatus, null);
    }

    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus, String cancellationReason) {
        return updateStatus(orderId, newStatus, cancellationReason, null);
    }

    /**
     * Ручное изменение статуса заказа.
     *
     * <p>V46 (правка №3 от 13.09): при отмене обязателен код причины из
     * справочника — свободный текст в аналитику не годился. Уточнение нужно
     * только там, где справочник его требует («Другая причина»). В
     * {@code cancellation_reason} складываем человеческую формулировку: её
     * читают в карточке заказа и печатных формах.
     */
    @Transactional
    public Order updateStatus(Long orderId, OrderStatus newStatus, String cancellationReason,
                              String cancelReasonCode) {
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
        String noteTrimmed = cancellationReason == null ? "" : cancellationReason.trim();
        String reasonTrimmed = noteTrimmed;
        ru.carpet.model.CancellationReason reason = null;
        if (newStatus == OrderStatus.CANCELLED) {
            reason = cancellationReasonRepository.findByCode(cancelReasonCode)
                    .filter(ru.carpet.model.CancellationReason::isActive)
                    .orElseThrow(() -> new BusinessRuleException(
                            "Для отмены заказа выберите причину из списка."));
            if (reason.requiresNote() && noteTrimmed.length() < 3) {
                throw new BusinessRuleException(
                        "Для причины «" + reason.name() + "» нужно уточнение — напишите, что случилось.");
            }
            reasonTrimmed = noteTrimmed.isEmpty() ? reason.name() : reason.name() + ": " + noteTrimmed;
        }
        OrderStatus oldStatus = order.status();
        if (newStatus == OrderStatus.CANCELLED) {
            repository.updateStatusWithReason(orderId, newStatus, reasonTrimmed);
            repository.updateCancelReasonCode(orderId, reason.code());
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

        // Уведомление: целимся в оператора-оформителя (если есть). Админы тоже получат.
        notifyOperators(
            "ORDER_STATUS_CHANGED",
            "Заказ #" + String.format("%05d", orderId) + " → " + newStatus.name(),
            "ORDER",
            orderId,
            order.assignedOperatorId()
        );

        return repository.findById(orderId).orElseThrow();
    }

    /**
     * Откат статуса заказа на один шаг назад по истории.
     *
     * <p>Зачем: обычные переходы односторонние (validateStatusTransition), и оператор,
     * промахнувшийся кнопкой (например, отправил заказ в «Доставлен»), раньше не мог
     * ничего исправить без разработчика — заказ вставал в статус, где редактирование
     * состава заблокировано.
     *
     * <p>Правила:
     * <ul>
     *   <li>берём предыдущий статус из order_status_history (последняя запись);</li>
     *   <li>причина обязательна — откат это исправление ошибки, оно должно быть объяснено;</li>
     *   <li>из COMPLETED откатываем вместе с оплатой: заказ завершают ошибочно
     *       (водитель выехал, машина сломалась по дороге), и без снятия отметки
     *       об оплате его потом не провести через «Оплатить и завершить» заново;</li>
     *   <li>обратно в COMPLETED откатом не попасть — только через оплату;</li>
     *   <li>снимаем cancellation_reason, если откатываем отмену.</li>
     * </ul>
     */
    @Transactional
    public Order rollbackStatus(Long orderId, String reason) {
        Order order = findById(orderId);
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.length() < 10) {
            throw new BusinessRuleException("Для отката статуса укажите причину (минимум 10 символов).");
        }
        OrderStatus previous = historyRepository.findPreviousStatus(orderId);
        if (previous == null) {
            throw new BusinessRuleException(
                "Некуда откатывать: у заказа нет предыдущего статуса в истории.");
        }
        OrderStatus current = order.status();
        if (previous == current) {
            throw new BusinessRuleException("Предыдущий статус совпадает с текущим — откат не нужен.");
        }
        if (previous == OrderStatus.COMPLETED) {
            throw new BusinessRuleException(
                "Вернуть заказ в «Завершён» можно только оплатой — нажмите «Оплатить и завершить».");
        }
        // Откат из CANCELLED должен снять причину отмены, иначе она «прилипнет»
        // к живому заказу и будет висеть в интерфейсе.
        if (current == OrderStatus.CANCELLED) {
            repository.updateStatusWithReason(orderId, previous, null);
        } else {
            repository.updateStatus(orderId, previous);
        }
        String paymentNote = "";
        if (current == OrderStatus.COMPLETED && order.paid()) {
            repository.unpay(orderId);
            paymentNote = "; оплата снята (" + order.paymentType()
                    + (order.paymentDate() != null
                        ? ", " + order.paymentDate().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm"))
                        : "")
                    + ")";
        }
        historyRepository.saveRollback(orderId, current, previous);
        auditLogService.log("ORDER", orderId, "STATUS_ROLLBACK",
                "Откат статуса заказа #" + orderId + ": " + current + " → " + previous
                        + " (причина: " + trimmed + ")" + paymentNote);
        notifyOperators(
            "ORDER_STATUS_CHANGED",
            "Откат заказа #" + String.format("%05d", orderId) + ": " + current + " → " + previous,
            "ORDER",
            orderId,
            order.assignedOperatorId()
        );
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
        // DELIVERED и COMPLETED — финальные, их не трогаем (управляются только вручную/через оплату).
        // LEAD — раньше исключался, но user явно попросил: если оператор перевёл услуги в IN_PROGRESS/DONE,
        // LEAD-заказ должен автоматически сдвинуться. Поэтому LEAD теперь тоже подлежит auto-recalc.
        if (order.status() == OrderStatus.DELIVERED
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
            // Уведомление: автоматическая смена статуса (рабочий завершил услугу и т.п.)
            // Целимся в оператора-оформителя, чтобы он узнал что его заказ продвинулся.
            notifyOperators(
                "ORDER_STATUS_CHANGED",
                "Заказ #" + String.format("%05d", orderId) + " → " + newStatus.name(),
                "ORDER",
                orderId,
                order.assignedOperatorId()
            );
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

        // Автоперевод в DONE — если все значимые позиции закрыты (хотя бы одна — DONE).
        // Автоперевода в CANCELLED больше нет: раньше «все позиции отменены» тянуло
        // заказ в CANCELLED, но по фидбэку оператора это мешало — отменили пачку позиций
        // при перекомпоновке заказа и получили отменённый заказ. Отмена заказа теперь
        // — только явное действие оператора либо отмена услуги «Оформление»
        // (см. checkServiceCancelTrigger).
        if (doneOrCancelledCount == target.size() && doneCount > 0) {
            return OrderStatus.DONE;
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

    /**
     * Отмена услуги «Оформление» (SKU с triggers_order_status='CREATED') автоматически
     * отменяет весь заказ. Причина отмены услуги проксируется в отмену заказа.
     * Прочие услуги при отмене на статус заказа не влияют — оператор может отменить
     * доставку/приём/произвольную услугу, не отменяя весь заказ.
     */
    @Transactional
    public void checkServiceCancelTrigger(Long orderItemId, Long skuId, String cancellationReason) {
        if (skuId == null) return;
        try {
            Sku sku = skuService.findById(skuId);
            if (!"CREATED".equals(sku.triggersOrderStatus())) return;
            OrderItem item = itemRepository.findById(orderItemId).orElse(null);
            if (item == null) return;
            Order order = findById(item.orderId());
            // Финальные и уже отменённые заказы не трогаем.
            if (order.status() == OrderStatus.CANCELLED
                    || order.status() == OrderStatus.DELIVERED
                    || order.status() == OrderStatus.COMPLETED) return;
            String reason = cancellationReason == null || cancellationReason.trim().isEmpty()
                    ? "Отменена услуга «" + sku.name() + "»"
                    : cancellationReason.trim();
            repository.updateStatusWithReason(item.orderId(), OrderStatus.CANCELLED, reason);
            historyRepository.save(item.orderId(), order.status(), OrderStatus.CANCELLED);
            auditLogService.log("ORDER", item.orderId(), "LIFECYCLE_TRIGGER",
                    "SKU «" + sku.name() + "» отменена → заказ #" + item.orderId() + " → CANCELLED (причина: " + reason + ")");
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

    /**
     * ПР-017: перевести уже созданный заказ в гарантийный и привязать к исходному.
     *
     * <p>Операторы заводили перестирку обычным заказом, потому что гарантию можно
     * было создать только из доставленного заказа. Теперь любой заказ (кроме
     * отменённого) можно пометить гарантийным, не пересоздавая его: услуги и
     * позиции обнуляются, исходные цены сохраняются в warranty_original_price.
     *
     * <p>Оплаченный заказ сначала требует возврата денег через «Возвраты» —
     * иначе обнуление суммы разошлось бы с уже принятой оплатой.
     */
    @Transactional
    public Order convertToWarranty(Long orderId, Long parentOrderId, String comment) {
        Order order = findById(orderId);
        if (order.status() == OrderStatus.CANCELLED) {
            throw new BusinessRuleException("Отменённый заказ нельзя сделать гарантийным.");
        }
        if (parentOrderId == null || parentOrderId.equals(orderId)) {
            throw new BusinessRuleException("Укажите исходный заказ, по которому возникла гарантия.");
        }
        Order parent = repository.findById(parentOrderId)
                .orElseThrow(() -> new BusinessRuleException("Исходный заказ " + orderNo(parentOrderId) + " не найден."));
        if (parent.parentOrderId() != null && parent.parentOrderId().equals(orderId)) {
            throw new BusinessRuleException("Заказ " + orderNo(parentOrderId) + " сам является гарантией по этому заказу.");
        }
        if (!java.util.Objects.equals(parent.clientId(), order.clientId())) {
            throw new BusinessRuleException("Исходный заказ " + orderNo(parentOrderId) + " оформлен на другого клиента.");
        }
        if (order.paid()) {
            BigDecimal refunded = refundRepository.findByOrderId(orderId).stream()
                    .filter(r -> "FULL_REFUND".equals(r.kind()) || "PARTIAL_REFUND".equals(r.kind()))
                    .map(ru.carpet.model.OrderRefund::amount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (refunded.compareTo(order.totalAmount()) < 0) {
                throw new BusinessRuleException("Заказ оплачен (" + order.totalAmount().toPlainString()
                        + " ₽). Сначала оформите возврат денег клиенту через «Возврат», затем переведите заказ в гарантийный.");
            }
        }
        BigDecimal amountBefore = order.totalAmount();
        repository.markWarranty(orderId, parentOrderId);
        String note = comment == null ? "" : comment.trim();
        if (!note.isEmpty()) {
            String prev = order.comment() == null || order.comment().isBlank() ? "" : order.comment() + "\n";
            repository.updateComment(orderId, prev + "Гарантия по заказу " + orderNo(parentOrderId) + ": " + note);
        }
        recalculateTotalAmount(orderId);
        auditLogService.log("ORDER", orderId, "UPDATE", "Заказ " + orderNo(orderId) + " переведён в гарантийный по заказу "
                + orderNo(parentOrderId) + " (сумма " + amountBefore.toPlainString() + " ₽ → 0)"
                + (note.isEmpty() ? "" : "; причина: " + note));
        if (order.clientId() != null) {
            clientEventRepository.save(order.clientId(), "WARRANTY",
                    "Заказ " + orderNo(orderId) + " — гарантия по заказу " + orderNo(parentOrderId));
        }
        return repository.findById(orderId).orElseThrow();
    }

    /** ПР-017: обнулить услуги и позиции гарантийного заказа, сохранив исходные цены позиций. */
    private void zeroWarrantyItems(Long orderId) {
        for (OrderItem item : itemRepository.findByOrderId(orderId)) {
            if (item.status() == OrderItemStatus.CANCELLED) continue;
            boolean changed = false;
            for (var svc : serviceInstanceRepository.findByOrderItemId(item.id())) {
                if (svc.price() != null && svc.price().signum() != 0) {
                    serviceInstanceRepository.updatePrice(svc.id(), BigDecimal.ZERO);
                    changed = true;
                }
            }
            if (changed || (item.price() != null && item.price().signum() != 0)) {
                BigDecimal original = item.price() != null && item.price().signum() != 0 ? item.price() : null;
                itemRepository.zeroForWarranty(item.id(), original);
            }
        }
    }

    /** Гарантийный возврат — только из DELIVERED или COMPLETED, с выбором позиций */
    @Transactional
    public Order createWarranty(Long orderId, List<Long> itemIds, String warrantyComment) {
        Order original = findById(orderId);
        if (original.status() != OrderStatus.DELIVERED && original.status() != OrderStatus.COMPLETED
                && original.status() != OrderStatus.PARTIALLY_DELIVERED) {
            throw new BusinessRuleException("Гарантийный возврат возможен только для заказов в статусе ДОСТАВЛЕН, ЧАСТИЧНО ДОСТАВЛЕН или ЗАВЕРШЁН");
        }

        // Создаём гарантийный заказ с total_amount = 0
        Order warranty = repository.saveWarranty(original.clientId(), original.clientName(), warrantyComment, orderId);
        auditLogService.log("ORDER", warranty.id(), "CREATE", "Создан гарантийный заказ " + orderNo(warranty.id())
                + " по заказу " + orderNo(orderId) + " (позиций: " + itemIds.size() + ")");

        // Копируем только выбранные позиции (с их размерами). По #2 — гарантийный
        // заказ полностью бесплатный (включая доставку): цены услуг и позиций обнуляем.
        List<OrderItem> allItems = itemRepository.findByOrderId(orderId);
        for (OrderItem item : allItems) {
            if (!itemIds.contains(item.id())) continue;
            OrderItem newItem = itemRepository.saveWithDimensions(
                    warranty.id(), item.itemTypeId(), item.description(),
                    item.length(), item.width(), item.weight(), item.area(), item.runningMeters()
            );
            if (item.quantity() > 1) itemRepository.updateQuantity(newItem.id(), item.quantity());
            List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(item.id());
            List<Long> skuIds = services.stream()
                    .map(OrderItemServiceInstance::skuId)
                    .filter(java.util.Objects::nonNull)
                    .toList();
            serviceInstanceRepository.saveAll(newItem.id(), skuIds);
            // V19: гарантия = 0₽. Обнуляем все услуги нового item'а через ручную цену
            // (manual=TRUE, чтобы recalc не вернул назад).
            for (var svc : serviceInstanceRepository.findByOrderItemId(newItem.id())) {
                serviceInstanceRepository.updatePrice(svc.id(), java.math.BigDecimal.ZERO);
            }
            // ПР-017: первоначальная стоимость ковра — для аналитики гарантий.
            itemRepository.zeroForWarranty(newItem.id(), item.price());
        }
        // На всякий случай: суммарная сумма заказа в 0.
        repository.updateBaseAmount(warranty.id(), java.math.BigDecimal.ZERO);

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

    /**
     * V30: предварительный тип оплаты — намерение клиента, которое видит водитель
     * в маршрутном листе. Меняется в любом статусе кроме отменённого: оператор
     * может уточнить способ расчёта уже после завершения работ. Факт оплаты
     * (paid/payment_type) этим не затрагивается.
     */
    @Transactional
    public Order setPreliminaryPaymentType(Long orderId, String value) {
        Order order = findById(orderId);
        if (order.status() == OrderStatus.CANCELLED) {
            throw new BusinessRuleException("Нельзя менять параметры отменённого заказа");
        }
        String normalized = value == null || value.isBlank() ? null : value.trim().toUpperCase();
        if (normalized != null && !java.util.List.of("CASH", "CARD", "TRANSFER", "PAID", "FREE").contains(normalized)) {
            throw new BusinessRuleException("Недопустимый предварительный тип оплаты: " + value);
        }
        repository.updatePreliminaryPaymentType(orderId, normalized);
        auditLogService.log("ORDER", orderId, "UPDATE",
                "Предварительный тип оплаты заказа #" + orderId + ": " + (normalized == null ? "не указан" : normalized));
        return repository.findById(orderId).orElseThrow();
    }

    /** Обновление деталей заказа (адреса, квартиры, даты, legacy_id, координаты) */
    public Order updateDetails(Long orderId, String pickupAddress, String deliveryAddress,
                               String pickupApartment, String deliveryApartment, Long legacyId,
                               java.time.LocalDate pickupDate, String pickupTimeSlot,
                               java.time.LocalDate deliveryDate, String deliveryTimeSlot,
                               String pickupDistrict, String deliveryDistrict,
                               BigDecimal pickupLat, BigDecimal pickupLon,
                               BigDecimal deliveryLat, BigDecimal deliveryLon) {
        Order order = findById(orderId);
        assertEditable(order);
        repository.updateDetails(orderId, pickupAddress, deliveryAddress,
                pickupApartment, deliveryApartment, legacyId,
                pickupDate, pickupTimeSlot, deliveryDate, deliveryTimeSlot,
                pickupDistrict, deliveryDistrict,
                pickupLat, pickupLon, deliveryLat, deliveryLon);
        auditLogService.log("ORDER", orderId, "UPDATE", "Обновлены детали заказа #" + orderId);
        // ПР-006: адрес сменился — цена доставки по зоне могла измениться.
        if (!java.util.Objects.equals(order.pickupLat(), pickupLat) || !java.util.Objects.equals(order.pickupLon(), pickupLon)
                || !java.util.Objects.equals(order.deliveryLat(), deliveryLat) || !java.util.Objects.equals(order.deliveryLon(), deliveryLon)) {
            recalculateTotalAmount(orderId);
        }
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
        // Логистика: что поменялось — перенос на другой день, смена слота, снятие с даты.
        // Сравниваем с тем, что реально легло в базу, а не с запросом.
        Order after = repository.findById(orderId).orElseThrow();
        String changes = java.util.stream.Stream.of(
                        describeLeg("забор", order.actualPickupDate(), order.actualPickupTimeSlot(),
                                after.actualPickupDate(), after.actualPickupTimeSlot()),
                        describeLeg("доставка", order.actualDeliveryDate(), order.actualDeliveryTimeSlot(),
                                after.actualDeliveryDate(), after.actualDeliveryTimeSlot()))
                .filter(java.util.Objects::nonNull)
                .collect(java.util.stream.Collectors.joining("; "));
        if (!changes.isEmpty()) {
            auditLogService.log("ORDER", orderId, "LOGISTICS", "Логистика, заказ " + orderNo(orderId) + ": " + changes);
            // ТЗ v2: перенос дня двигает и точку водителя, а снятие даты её убирает.
            payrollService.syncOrderPoints(orderId);
            // ПР-010: день этапа поменялся — подтверждение именно этого этапа
            // недействительно. Перенос доставки не снимает прозвон забора и наоборот.
            if (describeLeg("забор", order.actualPickupDate(), order.actualPickupTimeSlot(),
                    after.actualPickupDate(), after.actualPickupTimeSlot()) != null) {
                resetClientConfirmation(orderId, "PICKUP", "перенос дня забора");
            }
            if (describeLeg("доставка", order.actualDeliveryDate(), order.actualDeliveryTimeSlot(),
                    after.actualDeliveryDate(), after.actualDeliveryTimeSlot()) != null) {
                resetClientConfirmation(orderId, "DELIVERY", "перенос дня доставки");
            }
            after = repository.findById(orderId).orElseThrow();
        }
        return after;
    }

    /**
     * V43: флажок «клиент подтвердил день выезда» (правка №1 от 17.09).
     *
     * <p>Не статус заказа, а рабочий признак логистики: оператор обзванивает
     * клиентов накануне и отмечает, кто подтвердил. Подпись оператора храним —
     * с клиентами работают несколько человек, и важно, кто именно звонил.
     */
    /** ПР-010: журнал звонков заказа, новые сверху. */
    public List<java.util.Map<String, Object>> calls(Long orderId) {
        findById(orderId);
        return repository.calls(orderId);
    }

    @Transactional
    public Order setClientConfirmed(Long orderId, String leg, boolean confirmed) {
        findById(orderId);
        String safeLeg = "DELIVERY".equals(leg) ? "DELIVERY" : "PICKUP";
        String actor = ru.carpet.audit.AuditUser.current();
        repository.updateLegConfirmed(orderId, safeLeg, confirmed, confirmed ? actor : null);
        // ПР-010: каждое подтверждение — звонок в журнал; время последнего звонка
        // остаётся видно, даже когда отметку потом снимут из-за переноса.
        if (confirmed) repository.insertCall(orderId, safeLeg, actor);
        String what = "DELIVERY".equals(safeLeg) ? "день доставки" : "день забора";
        auditLogService.log("ORDER", orderId, "LOGISTICS", "Заказ " + orderNo(orderId) + ": "
                + (confirmed ? "клиент подтвердил " + what : "подтверждение (" + what + ") снято — уточнить"));
        return repository.findById(orderId).orElseThrow();
    }

    /**
     * V46 (правка №3 от 13.09): повод обращения по заказу.
     *
     * <p>Отдельный метод, а не поле в «деталях»: повод спрашивают у клиента
     * при оформлении, а адреса и даты правят потом, и мешать их в одно
     * сохранение незачем.
     */
    @Transactional
    public Order setOrderReason(Long orderId, String reason, String note) {
        Order before = findById(orderId);
        repository.updateOrderReason(orderId, blankToNull(reason), blankToNull(note));
        Order after = repository.findById(orderId).orElseThrow();
        if (!java.util.Objects.equals(before.orderReason(), after.orderReason())
                || !java.util.Objects.equals(before.orderReasonNote(), after.orderReasonNote())) {
            auditLogService.log("ORDER", orderId, "UPDATE", "Заказ " + orderNo(orderId)
                    + ": повод обращения — " + (after.orderReason() == null ? "не указан" : after.orderReason())
                    + (after.orderReasonNote() != null ? " (" + after.orderReasonNote() + ")" : ""));
        }
        return after;
    }

    /** V45: типы событий по претензиям (правка №3 от 19.09). */
    private static final Set<String> REFUND_KINDS =
            Set.of("FULL_REFUND", "PARTIAL_REFUND", "ITEM_COMPENSATION", "OTHER");

    /**
     * V45: зафиксировать возврат денег или компенсацию по заказу.
     *
     * <p>Это финансовая потеря компании по претензии клиента: вернули деньги
     * целиком или частично, заплатили за испорченный ковёр. Записи попадают в
     * карточку заказа и в аналитику потерь.
     */
    @Transactional
    public ru.carpet.model.OrderRefund addRefund(Long orderId, String kind, BigDecimal amount, String reason,
                                                 String comment, java.time.LocalDate occurredOn) {
        Order order = findById(orderId);
        if (kind == null || !REFUND_KINDS.contains(kind)) {
            throw new BusinessRuleException("Неизвестный тип события: " + kind);
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("Сумма возврата должна быть больше нуля.");
        }
        String reasonText = reason == null ? "" : reason.trim();
        if (reasonText.length() < 3) {
            throw new BusinessRuleException("Укажите причину возврата или компенсации.");
        }
        // Возврат больше суммы заказа — почти всегда опечатка в сумме. Для
        // компенсации ковра это законно: ковёр может стоить дороже стирки.
        boolean overOrder = order.totalAmount() != null && amount.compareTo(order.totalAmount()) > 0;
        if (overOrder && ("FULL_REFUND".equals(kind) || "PARTIAL_REFUND".equals(kind))) {
            throw new BusinessRuleException("Возврат больше суммы заказа (" + money(order.totalAmount())
                    + " ₽). Если компенсируете стоимость ковра — выберите соответствующий тип события.");
        }
        Long id = refundRepository.save(orderId, kind, amount, reasonText, blankToNull(comment),
                occurredOn, ru.carpet.audit.AuditUser.current());
        auditLogService.log("ORDER", orderId, "REFUND", "Заказ " + orderNo(orderId) + ": "
                + refundLabel(kind) + " " + money(amount) + " ₽ (" + reasonText + ")");
        return refundRepository.findByOrderId(orderId).stream()
                .filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }

    /** V45: убрать ошибочно заведённую запись о возврате. */
    @Transactional
    public void deleteRefund(Long orderId, Long refundId) {
        findById(orderId);
        var refund = refundRepository.findByOrderId(orderId).stream()
                .filter(r -> r.id().equals(refundId)).findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Refund not found: " + refundId));
        refundRepository.delete(refundId);
        auditLogService.log("ORDER", orderId, "REFUND", "Заказ " + orderNo(orderId) + ": удалена запись — "
                + refundLabel(refund.kind()) + " " + money(refund.amount()) + " ₽");
    }

    /** Человеческое название типа события — для лога действий. */
    private static String refundLabel(String kind) {
        return switch (kind == null ? "" : kind) {
            case "FULL_REFUND"       -> "полный возврат";
            case "PARTIAL_REFUND"    -> "частичный возврат";
            case "ITEM_COMPENSATION" -> "компенсация за ковёр";
            case "OTHER"             -> "прочая выплата по претензии";
            default                  -> kind;
        };
    }

    /**
     * V43/ПР-010: снять подтверждение этапа автоматически — только при переносе
     * дня этого этапа. После забора отметку больше не снимаем: у отвоза своя.
     * Если подтверждения не было, ничего не пишем: лог не должен шуметь.
     */
    private void resetClientConfirmation(Long orderId, String leg, String reason) {
        Order order = repository.findById(orderId).orElse(null);
        if (order == null) return;
        boolean confirmed = "DELIVERY".equals(leg) ? order.deliveryConfirmed() : order.clientConfirmed();
        if (!confirmed) return;
        repository.updateLegConfirmed(orderId, leg, false, null);
        auditLogService.log("ORDER", orderId, "LOGISTICS",
                "Заказ " + orderNo(orderId) + ": подтверждение клиента снято (" + reason + ")");
    }

    /** «забор → 03.09.2026 14:00-18:00», «доставка снята с даты»; null — ничего не поменялось. */
    private static String describeLeg(String leg, java.time.LocalDate oldDate, String oldSlot,
                                      java.time.LocalDate newDate, String newSlot) {
        if (java.util.Objects.equals(oldDate, newDate) && java.util.Objects.equals(blankToNull(oldSlot), blankToNull(newSlot))) {
            return null;
        }
        if (newDate == null) return leg + (leg.equals("доставка") ? " снята" : " снят") + " с даты";
        return leg + " → " + newDate.format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy"))
                + (blankToNull(newSlot) != null ? " " + newSlot : "");
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s; }

    /** Номер заказа так, как его видит оператор: #00086. */
    static String orderNo(Long orderId) { return "#" + String.format("%05d", orderId); }

    /** «скидка «Пенсионер» −10%» / «надбавка «Срочность» +10%». */
    private static String modifierLabel(String name, String kind, BigDecimal percent, BigDecimal amount) {
        if ("FIXED".equals(kind)) {
            return "скидка «" + name + "» −" + (amount == null ? "0" : amount.stripTrailingZeros().toPlainString()) + " ₽";
        }
        if ("FREE_DELIVERY".equals(kind)) return "скидка «" + name + "» (бесплатная доставка)";
        String pct = percent.abs().stripTrailingZeros().toPlainString();
        return percent.signum() < 0 ? "скидка «" + name + "» −" + pct + "%" : "надбавка «" + name + "» +" + pct + "%";
    }

    private String skuNameOr(Long skuId, String fallback) {
        try { return skuService.findById(skuId).name(); } catch (Exception e) { return fallback; }
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
            // Промокод разовый — в копию заказа не переносим (ПР-018).
            if (m.promoCode() != null) continue;
            orderModifierRepository.add(newOrder.id(), m.modifierId(), m.modifierName(), m.percent(),
                    m.kind(), m.amount(), null);
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

    // ---------------- ПР-002: количество однотипных изделий ----------------

    /**
     * Сменить количество штук в позиции. Размеры остаются на одну штуку;
     * цены услуг пересчитываются (ручные цены — не трогаем, как везде).
     */
    @Transactional
    public OrderItem setItemQuantity(Long orderId, Long itemId, int quantity) {
        Order order = findById(orderId);
        assertEditable(order);
        if (quantity < 1 || quantity > 10000) throw new BusinessRuleException("Количество — от 1 до 10 000 штук.");
        OrderItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + itemId));
        if (!item.orderId().equals(orderId)) throw new BusinessRuleException("Позиция не из этого заказа.");
        if (item.quantity() == quantity) return item;
        itemRepository.updateQuantity(itemId, quantity);
        orderItemService.recalculateServicePrices(itemId);
        orderItemService.recalculateItemPrice(itemId);
        auditLogService.log("ORDER", orderId, "ITEM", "Заказ " + orderNo(orderId) + ": позиция #" + itemId
                + " — количество " + item.quantity() + " → " + quantity + " шт.");
        return itemRepository.findById(itemId).orElseThrow();
    }

    /**
     * Объединить одинаковые позиции заказа в одну «×N» (ПР-002) — для заказов,
     * где однотипные изделия уже заведены по одному.
     *
     * <p>Одинаковые — тот же тип, описание и дефекты, размеры одной штуки, тот же
     * набор услуг без ручных цен, и работа по ним ещё не начата
     * (статус «Создана»). Остаётся позиция с меньшим номером, фото переносятся
     * в неё, остальные удаляются. Возвращает, сколько позиций влилось.
     */
    @Transactional
    public int groupIdenticalItems(Long orderId) {
        Order order = findById(orderId);
        assertEditable(order);
        java.util.Set<Long> autoSkuIds = new java.util.HashSet<>();
        for (var s : skuService.findAutoAdd()) autoSkuIds.add(s.id());
        java.util.Map<String, List<OrderItem>> groups = new java.util.LinkedHashMap<>();
        for (OrderItem item : itemRepository.findByOrderId(orderId)) {
            if (item.status() != OrderItemStatus.CREATED) continue;
            List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(item.id()).stream()
                    .filter(s -> s.status() != ServiceStatus.CANCELLED).toList();
            if (services.isEmpty() || services.stream().anyMatch(s -> autoSkuIds.contains(s.skuId()))) continue;
            // Ручная цена — сумма за всю позицию; при слиянии её не пересчитать
            // честно, поэтому такие позиции оператор объединяет сам.
            if (services.stream().anyMatch(s -> Boolean.TRUE.equals(s.isManualPrice()))) continue;
            String svcKey = services.stream().map(s -> String.valueOf(s.skuId()))
                    .sorted().collect(java.util.stream.Collectors.joining(","));
            String key = String.join("|", String.valueOf(item.itemTypeId()), nz(item.description()), nz(item.defects()),
                    num(item.length()), num(item.width()), num(item.weight()), num(item.area()), num(item.runningMeters()), svcKey);
            groups.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(item);
        }
        int merged = 0;
        for (List<OrderItem> group : groups.values()) {
            if (group.size() < 2) continue;
            OrderItem keep = group.get(0);
            List<Long> others = group.subList(1, group.size()).stream().map(OrderItem::id).toList();
            int total = group.stream().mapToInt(OrderItem::quantity).sum();
            itemRepository.movePhotos(others, keep.id());
            itemRepository.deleteItems(others);
            itemRepository.updateQuantity(keep.id(), total);
            orderItemService.recalculateServicePrices(keep.id());
            orderItemService.recalculateItemPrice(keep.id());
            merged += others.size();
            auditLogService.log("ORDER", orderId, "ITEM", "Заказ " + orderNo(orderId) + ": позиции "
                    + others.stream().map(id -> "#" + id).collect(java.util.stream.Collectors.joining(", "))
                    + " объединены в #" + keep.id() + " — " + total + " шт.");
        }
        if (merged > 0) recalculateTotalAmount(orderId);
        return merged;
    }

    /** ПР-002: отделить одну штуку из позиции «×N» в отдельную позицию (когда нужен конкретный экземпляр). */
    @Transactional
    public OrderItem splitOneItem(Long orderId, Long itemId) {
        Order order = findById(orderId);
        assertEditable(order);
        OrderItem item = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + itemId));
        if (!item.orderId().equals(orderId)) throw new BusinessRuleException("Позиция не из этого заказа.");
        if (item.quantity() < 2) throw new BusinessRuleException("В позиции одна штука — отделять нечего.");
        itemRepository.updateQuantity(itemId, item.quantity() - 1);
        orderItemService.recalculateServicePrices(itemId);
        orderItemService.recalculateItemPrice(itemId);
        OrderItem copy = duplicateItemInternal(orderId, itemRepository.findById(itemId).orElseThrow());
        if (copy.quantity() != 1) {
            itemRepository.updateQuantity(copy.id(), 1);
            orderItemService.recalculateServicePrices(copy.id());
            orderItemService.recalculateItemPrice(copy.id());
        }
        recalculateTotalAmount(orderId);
        auditLogService.log("ORDER", orderId, "ITEM", "Заказ " + orderNo(orderId) + ": из позиции #" + itemId
                + " отделена 1 шт. → #" + copy.id());
        return itemRepository.findById(copy.id()).orElseThrow();
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }

    private static String num(BigDecimal v) { return v == null ? "" : v.stripTrailingZeros().toPlainString(); }

    /** Дублирование позиции внутри заказа — копирует услуги с ценами из прайс-листа */
    public OrderItem duplicateItem(Long orderId, Long itemId) {
        findById(orderId);
        OrderItem original = itemRepository.findById(itemId)
                .orElseThrow(() -> new EntityNotFoundException("OrderItem not found: " + itemId));
        OrderItem newItem = duplicateItemInternal(orderId, original);
        recalculateTotalAmount(orderId);
        auditLogService.log("ORDER", orderId, "ITEM",
                "Заказ " + orderNo(orderId) + ": продублирована позиция #" + itemId + " → #" + newItem.id());
        return newItem;
    }

    private OrderItem duplicateItemInternal(Long orderId, OrderItem original) {
        OrderItem newItem = itemRepository.saveWithDimensions(
                orderId, original.itemTypeId(), original.description(),
                original.length(), original.width(), original.weight(), original.area(), original.runningMeters()
        );
        // ПР-002: копия позиции — с тем же количеством штук.
        if (original.quantity() > 1) {
            itemRepository.updateQuantity(newItem.id(), original.quantity());
            newItem = itemRepository.findById(newItem.id()).orElseThrow();
        }
        if (original.defects() != null) {
            itemRepository.updateDescription(newItem.id(), original.description(), original.defects());
        }
        // V10: копируем услуги вместе с sku_id — цена пересчитывается через PricingHelper.
        // V42: по прайсу того заказа, в который копируем (у гарантийного заказа он свой).
        java.time.LocalDate priceDate = repository.findById(orderId).map(Order::priceDate).orElse(null);
        List<OrderItemServiceInstance> services = serviceInstanceRepository.findByOrderItemId(original.id());
        for (OrderItemServiceInstance svc : services) {
            if (svc.skuId() == null) continue;
            SkuService.SkuAsOf asOf = null;
            try { asOf = skuService.findAsOf(svc.skuId(), priceDate); } catch (Exception ignored) {}
            if (asOf == null) continue;
            ru.carpet.model.Sku sku = asOf.sku();
            OrderItem freshItem = itemRepository.findById(newItem.id()).orElseThrow();
            BigDecimal newPrice = PricingHelper.calculate(sku.price(), sku.pricingType(), freshItem);
            Long newSvcId = serviceInstanceRepository.saveOne(newItem.id(), svc.skuId(), newPrice, asOf.versionId());
            if (newSvcId != null) {
                serviceInstanceRepository.updateCalculatedPrice(newSvcId, newPrice, asOf.versionId());
            }
        }
        // Пересчитать стоимость позиции
        orderItemService.recalculateItemPrice(newItem.id());
        return itemRepository.findById(newItem.id()).orElseThrow();
    }

    /**
     * V42: перевести заказ на сегодняшний прайс и пересчитать цены.
     *
     * <p>Обычные пересчёты идут по прайсу на дату заказа — цена, названная
     * клиенту, не должна меняться сама по себе. Этот метод — осознанное
     * действие оператора: сдвигаем дату прайса на сегодня и пересчитываем
     * услуги. Услуги с ручной ценой не трогаем: их поставили руками, и прайс
     * к ним отношения не имеет.
     */
    @Transactional
    public Order repriceToCurrent(Long orderId) {
        Order order = findById(orderId);
        if (order.status() == OrderStatus.COMPLETED) {
            throw new BusinessRuleException("Заказ завершён и оплачен — пересчёт цен закрыт.");
        }
        BigDecimal before = order.totalAmount();
        java.time.LocalDate today = java.time.LocalDate.now();
        repository.updatePriceDate(orderId, today);
        for (OrderItem item : itemRepository.findByOrderId(orderId)) {
            if (item.status() == OrderItemStatus.CANCELLED) continue;
            orderItemService.recalculateServicePrices(item.id());
        }
        recalculateTotalAmount(orderId);
        Order updated = repository.findById(orderId).orElseThrow();
        auditLogService.log("ORDER", orderId, "PRICE_CHANGE",
                "Заказ " + orderNo(orderId) + ": пересчёт по прайсу от " + dateText(today)
                        + " (был прайс от " + dateText(order.priceDate()) + ") — "
                        + money(before) + " ₽ → " + money(updated.totalAmount()) + " ₽");
        return updated;
    }

    private static String dateText(java.time.LocalDate d) {
        return d == null ? "—" : d.format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy"));
    }

    private static String money(BigDecimal v) {
        return v == null ? "0" : v.stripTrailingZeros().toPlainString();
    }

    /** Пересчёт итоговой суммы заказа */
    public void recalculateTotalAmount(Long orderId) {
        // ПР-017: гарантийный заказ для клиента бесплатный целиком. Любая новая или
        // пересчитанная позиция в нём обнуляется (исходная цена сохраняется), и
        // итог всегда 0 — иначе добавленный в гарантию ковёр выставлялся бы к оплате.
        if (repository.findById(orderId).map(Order::isWarranty).orElse(false)) {
            zeroWarrantyItems(orderId);
            repository.updateBaseAmount(orderId, BigDecimal.ZERO);
            repository.updateTotalAmount(orderId, BigDecimal.ZERO);
            return;
        }
        // Сначала пересчитываем дефолтные позиции (доставка и т.п.)
        // они зависят от суммы остальных позиций
        recalculateDefaultItemPrices(orderId);
        // recalculateDefaultItemPrices сам обновляет total_amount в конце
    }

    /** Пересчёт итоговой суммы с учётом модификаторов */
    @Transactional
    public void recalculateTotalWithModifiers(Long orderId, BigDecimal baseAmount) {
        List<OrderModifier> modifiers = orderModifierRepository.findByOrderId(orderId);
        // Процентные скидки и надбавки складываются и считаются от базы (как раньше).
        BigDecimal modifierSum = BigDecimal.ZERO;
        for (OrderModifier m : modifiers) {
            if (!"PERCENT".equals(m.kind())) continue;
            BigDecimal effect = baseAmount.multiply(m.percent()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            modifierSum = modifierSum.add(effect);
            if (m.discountAmount() == null || m.discountAmount().compareTo(effect) != 0) {
                orderModifierRepository.updateDiscountAmount(m.id(), effect);
            }
        }
        // ПР-018: фиксированные скидки вычитаются после процентов и не уводят итог ниже нуля.
        BigDecimal afterPercent = baseAmount.add(modifierSum);
        BigDecimal fixedSum = BigDecimal.ZERO;
        for (OrderModifier m : modifiers) {
            if (!"FIXED".equals(m.kind()) || m.amount() == null) continue;
            BigDecimal room = afterPercent.subtract(fixedSum).max(BigDecimal.ZERO);
            BigDecimal effect = m.amount().min(room);
            fixedSum = fixedSum.add(effect);
            if (m.discountAmount() == null || m.discountAmount().compareTo(effect.negate()) != 0) {
                orderModifierRepository.updateDiscountAmount(m.id(), effect.negate());
            }
        }
        BigDecimal total = roundDownToHundred(afterPercent.subtract(fixedSum));
        repository.updateTotalAmount(orderId, total);
    }

    /**
     * Округление итоговой суммы заказа ВНИЗ до ближайшей сотни рублей —
     * оператору неудобно называть клиенту «6499.20», округляем в пользу клиента.
     * 6499.20 → 6400, 6400.00 → 6400, 6599.99 → 6500, 6999.99 → 6900.
     *
     * Округляем только ИТОГО. base_amount и цены позиций остаются точными:
     * по ним считается доходность и себестоимость, там копейки важны.
     */
    static BigDecimal roundDownToHundred(BigDecimal amount) {
        if (amount == null) return BigDecimal.ZERO;
        // Отрицательных итогов быть не должно (скидка >100% запрещена), но если
        // вдруг — не «улетаем» вниз ещё на сотню, просто отдаём как есть.
        if (amount.signum() <= 0) return amount.setScale(2, RoundingMode.HALF_UP);
        return amount
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR)
                .multiply(BigDecimal.valueOf(100))
                .setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * V17: пометить заказ как проблемный (или снять флаг).
     *  • TRUE — обязательно reason ≥ 10 символов; шлём уведомление админам.
     *  • FALSE — снимаем флаг, помечаем все «ORDER_PROBLEM*» уведомления по этому
     *    заказу прочитанными (чтобы значок у админов перестал мигать).
     */
    @Transactional
    public Order setProblem(Long orderId, boolean isProblem, String reason) {
        Order order = findById(orderId);
        if (isProblem) {
            String trimmed = reason == null ? "" : reason.trim();
            if (trimmed.length() < 10) {
                throw new BusinessRuleException("Для пометки заказа проблемным укажите причину (минимум 10 символов).");
            }
            repository.setProblem(orderId, true, trimmed);
            auditLogService.log("ORDER", orderId, "PROBLEM_FLAG",
                    "Заказ #" + orderId + " помечен как проблемный: " + trimmed);
            notifyAdmins("ORDER_PROBLEM",
                    "ПРОБЛЕМА на заказе #" + String.format("%05d", orderId) + ": " + trimmed,
                    "ORDER", orderId);
        } else {
            repository.setProblem(orderId, false, null);
            auditLogService.log("ORDER", orderId, "PROBLEM_FLAG", "Снят флаг проблемы с заказа #" + orderId);
            // Помечаем все ORDER_PROBLEM* уведомления по этому заказу прочитанными.
            itemRepository.getJdbc().update(
                    "UPDATE notifications SET is_read = TRUE " +
                    "WHERE entity_type = 'ORDER' AND entity_id = :id AND type LIKE 'ORDER_PROBLEM%'",
                    java.util.Map.of("id", orderId));
        }
        return repository.findById(orderId).orElseThrow();
    }

    /** Получить модификаторы заказа */
    public List<OrderModifier> getModifiers(Long orderId) {
        findById(orderId);
        return orderModifierRepository.findByOrderId(orderId);
    }

    /** Добавить модификатор к заказу */
    @Transactional
    public Order addModifier(Long orderId, Long modifierId) {
        PriceModifier pm = priceModifierRepository.findById(modifierId)
                .orElseThrow(() -> new EntityNotFoundException("Modifier not found: " + modifierId));
        return applyModifier(orderId, pm);
    }

    /** ПР-018: применить скидку по промокоду, введённому оператором. */
    @Transactional
    public Order applyPromoCode(Long orderId, String code) {
        if (code == null || code.isBlank()) throw new BusinessRuleException("Введите промокод.");
        PriceModifier pm = priceModifierRepository.findByPromoCode(code.trim())
                .orElseThrow(() -> new BusinessRuleException("Промокод «" + code.trim() + "» не найден."));
        return applyModifier(orderId, pm);
    }

    /**
     * Применение скидки к заказу (ПР-004, ПР-018).
     *
     * <p>Проверяем условия: скидка включена, срок действия, лимит использований,
     * не больше одного промокода на заказ. Скидки суммируются. Скидка с
     * настройкой «закреплять за клиентом» при первом применении сама
     * добавляется в карточку клиента — в его следующих заказах она будет
     * подставлена автоматически. Разовые скидки и промокоды без этой настройки
     * за клиентом не закрепляются.
     */
    private Order applyModifier(Long orderId, PriceModifier pm) {
        Order order = findById(orderId);
        List<OrderModifier> current = orderModifierRepository.findByOrderId(orderId);
        if (current.stream().anyMatch(m -> java.util.Objects.equals(m.modifierId(), pm.id()))) {
            throw new BusinessRuleException("«" + pm.name() + "» уже применена к заказу.");
        }
        if (!pm.active()) throw new BusinessRuleException("«" + pm.name() + "» выключена в справочнике.");
        java.time.LocalDate today = java.time.LocalDate.now();
        if (pm.validFrom() != null && today.isBefore(pm.validFrom())) {
            throw new BusinessRuleException("«" + pm.name() + "» действует с " + pm.validFrom().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")) + ".");
        }
        if (pm.validTo() != null && today.isAfter(pm.validTo())) {
            throw new BusinessRuleException("Срок действия «" + pm.name() + "» истёк " + pm.validTo().format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy")) + ".");
        }
        if (pm.usageLimit() != null && pm.usedCount() >= pm.usageLimit()) {
            throw new BusinessRuleException("Лимит использований «" + pm.name() + "» исчерпан (" + pm.usageLimit() + ").");
        }
        if (pm.promoCode() != null) {
            current.stream().filter(m -> m.promoCode() != null).findFirst().ifPresent(m -> {
                throw new BusinessRuleException("В заказе уже есть промокод «" + m.promoCode() + "». Один заказ — один промокод.");
            });
        }
        orderModifierRepository.add(orderId, pm);
        recalculateTotalAmount(orderId);
        auditLogService.log("ORDER", orderId, "MODIFIER",
                "Заказ " + orderNo(orderId) + ": добавлена " + modifierLabel(pm.name(), pm.kind(), pm.percent(), pm.amount())
                        + (pm.promoCode() != null ? " (промокод " + pm.promoCode() + ")" : ""));
        if (pm.autoAssignToClient() && order.clientId() != null
                && clientModifierRepository.findByClientId(order.clientId()).stream().noneMatch(m -> m.id().equals(pm.id()))) {
            clientModifierRepository.add(order.clientId(), pm.id());
            auditLogService.log("CLIENT", order.clientId(), "UPDATE",
                    "Скидка «" + pm.name() + "» закреплена за клиентом автоматически (заказ " + orderNo(orderId) + ")");
        }
        return findById(orderId);
    }

    /** Удалить модификатор из заказа */
    @Transactional
    public Order removeModifier(Long orderId, Long modifierId) {
        findById(orderId);
        OrderModifier removed = orderModifierRepository.findByOrderId(orderId).stream()
                .filter(m -> java.util.Objects.equals(m.modifierId(), modifierId)).findFirst().orElse(null);
        orderModifierRepository.removeByOrderIdAndModifierId(orderId, modifierId);
        recalculateTotalAmount(orderId);
        if (removed != null) {
            auditLogService.log("ORDER", orderId, "MODIFIER",
                    "Заказ " + orderNo(orderId) + ": убрана " + modifierLabel(removed.modifierName(), removed.kind(), removed.percent(), removed.amount()));
        }
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
        auditLogService.log("CLIENT", order.clientId(), "UPDATE", "Скидки и надбавки заказа " + orderNo(orderId)
                + " перенесены в карточку клиента: " + (orderMods.isEmpty() ? "нет"
                : orderMods.stream().map(OrderModifier::modifierName).collect(java.util.stream.Collectors.joining(", "))));
    }
}
