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
        PriceModifier created = service.create(input(body));
        auditLogService.log("PRICE_MODIFIER", created.id(), "CREATE", "Скидка/надбавка «" + created.name() + "» " + describe(created));
        return created;
    }

    @PutMapping("/{id}")
    public PriceModifier update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        PriceModifier updated = service.update(id, input(body));
        auditLogService.log("PRICE_MODIFIER", id, "UPDATE", "Изменена скидка/надбавка «" + updated.name() + "» " + describe(updated));
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

    /** V60: поля конструктора скидки из тела запроса. Без kind — старая процентная скидка. */
    private static ru.carpet.repository.PriceModifierRepository.Input input(Map<String, Object> body) {
        return new ru.carpet.repository.PriceModifierRepository.Input(
                (String) body.get("name"),
                decimal(body.get("percent")),
                body.get("kind") == null ? "PERCENT" : body.get("kind").toString(),
                decimal(body.get("amount")),
                body.get("promo_code") == null ? null : body.get("promo_code").toString(),
                Boolean.TRUE.equals(body.get("auto_assign_to_client")),
                date(body.get("valid_from")),
                date(body.get("valid_to")),
                body.get("usage_limit") == null || body.get("usage_limit").toString().isBlank()
                        ? null : Integer.valueOf(body.get("usage_limit").toString()),
                !Boolean.FALSE.equals(body.get("is_active")));
    }

    private static BigDecimal decimal(Object v) {
        return v == null || v.toString().isBlank() ? null : new BigDecimal(v.toString());
    }

    private static java.time.LocalDate date(Object v) {
        return v == null || v.toString().isBlank() ? null : java.time.LocalDate.parse(v.toString());
    }

    private static String describe(PriceModifier m) {
        String what = switch (m.kind()) {
            case "FIXED" -> "−" + m.amount().stripTrailingZeros().toPlainString() + " ₽";
            case "FREE_DELIVERY" -> "бесплатная доставка";
            default -> pct(m.percent());
        };
        return what + (m.promoCode() != null ? ", промокод " + m.promoCode() : "")
                + (m.autoAssignToClient() ? ", закрепляется за клиентом" : "");
    }

    private static String pct(BigDecimal p) {
        return (p.signum() > 0 ? "+" : p.signum() < 0 ? "−" : "") + p.abs().stripTrailingZeros().toPlainString() + "%";
    }
}
