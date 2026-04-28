package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.ItemTypeRequest;
import ru.carpet.dto.ItemTypeWithServices;
import ru.carpet.model.ItemType;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.ItemTypeService;

import java.util.List;

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
    public List<ItemTypeWithServices> getAll() {
        return service.findAll().stream()
                .map(t -> service.findByIdWithServices(t.id()))
                .toList();
    }

    @GetMapping("/{id}")
    public ItemTypeWithServices getById(@PathVariable Long id) {
        return service.findByIdWithServices(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ItemType create(@Valid @RequestBody ItemTypeRequest request) {
        ItemType t = service.create(request.name(), request.isDefault(), request.defaultPrice(), request.freeThreshold());
        auditLogService.log("ITEM_TYPE", t.id(), "CREATE", "Создан тип позиции: " + t.name());
        return t;
    }

    @PutMapping("/{id}")
    public ItemType update(@PathVariable Long id, @Valid @RequestBody ItemTypeRequest request) {
        ItemType t = service.update(id, request.name(), request.isDefault(), request.defaultPrice(), request.freeThreshold());
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
