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
    private final ru.carpet.service.AuditLogService auditLogService;

    public PriceModifierController(PriceModifierService service, ru.carpet.service.AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
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
        PriceModifier created = service.create(name, percent);
        auditLogService.log("PRICE_MODIFIER", created.id(), "CREATE", "Скидка/надбавка «" + name + "» " + pct(percent));
        return created;
    }

    @PutMapping("/{id}")
    public PriceModifier update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        BigDecimal percent = new BigDecimal(body.get("percent").toString());
        PriceModifier updated = service.update(id, name, percent);
        auditLogService.log("PRICE_MODIFIER", id, "UPDATE", "Изменена скидка/надбавка «" + name + "» " + pct(percent));
        return updated;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        String name;
        try { name = service.findById(id).name(); } catch (Exception e) { name = "#" + id; }
        service.delete(id);
        auditLogService.log("PRICE_MODIFIER", id, "DELETE", "Удалена скидка/надбавка «" + name + "»");
    }

    private static String pct(BigDecimal p) {
        return (p.signum() > 0 ? "+" : p.signum() < 0 ? "−" : "") + p.abs().stripTrailingZeros().toPlainString() + "%";
    }
}
