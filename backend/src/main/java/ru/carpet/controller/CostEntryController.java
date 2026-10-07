package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.carpet.audit.AuditUser;
import ru.carpet.dto.CostEntryRequest;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.CostEntry;
import ru.carpet.repository.CostEntryRepository;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.CostAllocationService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Реестры затрат и себестоимость на метр (ТЗ v2, блок 2).
 *
 * <p>Два реестра — материальные закупки и прочие затраты — живут в одной
 * таблице и различаются параметром {@code kind}. У каждой записи есть способ
 * учёта в себестоимости; отчёт «на метр» показывает удельный расход месяца и
 * суммы, которые распределить не на что.
 */
@RestController
@RequestMapping("/api/cost-entries")
public class CostEntryController {

    private final CostEntryRepository repository;
    private final CostAllocationService allocationService;
    private final AuditLogService auditLogService;

    public CostEntryController(CostEntryRepository repository,
                               CostAllocationService allocationService,
                               AuditLogService auditLogService) {
        this.repository = repository;
        this.allocationService = allocationService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(required = false) String kind,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String counterparty,
            @RequestParam(required = false) String allocation,
            @RequestParam(required = false) String search
    ) {
        var filters = new CostEntryRepository.Filters(kind, from, to, categoryId, counterparty, allocation, search);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totals", repository.totals(filters));
        result.put("rows", repository.findAll(filters));
        return result;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CostEntry create(@Valid @RequestBody CostEntryRequest request) {
        CostEntry entry = toEntry(request);
        Long id = repository.save(entry, AuditUser.current());
        auditLogService.log("COST_ENTRY", id, "CREATE", describe("Добавлена", entry));
        return repository.findById(id).orElseThrow();
    }

    @PutMapping("/{id}")
    public CostEntry update(@PathVariable Long id, @Valid @RequestBody CostEntryRequest request) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Затрата не найдена: " + id));
        CostEntry entry = toEntry(request);
        repository.update(id, entry);
        auditLogService.log("COST_ENTRY", id, "UPDATE", describe("Изменена", entry));
        return repository.findById(id).orElseThrow();
    }

    /** Кнопка «Учёт в себестоимости» в строке реестра. */
    @PatchMapping("/{id}/allocation")
    public CostEntry setAllocation(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        CostEntry existing = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Затрата не найдена: " + id));
        String allocation = String.valueOf(body.getOrDefault("allocation", "")).trim();
        LocalDate month = parseDate(body.get("alloc_month"));
        LocalDate from = parseDate(body.get("alloc_from"));
        LocalDate to = parseDate(body.get("alloc_to"));
        Long orderId = body.get("alloc_order_id") == null
                ? null : Long.valueOf(String.valueOf(body.get("alloc_order_id")));

        validateAllocation(allocation, month, from, to, orderId);
        repository.updateAllocation(id, allocation, normalizeMonth(month), from, to, orderId);
        auditLogService.log("COST_ENTRY", id, "UPDATE",
                "Затрата «" + existing.title() + "»: учёт в себестоимости — " + allocationLabel(allocation, month, from, to, orderId));
        return repository.findById(id).orElseThrow();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        CostEntry entry = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Затрата не найдена: " + id));
        repository.delete(id);
        auditLogService.log("COST_ENTRY", id, "DELETE",
                "Удалена затрата «" + entry.title() + "» на " + money(entry.amount()) + " ₽");
    }

    // ---------- вложения ----------

    @GetMapping("/{id}/files")
    public List<Map<String, Object>> files(@PathVariable Long id) {
        return repository.listFiles(id);
    }

    @PostMapping("/{id}/files")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addFile(@PathVariable Long id, @RequestBody Map<String, String> body) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Затрата не найдена: " + id));
        String data = body.get("data");
        if (data == null || data.isBlank()) throw new BusinessRuleException("Пустой файл");
        Long fileId = repository.addFile(id, body.getOrDefault("filename", "документ"),
                body.getOrDefault("content_type", "application/octet-stream"), data);
        auditLogService.log("COST_ENTRY", id, "UPDATE", "К затрате #" + id + " прикреплён документ");
        return Map.of("id", fileId);
    }

    /** Файл отдаём как файл: документы открывают и печатают, а не разбирают в JSON. */
    @GetMapping("/{id}/files/{fileId}")
    public ResponseEntity<byte[]> file(@PathVariable Long id, @PathVariable Long fileId) {
        var row = repository.getFile(id, fileId).orElse(null);
        if (row == null) return ResponseEntity.notFound().build();
        String data = String.valueOf(row.get("data"));
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        byte[] bytes;
        try {
            bytes = java.util.Base64.getDecoder().decode(data.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
        String contentType = row.get("content_type") == null
                ? "application/octet-stream" : String.valueOf(row.get("content_type"));
        return ResponseEntity.ok().header("Content-Type", contentType).body(bytes);
    }

    @DeleteMapping("/{id}/files/{fileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFile(@PathVariable Long id, @PathVariable Long fileId) {
        repository.deleteFile(id, fileId);
        auditLogService.log("COST_ENTRY", id, "UPDATE", "У затраты #" + id + " удалён документ");
    }

    // ---------- себестоимость ----------

    /** Удельный расход по месяцам: метры, отнесённые суммы, ₽/м² и нераспределённое. */
    @GetMapping("/cost-per-meter")
    public List<CostAllocationService.MonthCost> costPerMeter() {
        return allocationService.costPerMeter();
    }

    /** Себестоимость заказа: прямые расходы плюс доля накладных по его метрам. */
    @GetMapping("/order/{orderId}")
    public Map<String, Object> orderCost(@PathVariable Long orderId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("cost", allocationService.orderCost(orderId));
        result.put("direct_entries", repository.findByOrderId(orderId));
        return result;
    }

    // ---------- вспомогательное ----------

    private CostEntry toEntry(CostEntryRequest r) {
        String kind = r.kind() == null ? "" : r.kind().trim();
        if (!kind.equals("MATERIAL") && !kind.equals("OTHER")) {
            throw new BusinessRuleException("Неизвестный вид записи: " + kind);
        }
        String allocation = r.allocation() == null || r.allocation().isBlank() ? "MONTH" : r.allocation().trim();
        // По умолчанию затрата ложится на месяц своей даты — так оператору не
        // приходится выбирать месяц для каждой обычной покупки.
        LocalDate month = allocation.equals("MONTH")
                ? normalizeMonth(r.allocMonth() != null ? r.allocMonth() : r.entryDate())
                : null;
        LocalDate from = allocation.equals("PERIOD") ? r.allocFrom() : null;
        LocalDate to = allocation.equals("PERIOD") ? r.allocTo() : null;
        Long orderId = allocation.equals("ORDER") ? r.allocOrderId() : null;
        validateAllocation(allocation, month, from, to, orderId);

        return new CostEntry(null, kind, r.entryDate(), r.categoryId(), null,
                r.title().trim(),
                kind.equals("MATERIAL") ? r.quantity() : null,
                kind.equals("MATERIAL") ? trimToNull(r.unit()) : null,
                r.amount(), trimToNull(r.counterparty()), trimToNull(r.comment()),
                allocation, month, from, to, orderId,
                null, null, null, 0);
    }

    private void validateAllocation(String allocation, LocalDate month,
                                    LocalDate from, LocalDate to, Long orderId) {
        switch (allocation) {
            case "MONTH" -> {
                if (month == null) throw new BusinessRuleException("Выберите месяц отнесения затраты");
            }
            case "PERIOD" -> {
                if (from == null || to == null) throw new BusinessRuleException("Укажите начало и конец периода");
                if (from.isAfter(to)) throw new BusinessRuleException("Начало периода позже его конца");
            }
            case "ORDER" -> {
                if (orderId == null) throw new BusinessRuleException("Выберите заказ для прямого расхода");
            }
            default -> throw new BusinessRuleException("Неизвестный способ учёта: " + allocation);
        }
    }

    /** В базе месяц хранится первым числом — так его удобно сравнивать и группировать. */
    private static LocalDate normalizeMonth(LocalDate d) {
        return d == null ? null : d.withDayOfMonth(1);
    }

    private static String allocationLabel(String allocation, LocalDate month,
                                          LocalDate from, LocalDate to, Long orderId) {
        return switch (allocation) {
            case "MONTH"  -> "месяц " + (month == null ? "—" : month.getYear() + "-" + String.format("%02d", month.getMonthValue()));
            case "PERIOD" -> "период " + from + " — " + to;
            case "ORDER"  -> "прямо на заказ #" + String.format("%05d", orderId);
            default        -> allocation;
        };
    }

    private static String describe(String verb, CostEntry e) {
        String kind = "MATERIAL".equals(e.kind()) ? "закупка" : "затрата";
        return verb + " " + kind + " «" + e.title() + "» на " + money(e.amount()) + " ₽ ("
                + allocationLabel(e.allocation(), e.allocMonth(), e.allocFrom(), e.allocTo(), e.allocOrderId()) + ")";
    }

    private static String money(BigDecimal v) {
        return v == null ? "0" : v.stripTrailingZeros().toPlainString();
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static LocalDate parseDate(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        if (s.isEmpty()) return null;
        // Из формы месяц приходит как «2026-09» — дополняем до полной даты.
        if (s.length() == 7) s = s + "-01";
        return LocalDate.parse(s);
    }
}
