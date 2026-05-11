package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.AttributeDefinition;
import ru.carpet.repository.AttributeDefinitionRepository;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/attribute-definitions")
public class AttributeDefinitionController {

    private final AttributeDefinitionRepository repository;

    public AttributeDefinitionController(AttributeDefinitionRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public List<AttributeDefinition> all() { return repository.findAll(); }

    @PostMapping
    public AttributeDefinition create(@RequestBody Map<String, Object> body) {
        return repository.create(
                (String) body.get("key"),
                (String) body.get("label"),
                (String) body.get("value_type"),
                body.get("unit") == null ? null : (String) body.get("unit"),
                body.get("sort_order") == null ? 100 : ((Number) body.get("sort_order")).intValue()
        );
    }

    @DeleteMapping("/{key}")
    public void delete(@PathVariable String key) { repository.delete(key); }
}
