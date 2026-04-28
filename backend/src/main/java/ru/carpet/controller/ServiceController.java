package ru.carpet.controller;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import ru.carpet.model.OrderItemServiceInstance;
import ru.carpet.model.ServiceStatus;
import ru.carpet.service.ServiceFilterService;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/services")
public class ServiceController {

    private final ServiceFilterService service;

    public ServiceController(ServiceFilterService service) {
        this.service = service;
    }

    @GetMapping
    public List<OrderItemServiceInstance> getServices(
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) ServiceStatus status,
            @RequestParam(required = false) Long itemTypeId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime dateTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return service.findServices(employeeId, status, itemTypeId, orderId, dateFrom, dateTo, page, size);
    }
}
