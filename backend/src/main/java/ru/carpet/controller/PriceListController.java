package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.PriceListEntryDto;
import ru.carpet.service.PriceListService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/price-list")
public class PriceListController {

    private final PriceListService service;

    public PriceListController(PriceListService service) {
        this.service = service;
    }

    @GetMapping
    public List<PriceListEntryDto> getAll(@RequestParam(required = false) Long itemTypeId) {
        if (itemTypeId != null) {
            return service.findByItemTypeId(itemTypeId);
        }
        return service.findAll();
    }

    @PatchMapping("/{id}")
    public PriceListEntryDto updatePrice(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Object priceObj = body.get("price");
        BigDecimal price = priceObj != null ? new BigDecimal(priceObj.toString()) : null;
        Object costPriceObj = body.get("cost_price");
        BigDecimal costPrice = costPriceObj != null ? new BigDecimal(costPriceObj.toString()) : null;
        return service.updatePrice(id, price, costPrice);
    }
}
