package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.*;
import ru.carpet.model.*;
import ru.carpet.service.OrderItemService;
import ru.carpet.service.OrderService;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService service;
    private final OrderItemService orderItemService;

    public OrderController(OrderService service, OrderItemService orderItemService) {
        this.service = service;
        this.orderItemService = orderItemService;
    }

    @GetMapping
    public List<Order> getAll(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long legacyId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) String paymentType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return service.findAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, page, size);
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
        return service.updateStatus(id, request.status());
    }

    @PatchMapping("/{id}/comment")
    public Order updateComment(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.updateComment(id, body.get("comment"));
    }

    @PatchMapping("/{id}/details")
    public Order updateDetails(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String pickupAddress = (String) body.get("pickup_address");
        String deliveryAddress = (String) body.get("delivery_address");
        Number legacyIdNum = (Number) body.get("legacy_id");
        Long legacyId = legacyIdNum != null ? legacyIdNum.longValue() : null;
        String pickupDateStr = (String) body.get("pickup_date");
        LocalDate pickupDate = pickupDateStr != null && !pickupDateStr.isEmpty() ? LocalDate.parse(pickupDateStr) : null;
        String pickupTimeSlot = (String) body.get("pickup_time_slot");
        String deliveryDateStr = (String) body.get("delivery_date");
        LocalDate deliveryDate = deliveryDateStr != null && !deliveryDateStr.isEmpty() ? LocalDate.parse(deliveryDateStr) : null;
        String deliveryTimeSlot = (String) body.get("delivery_time_slot");
        String pickupDistrict = (String) body.get("pickup_district");
        String deliveryDistrict = (String) body.get("delivery_district");
        return service.updateDetails(id, pickupAddress, deliveryAddress, legacyId,
                pickupDate, pickupTimeSlot, deliveryDate, deliveryTimeSlot, pickupDistrict, deliveryDistrict);
    }

    @PatchMapping("/{id}/actual-dates")
    public Order updateActualDates(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String pickupDateStr = (String) body.get("actual_pickup_date");
        LocalDate pickupDate = pickupDateStr != null && !pickupDateStr.isEmpty() ? LocalDate.parse(pickupDateStr) : null;
        String pickupTimeSlot = (String) body.get("actual_pickup_time_slot");
        String deliveryDateStr = (String) body.get("actual_delivery_date");
        LocalDate deliveryDate = deliveryDateStr != null && !deliveryDateStr.isEmpty() ? LocalDate.parse(deliveryDateStr) : null;
        String deliveryTimeSlot = (String) body.get("actual_delivery_time_slot");
        return service.updateActualDates(id, pickupDate, pickupTimeSlot, deliveryDate, deliveryTimeSlot);
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

    @PatchMapping("/{orderId}/items/{itemId}/status")
    public OrderItem updateItemStatus(@PathVariable Long orderId,
                                      @PathVariable Long itemId,
                                      @Valid @RequestBody UpdateOrderItemStatusRequest request) {
        return orderItemService.updateStatus(itemId, request.status());
    }

    @PatchMapping("/{orderId}/items/{itemId}/description")
    public OrderItem updateItemDescription(@PathVariable Long orderId,
                                           @PathVariable Long itemId,
                                           @RequestBody Map<String, String> body) {
        return orderItemService.updateDescription(itemId, body.get("description"), body.get("defects"));
    }

    @PatchMapping("/{orderId}/items/{itemId}/price")
    public OrderItem updateItemPrice(@PathVariable Long orderId,
                                     @PathVariable Long itemId,
                                     @Valid @RequestBody UpdatePriceRequest request) {
        return orderItemService.updatePrice(itemId, request.price());
    }

    @PatchMapping("/{orderId}/items/{itemId}/dimensions")
    public OrderItem updateItemDimensions(@PathVariable Long orderId,
                                          @PathVariable Long itemId,
                                          @Valid @RequestBody UpdateOrderItemDimensionsRequest request) {
        return orderItemService.updateDimensions(itemId, request.length(), request.width(), request.weight(),
                request.area(), request.runningMeters());
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
}
