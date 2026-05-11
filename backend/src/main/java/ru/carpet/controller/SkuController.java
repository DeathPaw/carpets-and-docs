package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.Sku;
import ru.carpet.service.SkuService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * REST API для SKU (V10).
 *
 * <p>Эндпоинты:
 *   GET    /api/skus                     — список (с атрибутами).
 *   GET    /api/skus/{id}                — один SKU + атрибуты.
 *   POST   /api/skus                     — создать.
 *   PUT    /api/skus/{id}                — обновить (создаёт новую версию).
 *   DELETE /api/skus/{id}                — soft-delete.
 *   GET    /api/skus/{id}/history        — все версии (popover в UI).
 *   GET    /api/skus/matching            — найти подходящие под параметры позиции.
 */
@RestController
@RequestMapping("/api/skus")
public class SkuController {

    private final SkuService service;

    public SkuController(SkuService service) {
        this.service = service;
    }

    @GetMapping
    public List<Sku> all() { return service.findAll(); }

    @GetMapping("/{id}")
    public Sku one(@PathVariable Long id) { return service.findById(id); }

    @PostMapping
    public Sku create(@RequestBody SkuRequest body) {
        return service.create(body.groupId, body.name, body.pricingType, body.price, body.costPrice,
                body.isAutoAdd, body.freeThreshold, body.attributes);
    }

    @PutMapping("/{id}")
    public Sku update(@PathVariable Long id, @RequestBody SkuRequest body) {
        return service.update(id, body.groupId, body.name, body.pricingType, body.price, body.costPrice,
                body.isAutoAdd, body.freeThreshold, body.attributes);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) { service.delete(id); }

    @GetMapping("/{id}/history")
    public List<Map<String, Object>> history(@PathVariable Long id) { return service.versions(id); }

    @GetMapping("/matching")
    public List<Map<String, Object>> matching(
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Long itemTypeId,
            @RequestParam(required = false) BigDecimal weight,
            @RequestParam(required = false) BigDecimal area,
            @RequestParam(required = false) BigDecimal perimeter,
            @RequestParam(required = false) BigDecimal length,
            @RequestParam(required = false) BigDecimal width,
            @RequestParam(required = false) BigDecimal runningMeters
    ) {
        return service.findMatching(groupId, itemTypeId, weight, area, perimeter, length, width, runningMeters);
    }

    /**
     * Запрос на создание/обновление SKU. Поля совпадают с моделью + Map атрибутов
     * с разрешением нескольких значений на ключ.
     */
    public static class SkuRequest {
        public Long groupId;
        public String name;
        public String pricingType;
        public BigDecimal price;
        public BigDecimal costPrice;
        public boolean isAutoAdd;
        public BigDecimal freeThreshold;
        public Map<String, List<String>> attributes;
    }
}
