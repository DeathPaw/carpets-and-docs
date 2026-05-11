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

    public SkuGroupController(SkuGroupRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<SkuGroup> all() { return repository.findAll(); }

    @PostMapping
    public SkuGroup create(@RequestBody Map<String, Object> body) {
        return repository.create((String) body.get("name"),
                body.get("sort_order") == null ? 100 : ((Number) body.get("sort_order")).intValue());
    }

    @PutMapping("/{id}")
    public SkuGroup update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return repository.update(id, (String) body.get("name"),
                body.get("sort_order") == null ? 100 : ((Number) body.get("sort_order")).intValue());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) { repository.delete(id); }
}
