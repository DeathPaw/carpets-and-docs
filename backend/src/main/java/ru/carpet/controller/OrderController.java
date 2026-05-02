package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.*;
import ru.carpet.model.*;
import ru.carpet.repository.OrderItemPhotoRepository;
import ru.carpet.service.OrderItemService;
import ru.carpet.service.OrderService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService service;
    private final OrderItemService orderItemService;
    private final OrderItemPhotoRepository photoRepository;

    public OrderController(OrderService service, OrderItemService orderItemService,
                           OrderItemPhotoRepository photoRepository) {
        this.service = service;
        this.orderItemService = orderItemService;
        this.photoRepository = photoRepository;
    }

    @GetMapping
    public PageResponse<Order> getAll(
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long legacyId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) String paymentType,
            @RequestParam(required = false) String clientPhone,
            @RequestParam(required = false) String clientName,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortDir,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        List<Order> content = service.findAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, clientPhone, clientName, sortBy, sortDir, page, size);
        long totalElements = service.countAll(status, dateFrom, dateTo, legacyId, orderId, paymentType, clientPhone, clientName);
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
        return service.updateStatus(id, request.status());
    }

    @PatchMapping("/{id}/comment")
    public Order updateComment(@PathVariable Long id, @RequestBody Map<String, String> body) {
        return service.updateComment(id, body.get("comment"));
    }

    @PatchMapping("/{id}/details")
    public Order updateDetails(@PathVariable Long id, @RequestBody UpdateOrderDetailsRequest request) {
        return service.updateDetails(id, request.pickupAddress(), request.deliveryAddress(), request.legacyId(),
                request.pickupDate(), request.pickupTimeSlot(), request.deliveryDate(), request.deliveryTimeSlot(),
                request.pickupDistrict(), request.deliveryDistrict());
    }

    @PatchMapping("/{id}/actual-dates")
    public Order updateActualDates(@PathVariable Long id, @RequestBody UpdateActualDatesRequest request) {
        return service.updateActualDates(id, request.actualPickupDate(), request.actualPickupTimeSlot(),
                request.actualDeliveryDate(), request.actualDeliveryTimeSlot());
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

    @GetMapping("/{orderId}/items/{itemId}/photos")
    public List<OrderItemPhoto> getPhotos(@PathVariable Long orderId, @PathVariable Long itemId) {
        return photoRepository.findByOrderItemId(itemId);
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
