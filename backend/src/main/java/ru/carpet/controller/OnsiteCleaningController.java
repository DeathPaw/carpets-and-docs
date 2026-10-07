package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.repository.ContractRepository;
import ru.carpet.repository.OnsiteCleaningRepository;
import ru.carpet.service.AuditLogService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Выездные чистки (ТЗ v2, блок 5): работа у клиента, без приёма и доставки.
 */
@RestController
@RequestMapping("/api/onsite-cleanings")
public class OnsiteCleaningController {

    private final OnsiteCleaningRepository repository;
    private final ContractRepository contractRepository;
    private final AuditLogService auditLogService;

    public OnsiteCleaningController(OnsiteCleaningRepository repository,
                                    ContractRepository contractRepository,
                                    AuditLogService auditLogService) {
        this.repository = repository;
        this.contractRepository = contractRepository;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) LocalDate from,
                                          @RequestParam(required = false) LocalDate to,
                                          @RequestParam(required = false) String status) {
        return repository.findAll(from, to, status);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        var cleaning = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Выездная чистка не найдена: " + id));
        var result = new java.util.LinkedHashMap<>(cleaning);
        result.put("workers", repository.workers(id));
        return result;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        validate(body);
        Long id = repository.save(body, AuditUser.current());
        saveWorkers(id, body);
        auditLogService.log("ONSITE_CLEANING", id, "CREATE",
                "Выездная чистка у «" + body.get("client_name") + "» на " + body.get("cleaning_date")
                        + (body.get("area") != null ? ", " + body.get("area") + " м²" : ""));
        return get(id);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Выездная чистка не найдена: " + id));
        validate(body);
        repository.update(id, body);
        saveWorkers(id, body);
        auditLogService.log("ONSITE_CLEANING", id, "UPDATE", "Выездная чистка #" + id + " изменена");
        return get(id);
    }

    /** Завершение или отмена. Завершение ставит дату — по ней идут метры и ФОТ. */
    @PatchMapping("/{id}/status")
    public Map<String, Object> setStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String status = body.getOrDefault("status", "");
        if (!List.of("PLANNED", "DONE", "CANCELLED").contains(status)) {
            throw new BusinessRuleException("Неизвестный статус: " + status);
        }
        var cleaning = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Выездная чистка не найдена: " + id));
        if ("DONE".equals(status) && cleaning.get("area") == null) {
            throw new BusinessRuleException("Перед завершением укажите объём работ в м² — по нему считается выработка.");
        }
        repository.setStatus(id, status);
        // V54: выезд по контракту засчитывается в факт по завершении — пишем это
        // в историю сдачи, чтобы в план-факте было видно, откуда взялись метры.
        Object contractId = cleaning.get("contract_id");
        if (contractId != null && !status.equals(cleaning.get("status"))) {
            boolean done = "DONE".equals(status);
            boolean wasDone = "DONE".equals(cleaning.get("status"));
            if (done || wasDone) {
                BigDecimal sqm = cleaning.get("area") == null
                        ? BigDecimal.ZERO : new BigDecimal(String.valueOf(cleaning.get("area")));
                contractRepository.logDelivery(((Number) contractId).longValue(), null, id, sqm,
                        done ? "DELIVERED" : "CANCELLED", null, AuditUser.current());
            }
        }
        auditLogService.log("ONSITE_CLEANING", id, "STATUS_CHANGE",
                "Выездная чистка #" + id + " → " + statusLabel(status));
        return get(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        repository.delete(id);
        auditLogService.log("ONSITE_CLEANING", id, "DELETE", "Выездная чистка #" + id + " удалена");
    }

    private void validate(Map<String, Object> body) {
        if (body.get("client_name") == null || String.valueOf(body.get("client_name")).isBlank()) {
            throw new BusinessRuleException("Укажите клиента");
        }
        if (body.get("cleaning_date") == null) {
            throw new BusinessRuleException("Укажите дату выезда");
        }
    }

    /**
     * Исполнители и их доли. Если доли не заданы — делим поровну: то же
     * правило, что у ковров в цеху.
     */
    @SuppressWarnings("unchecked")
    private void saveWorkers(Long id, Map<String, Object> body) {
        List<Map<String, Object>> workers = (List<Map<String, Object>>) body.getOrDefault("workers", List.of());
        if (workers.isEmpty()) {
            repository.replaceWorkers(id, List.of());
            return;
        }
        boolean hasPercents = workers.stream().anyMatch(w -> w.get("percent") != null);
        if (!hasPercents) {
            BigDecimal each = BigDecimal.valueOf(100)
                    .divide(BigDecimal.valueOf(workers.size()), 5, java.math.RoundingMode.HALF_UP);
            BigDecimal distributed = BigDecimal.ZERO;
            for (int i = 0; i < workers.size(); i++) {
                BigDecimal pct = i == workers.size() - 1
                        ? BigDecimal.valueOf(100).subtract(distributed) : each;
                distributed = distributed.add(pct);
                workers.get(i).put("percent", pct);
            }
        } else {
            BigDecimal sum = workers.stream()
                    .map(w -> new BigDecimal(String.valueOf(w.getOrDefault("percent", "0"))))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (sum.compareTo(BigDecimal.valueOf(100)) != 0) {
                throw new BusinessRuleException("Сумма долей исполнителей должна быть равна 100, сейчас " + sum);
            }
        }
        repository.replaceWorkers(id, workers);
    }

    private static String statusLabel(String status) {
        return switch (status) {
            case "PLANNED" -> "запланирована";
            case "DONE" -> "выполнена";
            case "CANCELLED" -> "отменена";
            default -> status;
        };
    }
}
