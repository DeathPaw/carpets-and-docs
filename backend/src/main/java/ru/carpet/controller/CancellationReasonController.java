package ru.carpet.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.CancellationReason;
import ru.carpet.repository.CancellationReasonRepository;
import ru.carpet.service.AuditLogService;

import java.util.List;

/**
 * Справочник причин отмены заказа (V46, правка №3 от 13.09).
 *
 * <p>Формулировки правит владелец в Справочниках — без релиза. Удаления нет:
 * причина гасится, иначе статистика прошлых периодов потеряла бы строки.
 */
@RestController
@RequestMapping("/api/cancellation-reasons")
public class CancellationReasonController {

    private final CancellationReasonRepository repository;
    private final AuditLogService auditLogService;

    public CancellationReasonController(CancellationReasonRepository repository, AuditLogService auditLogService) {
        this.repository = repository;
        this.auditLogService = auditLogService;
    }

    /** Тело запроса: код задаётся только при создании, дальше он неизменен. */
    public record CancellationReasonRequest(
            String code,
            @NotBlank(message = "Укажите формулировку причины") String name,
            Boolean requiresNote,
            Integer sortOrder,
            Boolean isActive
    ) {}

    @GetMapping
    public List<CancellationReason> getAll(
            @RequestParam(name = "active_only", defaultValue = "false") boolean activeOnly) {
        return repository.findAll(activeOnly);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CancellationReason create(@Valid @RequestBody CancellationReasonRequest request) {
        String code = request.code() == null || request.code().isBlank()
                // Код нужен для связи с заказами, но оператору его придумывать незачем.
                ? "CUSTOM_" + System.nanoTime()
                : request.code().trim().toUpperCase();
        if (repository.findByCode(code).isPresent()) {
            throw new BusinessRuleException("Причина с кодом " + code + " уже есть");
        }
        CancellationReason r = repository.save(code, request.name().trim(),
                Boolean.TRUE.equals(request.requiresNote()),
                request.sortOrder() == null ? 0 : request.sortOrder(),
                request.isActive() == null || request.isActive());
        auditLogService.log("CANCEL_REASON", r.id(), "CREATE", "Добавлена причина отмены: " + r.name());
        return r;
    }

    @PutMapping("/{id}")
    public CancellationReason update(@PathVariable Long id, @Valid @RequestBody CancellationReasonRequest request) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Причина не найдена: " + id));
        CancellationReason r = repository.update(id, request.name().trim(),
                Boolean.TRUE.equals(request.requiresNote()),
                request.sortOrder() == null ? 0 : request.sortOrder(),
                request.isActive() == null || request.isActive());
        auditLogService.log("CANCEL_REASON", id, "UPDATE", "Изменена причина отмены: " + r.name()
                + (r.isActive() ? "" : " (скрыта)"));
        return r;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable Long id) {
        CancellationReason r = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Причина не найдена: " + id));
        repository.deactivate(id);
        auditLogService.log("CANCEL_REASON", id, "DEACTIVATE", "Скрыта причина отмены: " + r.name());
    }
}
