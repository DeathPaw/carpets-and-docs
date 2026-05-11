package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.model.ItemType;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.ItemTypeService;

import java.util.List;
import java.util.Map;

/**
 * Типы вещей клиента (V10). Поля упростились — теперь только {@code name}.
 * Default-логика переехала на SKU (см. {@link ru.carpet.model.Sku}).
 */
@RestController
@RequestMapping("/api/item-types")
public class ItemTypeController {

    private final ItemTypeService service;
    private final AuditLogService auditLogService;

    public ItemTypeController(ItemTypeService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<ItemType> getAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ItemType getById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemType create(@RequestBody Map<String, String> body) {
        ItemType t = service.create(body.get("name"));
        auditLogService.log("ITEM_TYPE", t.id(), "CREATE", "Создан тип позиции: " + t.name());
        return t;
    }

    @PutMapping("/{id}")
    public ItemType update(@PathVariable Long id, @RequestBody Map<String, String> body) {
        ItemType t = service.update(id, body.get("name"));
        auditLogService.log("ITEM_TYPE", id, "UPDATE", "Обновлён тип позиции: " + t.name());
        return t;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
        auditLogService.log("ITEM_TYPE", id, "DELETE", "Удалён тип позиции #" + id);
    }
}
