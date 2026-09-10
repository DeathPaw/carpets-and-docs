package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.SkuGroup;
import ru.carpet.repository.SkuGroupRepository;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/sku-groups")
public class SkuGroupController {

    private final SkuGroupRepository repository;
    private final ru.carpet.service.AuditLogService auditLogService;

    public SkuGroupController(SkuGroupRepository repository, ru.carpet.service.AuditLogService auditLogService) {
        this.repository = repository;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<SkuGroup> all() { return repository.findAll(); }

    @PostMapping
    public SkuGroup create(@RequestBody Map<String, Object> body) {
        SkuGroup group = repository.create((String) body.get("name"),
                body.get("sort_order") == null ? 100 : ((Number) body.get("sort_order")).intValue());
        auditLogService.log("SKU_GROUP", group.id(), "CREATE", "Группа услуг «" + body.get("name") + "»");
        return group;
    }

    @PutMapping("/{id}")
    public SkuGroup update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        SkuGroup group = repository.update(id, (String) body.get("name"),
                body.get("sort_order") == null ? 100 : ((Number) body.get("sort_order")).intValue());
        auditLogService.log("SKU_GROUP", id, "UPDATE", "Изменена группа услуг «" + body.get("name") + "»");
        return group;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        repository.delete(id);
        auditLogService.log("SKU_GROUP", id, "DELETE", "Удалена группа услуг #" + id);
    }
}
