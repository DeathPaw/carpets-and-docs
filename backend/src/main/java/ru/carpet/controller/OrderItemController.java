package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.OrderItem;
import ru.carpet.service.OrderItemService;

@RestController
@RequestMapping("/api/order-items")
public class OrderItemController {

    private final OrderItemService service;

    public OrderItemController(OrderItemService service) {
        this.service = service;
    }

    @GetMapping("/{id}")
    public OrderItem getById(@PathVariable Long id) {
        return service.findById(id);
    }
}