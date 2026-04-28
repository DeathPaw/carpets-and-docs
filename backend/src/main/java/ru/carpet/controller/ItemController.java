package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.OrderItem;
import ru.carpet.model.OrderItemStatus;
import ru.carpet.service.ItemFilterService;

import java.util.List;

@RestController
@RequestMapping("/api/items")
public class ItemController {

    private final ItemFilterService service;

    public ItemController(ItemFilterService service) {
        this.service = service;
    }

    @GetMapping
    public List<OrderItem> getItems(
            @RequestParam(required = false) OrderItemStatus status,
            @RequestParam(required = false) Long itemTypeId,
            @RequestParam(required = false) Long orderId,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return service.findItems(status, itemTypeId, orderId, employeeId, page, size);
    }
}
