package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.AddServiceRequest;
import ru.carpet.dto.AssignEmployeesRequest;
import ru.carpet.dto.OrderItemServiceWithAssignees;
import ru.carpet.dto.UpdateServiceStatusRequest;
import ru.carpet.dto.UpdateServicePriceRequest;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.OrderItemServiceInstanceService;

import java.util.List;

@RestController
@RequestMapping("/api/orders/{orderId}/items/{itemId}/services")
public class OrderItemServiceController {

    private final OrderItemServiceInstanceService service;
    private final AuditLogService auditLogService;

    public OrderItemServiceController(OrderItemServiceInstanceService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<OrderItemServiceWithAssignees> getServices(@PathVariable Long orderId,
                                                            @PathVariable Long itemId) {
        return service.findByOrderItemIdWithAssignees(itemId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderItemServiceWithAssignees addService(@PathVariable Long orderId,
                                                     @PathVariable Long itemId,
                                                     @Valid @RequestBody AddServiceRequest request) {
        OrderItemServiceWithAssignees result = service.addServiceWithAssignees(itemId, request.skuId());
        auditLogService.log("ORDER_SERVICE", result.id(), "CREATE",
                "Добавлена услуга \"" + (result.skuName() != null ? result.skuName() : "SKU #" + result.skuId()) +
                "\" к позиции #" + itemId + " заказа #" + orderId);
        return result;
    }

    @PatchMapping("/{serviceId}/status")
    public OrderItemServiceWithAssignees updateStatus(@PathVariable Long orderId,
                                                       @PathVariable Long itemId,
                                                       @PathVariable Long serviceId,
                                                       @Valid @RequestBody UpdateServiceStatusRequest request) {
        OrderItemServiceWithAssignees result = service.updateStatusWithAssignees(serviceId, request.status(), request.cancellationReason());
        auditLogService.log("ORDER_SERVICE", serviceId, "STATUS_CHANGE",
                "Статус услуги #" + serviceId + " (позиция #" + itemId + ", заказ #" + orderId + "): → " + request.status()
                        + (request.status() == ru.carpet.model.ServiceStatus.CANCELLED && request.cancellationReason() != null
                            ? " (причина: " + request.cancellationReason().trim() + ")" : ""));
        return result;
    }

    @PatchMapping("/{serviceId}/price")
    public OrderItemServiceWithAssignees updatePrice(@PathVariable Long orderId,
                                                      @PathVariable Long itemId,
                                                      @PathVariable Long serviceId,
                                                      @Valid @RequestBody UpdateServicePriceRequest request) {
        OrderItemServiceWithAssignees result = service.updatePriceWithAssignees(serviceId, request.price());
        auditLogService.log("ORDER_SERVICE", serviceId, "PRICE_CHANGE",
                "Цена услуги #" + serviceId + " (позиция #" + itemId + ", заказ #" + orderId + "): " + request.price() + "₽ (вручную)");
        return result;
    }

    @PostMapping("/{serviceId}/assignees")
    public OrderItemServiceWithAssignees assignEmployees(@PathVariable Long orderId,
                                                          @PathVariable Long itemId,
                                                          @PathVariable Long serviceId,
                                                          @Valid @RequestBody AssignEmployeesRequest request) {
        return service.assignEmployeesWithAssignees(serviceId, request.employeeIds());
    }
}
