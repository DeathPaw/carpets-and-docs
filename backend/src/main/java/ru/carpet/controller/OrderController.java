package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.*;
import ru.carpet.model.*;
import ru.carpet.repository.OrderItemPhotoRepository;
import ru.carpet.service.OrderItemService;
import ru.carpet.service.OrderItemServiceInstanceService;
import ru.carpet.service.OrderService;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService service;
    private final OrderItemService orderItemService;
    private final OrderItemServiceInstanceService serviceInstanceService;
    private final OrderItemPhotoRepository photoRepository;
    private final NamedParameterJdbcTemplate jdbc;

    public OrderController(OrderService service, OrderItemService orderItemService,
                           OrderItemServiceInstanceService serviceInstanceService,
                           OrderItemPhotoRepository photoRepository,
                           NamedParameterJdbcTemplate jdbc) {
        this.service = service;
        this.orderItemService = orderItemService;
        this.serviceInstanceService = serviceInstanceService;
        this.photoRepository = photoRepository;
        this.jdbc = jdbc;
    }

    @GetMapping
    public PageResponse<Order> getAll(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) List<OrderStatus> statuses,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            // По какому полю даты фильтровать: created_at | pickup_date | delivery_date
            // | actual_pickup_date | actual_delivery_date. По умолчанию — created_at.
            @RequestParam(required = false) String dateField,
            @RequestParam(required = false) Long legacyId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) String paymentType,
            @RequestParam(required = false) String clientPhone,
            @RequestParam(required = false) String clientName,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) List<String> sortBy,
            @RequestParam(required = false) List<String> sortDir,
            // true = только заказы с адресом, но без координат (для перехода с дашборда «Без координат»)
            @RequestParam(required = false) Boolean noCoords,
            // true = просрочка по факт. дате (для виджета на главной)
            @RequestParam(required = false) Boolean overdueActual,
            // true = пора забирать/доставлять, но адрес пуст (виджет «Без адреса»)
            @RequestParam(required = false) Boolean badAddress,
            // V19: только гарантийные (клик из аналитики).
            @RequestParam(required = false) Boolean onlyWarranty,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<OrderStatus> effectiveStatuses = (statuses != null && !statuses.isEmpty())
                ? statuses
                : (status != null ? List.of(status) : null);

        ru.carpet.repository.OrderQuery query = ru.carpet.repository.OrderQuery.builder()
                .statuses(effectiveStatuses).dateFrom(dateFrom).dateTo(dateTo).dateField(dateField)
                .legacyId(legacyId).orderId(orderId).paymentType(paymentType)
                .clientPhone(clientPhone).clientName(clientName).clientId(clientId)
                .sortBy(sortBy).sortDir(sortDir)
                .noCoords(noCoords).overdueActual(overdueActual).badAddress(badAddress)
                .onlyWarranty(onlyWarranty).build();

        List<Order> content = service.findAll(query, page, size);
        long totalElements = service.countAll(query);
        return new PageResponse<>(content, totalElements, page, size);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Order create(@Valid @RequestBody CreateOrderRequest request) {
        return service.create(request.clientId(), request.clientName(), request.comment(),
                request.pickupAddress(), request.deliveryAddress(), request.legacyId());
    }

    @GetMapping("/{id}")
    public Order getById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PatchMapping("/{id}/status")
    public Order updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return service.updateStatus(id, request.status(), request.cancellationReason());
    }

    @PatchMapping("/{id}/comment")
    public Order updateComment(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.updateComment(id, body.get("comment"));
    }

    /** V17: пометить заказ проблемным. body: {"is_problem": true/false, "reason": "..."} */
    @PatchMapping("/{id}/problem")
    public Order setProblem(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Boolean flag = (Boolean) body.getOrDefault("is_problem", Boolean.FALSE);
        String reason = (String) body.get("reason");
        return service.setProblem(id, Boolean.TRUE.equals(flag), reason);
    }

    @PatchMapping("/{id}/details")
    public Order updateDetails(@PathVariable Long id, @RequestBody UpdateOrderDetailsRequest request) {
        return service.updateDetails(id, request.pickupAddress(), request.deliveryAddress(), request.legacyId(),
                request.pickupDate(), request.pickupTimeSlot(), request.deliveryDate(), request.deliveryTimeSlot(),
                request.pickupDistrict(), request.deliveryDistrict(),
                request.pickupLat(), request.pickupLon(),
                request.deliveryLat(), request.deliveryLon());
    }

    @PatchMapping("/{id}/actual-dates")
    public Order updateActualDates(@PathVariable Long id, @RequestBody UpdateActualDatesRequest request) {
        return service.updateActualDates(id, request.actualPickupDate(), request.actualPickupTimeSlot(),
                request.actualDeliveryDate(), request.actualDeliveryTimeSlot());
    }

    /**
     * Назначить/снять водителя (Спринт D, фидбэк 11 мая). Используется на странице
     * «Логистика»: оператор смотрит на карточку заказа в дне, кликает по чипу
     * «Водитель» и выбирает из плиток сотрудников.
     *
     * <p>body: {@code {"employee_id": 12}} или {@code {"employee_id": null}} для снятия.
     */
    @PatchMapping("/{id}/driver")
    public Map<String, Object> setDriver(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Object raw = body.get("employee_id");
        Long employeeId = raw instanceof Number n ? n.longValue() : null;
        // MapSqlParameterSource — допускает null в значениях, в отличие от Map.of.
        jdbc.update("""
            UPDATE orders SET assigned_driver_id = :eid, updated_at = NOW()
             WHERE id = :id
            """, new MapSqlParameterSource().addValue("eid", employeeId).addValue("id", id));
        var rows = jdbc.queryForList("""
            SELECT o.assigned_driver_id, e.name AS driver_name
              FROM orders o
              LEFT JOIN employees e ON e.id = o.assigned_driver_id
             WHERE o.id = :id
            """, Map.of("id", id));
        Map<String, Object> result = new HashMap<>(rows.isEmpty() ? Map.of() : rows.get(0));
        result.put("ok", true);
        return result;
    }

    @PostMapping("/{id}/pay")
    public Order pay(@PathVariable Long id, @Valid @RequestBody PayOrderRequest request) {
        return service.pay(id, request.paymentType());
    }

    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public Order duplicateOrder(@PathVariable Long id) {
        return service.duplicateOrder(id);
    }

    @PostMapping("/{orderId}/items/{itemId}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderItem duplicateItem(@PathVariable Long orderId, @PathVariable Long itemId) {
        return service.duplicateItem(orderId, itemId);
    }

    @PostMapping("/{id}/warranty")
    @ResponseStatus(HttpStatus.CREATED)
    public Order createWarranty(@PathVariable Long id, @Valid @RequestBody ru.carpet.dto.CreateWarrantyRequest request) {
        return service.createWarranty(id, request.itemIds(), request.warrantyComment());
    }

    @GetMapping("/{id}/warranty")
    public List<Order> getWarrantyOrders(@PathVariable Long id) {
        return service.findWarrantyOrders(id);
    }

    @GetMapping("/{id}/history")
    public List<OrderStatusHistory> getHistory(@PathVariable Long id) {
        service.findById(id); // 404 если не найден
        return service.getHistory(id);
    }

    @PostMapping("/{orderId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderItem addItem(@PathVariable Long orderId,
                             @Valid @RequestBody CreateOrderItemRequest request) {
        return orderItemService.addItem(orderId, request.itemTypeId(), request.description());
    }

    @GetMapping("/{orderId}/items")
    public List<OrderItem> getItems(@PathVariable Long orderId) {
        return orderItemService.findByOrderId(orderId);
    }

    /**
     * Все услуги по всем позициям заказа одним запросом — фронт раньше делал
     * N запросов GET /api/orders/{}/items/{}/services по одному на каждую позицию.
     */
    @GetMapping("/{orderId}/services")
    public List<OrderItemServiceWithAssignees> getAllServices(@PathVariable Long orderId) {
        return serviceInstanceService.findByOrderIdWithAssignees(orderId);
    }

    @PatchMapping("/{orderId}/items/{itemId}/status")
    public OrderItem updateItemStatus(@PathVariable Long orderId,
                                      @PathVariable Long itemId,
                                      @Valid @RequestBody UpdateOrderItemStatusRequest request) {
        return orderItemService.updateStatus(itemId, request.status(), request.cancellationReason());
    }

    @PatchMapping("/{orderId}/items/{itemId}/description")
    public OrderItem updateItemDescription(@PathVariable Long orderId,
                                           @PathVariable Long itemId,
                                           @RequestBody Map<String, String> body) {
        return orderItemService.updateDescription(itemId, body.get("description"), body.get("defects"));
    }

    // Эндпоинт PATCH /items/{itemId}/price удалён: цена позиции = сумма цен услуг,
    // вручную её не редактируем (иначе путались модель и UX). Ручная цена остаётся
    // только на уровне услуги — /services/{serviceId}/price.

    @PatchMapping("/{orderId}/items/{itemId}/dimensions")
    public Map<String, Object> updateItemDimensions(@PathVariable Long orderId,
                                          @PathVariable Long itemId,
                                          @Valid @RequestBody UpdateOrderItemDimensionsRequest request) {
        OrderItem updated = orderItemService.updateDimensions(itemId, request.length(), request.width(), request.weight(),
                request.area(), request.runningMeters());
        var switches = orderItemService.getLastSwitches();
        return Map.of("item", updated, "sku_switches", switches);
    }

    @GetMapping("/{id}/modifiers")
    public List<OrderModifier> getModifiers(@PathVariable Long id) {
        return service.getModifiers(id);
    }

    @PostMapping("/{id}/modifiers")
    public Order addModifier(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        return service.addModifier(id, body.get("modifier_id"));
    }

    @DeleteMapping("/{id}/modifiers/{modifierId}")
    public Order removeModifier(@PathVariable Long id, @PathVariable Long modifierId) {
        return service.removeModifier(id, modifierId);
    }

    @PostMapping("/{id}/modifiers/push-to-client")
    public void pushModifiersToClient(@PathVariable Long id) {
        service.pushModifiersToClient(id);
    }

    @GetMapping("/{orderId}/items/{itemId}/photos")
    public List<OrderItemPhoto> getPhotos(@PathVariable Long orderId, @PathVariable Long itemId) {
        return photoRepository.findByOrderItemId(itemId);
    }

    /**
     * Все фото по всем позициям заказа одним запросом — спасает от N+1 на странице заказа.
     * Раньше фронт делал по запросу на каждую позицию.
     */
    @GetMapping("/{orderId}/photos")
    public List<OrderItemPhoto> getAllPhotos(@PathVariable Long orderId) {
        List<OrderItem> items = orderItemService.findByOrderId(orderId);
        if (items.isEmpty()) return List.of();
        return photoRepository.findByOrderItemIds(items.stream().map(OrderItem::id).toList());
    }

    @PostMapping("/{orderId}/items/{itemId}/photos")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderItemPhoto addPhoto(@PathVariable Long orderId, @PathVariable Long itemId,
                                   @RequestBody Map<String, String> body) {
        return photoRepository.save(itemId, body.get("filename"), body.get("content_type"), body.get("data"));
    }

    @DeleteMapping("/{orderId}/items/{itemId}/photos/{photoId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePhoto(@PathVariable Long orderId, @PathVariable Long itemId, @PathVariable Long photoId) {
        photoRepository.delete(photoId);
    }
}
