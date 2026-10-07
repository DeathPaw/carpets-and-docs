package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.model.PayScheme;
import ru.carpet.repository.PayrollRepository;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.PayrollService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * ФОТ: схемы оплаты, табель, точки, ведомость (ТЗ v2, блоки 3 и 4).
 */
@RestController
@RequestMapping("/api/payroll")
public class PayrollController {

    private final PayrollRepository repository;
    private final PayrollService service;
    private final AuditLogService auditLogService;

    public PayrollController(PayrollRepository repository, PayrollService service,
                             AuditLogService auditLogService) {
        this.repository = repository;
        this.service = service;
        this.auditLogService = auditLogService;
    }

    // ---------------- схемы оплаты ----------------

    @GetMapping("/schemes")
    public List<PayScheme> schemes(@RequestParam(required = false) Long employeeId) {
        return repository.schemes(employeeId);
    }

    @PostMapping("/schemes")
    @ResponseStatus(HttpStatus.CREATED)
    public PayScheme createScheme(@RequestBody Map<String, Object> body) {
        Long employeeId = requireLong(body.get("employee_id"), "Не выбран сотрудник");
        String scheme = String.valueOf(body.getOrDefault("scheme", "")).trim();
        if (!List.of("PIECEWORK", "SALARY", "DRIVER_POINTS", "DRIVER_SHIFT").contains(scheme)) {
            throw new BusinessRuleException("Неизвестная схема оплаты: " + scheme);
        }
        LocalDate from = body.get("valid_from") == null
                ? LocalDate.now() : LocalDate.parse(String.valueOf(body.get("valid_from")));
        validateSchemeParams(scheme, body);

        // В один момент действует одна схема: предыдущую закрываем днём раньше.
        repository.closeOpenSchemes(employeeId, from);
        Long id = repository.saveScheme(new PayScheme(
                null, employeeId, null, scheme, from,
                body.get("valid_to") == null ? null : LocalDate.parse(String.valueOf(body.get("valid_to"))),
                decimal(body.get("rate_per_sqm")), decimal(body.get("salary")), decimal(body.get("point_rate")),
                decimal(body.get("shift_hours")), decimal(body.get("shift_fix")),
                body.get("points_included") == null ? null : ((Number) body.get("points_included")).intValue(),
                decimal(body.get("extra_point_rate")),
                (String) body.get("comment"), null, null), AuditUser.current());

        auditLogService.log("PAYROLL", employeeId, "UPDATE",
                "Сотруднику #" + employeeId + " назначена схема оплаты «" + schemeLabel(scheme) + "» с " + from);
        return repository.schemes(employeeId).stream()
                .filter(s -> s.id().equals(id)).findFirst().orElseThrow();
    }

    @DeleteMapping("/schemes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteScheme(@PathVariable Long id) {
        repository.deleteScheme(id);
        auditLogService.log("PAYROLL", id, "DELETE", "Удалена схема оплаты #" + id);
    }

    // ---------------- правило долей ----------------

    @GetMapping("/share-rule")
    public Map<String, Object> shareRule(@RequestParam String yearMonth) {
        var rule = repository.shareRule(yearMonth).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("year_month", yearMonth);
        result.put("mode", rule == null ? "EQUAL" : rule.get("mode"));
        result.put("members", rule == null
                ? List.of() : repository.shareRuleMembers(((Number) rule.get("id")).longValue()));
        return result;
    }

    @PutMapping("/share-rule")
    public Map<String, Object> saveShareRule(@RequestBody Map<String, Object> body) {
        String yearMonth = String.valueOf(body.get("year_month"));
        String mode = String.valueOf(body.getOrDefault("mode", "EQUAL"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> members = (List<Map<String, Object>>) body.getOrDefault("members", List.of());

        if ("PERCENT".equals(mode)) {
            BigDecimal sum = members.stream()
                    .map(m -> new BigDecimal(String.valueOf(m.get("percent"))))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (sum.compareTo(BigDecimal.valueOf(100)) != 0) {
                throw new BusinessRuleException("Сумма процентов должна быть равна 100, сейчас " + sum);
            }
        }
        Long ruleId = repository.upsertShareRule(yearMonth, mode, AuditUser.current());
        repository.replaceShareRuleMembers(ruleId, "PERCENT".equals(mode) ? members : List.of());
        auditLogService.log("PAYROLL", ruleId, "UPDATE",
                "Правило долей за " + yearMonth + ": " + ("PERCENT".equals(mode) ? "проценты" : "поровну"));
        return shareRule(yearMonth);
    }

    // ---------------- доли на ковре ----------------

    @GetMapping("/item-shares/{itemId}")
    public List<Map<String, Object>> itemShares(@PathVariable Long itemId) {
        return repository.itemShares(itemId);
    }

    @PutMapping("/item-shares/{itemId}")
    public List<Map<String, Object>> setItemShares(@PathVariable Long itemId,
                                                   @RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> shares = (List<Map<String, Object>>) body.getOrDefault("shares", List.of());
        BigDecimal sum = shares.stream()
                .map(s -> new BigDecimal(String.valueOf(s.get("percent"))))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (sum.compareTo(BigDecimal.valueOf(100)) != 0) {
            throw new BusinessRuleException("Сумма долей должна быть равна 100, сейчас " + sum);
        }
        repository.replaceItemShares(itemId, shares, "MANUAL", "MANUAL");
        auditLogService.log("PAYROLL", itemId, "UPDATE", "Доли за ковёр #" + itemId + " изменены вручную");
        return repository.itemShares(itemId);
    }

    // ---------------- табель ----------------

    @GetMapping("/shifts")
    public List<Map<String, Object>> shifts(@RequestParam String yearMonth,
                                            @RequestParam(required = false) Long employeeId) {
        return repository.shifts(yearMonth, employeeId);
    }

    @PostMapping("/shifts")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addShift(@RequestBody Map<String, Object> body) {
        Long employeeId = requireLong(body.get("employee_id"), "Не выбран сотрудник");
        LocalDate date = LocalDate.parse(String.valueOf(body.get("shift_date")));
        String reason = body.get("reason") == null ? "добавлено вручную" : String.valueOf(body.get("reason"));
        repository.ensureShift(employeeId, date, "MANUAL", reason, AuditUser.current());
        auditLogService.log("PAYROLL", employeeId, "UPDATE",
                "Смена сотрудника #" + employeeId + " за " + date + " добавлена вручную (" + reason + ")");
        return Map.of("ok", true);
    }

    @DeleteMapping("/shifts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteShift(@PathVariable Long id) {
        repository.deleteShift(id);
        auditLogService.log("PAYROLL", id, "DELETE", "Смена #" + id + " убрана из табеля");
    }

    // ---------------- точки ----------------

    @GetMapping("/points")
    public List<Map<String, Object>> points(@RequestParam String yearMonth,
                                            @RequestParam(required = false) Long employeeId) {
        return repository.driverPoints(yearMonth, employeeId);
    }

    // ---------------- ведомость ----------------

    @GetMapping("/sheet")
    public Map<String, Object> sheet(@RequestParam String yearMonth) {
        return service.sheet(yearMonth);
    }

    @GetMapping("/entries")
    public List<Map<String, Object>> entries(@RequestParam String yearMonth,
                                             @RequestParam(required = false) Long employeeId) {
        return repository.entries(yearMonth, employeeId);
    }

    @PostMapping("/recalculate")
    public Map<String, Object> recalculate(@RequestParam String yearMonth) {
        return service.recalculateMonth(yearMonth);
    }

    @PostMapping("/entries")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addEntry(@RequestBody Map<String, Object> body) {
        Long employeeId = requireLong(body.get("employee_id"), "Не выбран сотрудник");
        String yearMonth = String.valueOf(body.get("year_month"));
        LocalDate date = body.get("entry_date") == null
                ? LocalDate.now() : LocalDate.parse(String.valueOf(body.get("entry_date")));
        BigDecimal amount = decimal(body.get("amount"));
        if (amount == null) throw new BusinessRuleException("Не указана сумма");
        String details = String.valueOf(body.getOrDefault("details", "")).trim();
        if (details.isEmpty()) throw new BusinessRuleException("Укажите основание начисления");

        Long id = repository.addManualEntry(employeeId, yearMonth, date, amount, details, AuditUser.current());
        auditLogService.log("PAYROLL", employeeId, "UPDATE",
                "Ручное начисление сотруднику #" + employeeId + " за " + yearMonth + ": "
                        + amount.stripTrailingZeros().toPlainString() + " ₽ (" + details + ")");
        return Map.of("id", id);
    }

    @PatchMapping("/entries/{id}")
    public Map<String, Object> correctEntry(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        BigDecimal amount = decimal(body.get("amount"));
        if (amount == null) throw new BusinessRuleException("Не указана сумма");
        String reason = String.valueOf(body.getOrDefault("reason", "")).trim();
        if (reason.isEmpty()) throw new BusinessRuleException("Укажите причину корректировки");
        repository.correctEntry(id, amount, reason, AuditUser.current());
        auditLogService.log("PAYROLL", id, "UPDATE",
                "Начисление #" + id + " исправлено: " + amount.stripTrailingZeros().toPlainString()
                        + " ₽ (" + reason + ")");
        return Map.of("ok", true);
    }

    /** Вернуть строку к автоматическому расчёту. */
    @PostMapping("/entries/{id}/reset")
    public Map<String, Object> resetEntry(@PathVariable Long id) {
        repository.resetEntry(id);
        auditLogService.log("PAYROLL", id, "UPDATE", "Начисление #" + id + " возвращено к автоматическому расчёту");
        return Map.of("ok", true);
    }

    @DeleteMapping("/entries/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteEntry(@PathVariable Long id) {
        repository.deleteEntry(id);
        auditLogService.log("PAYROLL", id, "DELETE", "Начисление #" + id + " удалено");
    }

    // ---------------- месяц ----------------

    @GetMapping("/month")
    public Map<String, Object> month(@RequestParam String yearMonth) {
        return repository.month(yearMonth);
    }

    @PutMapping("/month")
    public Map<String, Object> saveMonth(@RequestBody Map<String, Object> body) {
        String yearMonth = String.valueOf(body.get("year_month"));
        Integer norm = body.get("norm_days") == null ? null : ((Number) body.get("norm_days")).intValue();
        if (norm != null && norm <= 0) throw new BusinessRuleException("Норма рабочих дней должна быть больше нуля");
        repository.upsertMonth(yearMonth, norm);
        auditLogService.log("PAYROLL", null, "UPDATE",
                "Норма рабочих дней за " + yearMonth + ": " + (norm == null ? "не задана" : norm));
        return repository.month(yearMonth);
    }

    @PostMapping("/month/close")
    public Map<String, Object> close(@RequestParam String yearMonth) {
        service.closeMonth(yearMonth, true);
        return repository.month(yearMonth);
    }

    @PostMapping("/month/open")
    public Map<String, Object> open(@RequestParam String yearMonth) {
        service.closeMonth(yearMonth, false);
        return repository.month(yearMonth);
    }

    // ---------------- вспомогательное ----------------

    private void validateSchemeParams(String scheme, Map<String, Object> body) {
        switch (scheme) {
            case "PIECEWORK" -> require(body.get("rate_per_sqm"), "Укажите тариф за м²");
            case "SALARY" -> require(body.get("salary"), "Укажите оклад");
            case "DRIVER_POINTS" -> require(body.get("point_rate"), "Укажите ставку за точку");
            case "DRIVER_SHIFT" -> {
                require(body.get("shift_fix"), "Укажите оплату смены");
                // Порог и ставку сверх порога можно не задавать: тогда это просто фикс за смену.
            }
            default -> throw new BusinessRuleException("Неизвестная схема: " + scheme);
        }
    }

    private static void require(Object v, String message) {
        if (v == null || String.valueOf(v).isBlank()) throw new BusinessRuleException(message);
    }

    private static Long requireLong(Object v, String message) {
        if (v == null) throw new BusinessRuleException(message);
        return ((Number) v).longValue();
    }

    private static BigDecimal decimal(Object v) {
        if (v == null || String.valueOf(v).isBlank()) return null;
        return new BigDecimal(String.valueOf(v));
    }

    private static String schemeLabel(String scheme) {
        return switch (scheme) {
            case "PIECEWORK" -> "сделка за метры";
            case "SALARY" -> "оклад";
            case "DRIVER_POINTS" -> "водитель за точки";
            case "DRIVER_SHIFT" -> "водитель за смену";
            default -> scheme;
        };
    }
}
