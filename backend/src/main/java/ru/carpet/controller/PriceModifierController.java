package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.model.PriceModifier;
import ru.carpet.service.PriceModifierService;

import java.util.List;
import java.util.Map;
import java.math.BigDecimal;

@RestController
@RequestMapping("/api/price-modifiers")
public class PriceModifierController {

    private final PriceModifierService service;

    public PriceModifierController(PriceModifierService service) {
        this.service = service;
    }

    @GetMapping
    public List<PriceModifier> getAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PriceModifier create(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        BigDecimal percent = new BigDecimal(body.get("percent").toString());
        return service.create(name, percent);
    }

    @PutMapping("/{id}")
    public PriceModifier update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        BigDecimal percent = new BigDecimal(body.get("percent").toString());
        return service.update(id, name, percent);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
