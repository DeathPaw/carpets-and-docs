package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.DistrictRequest;
import ru.carpet.model.District;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.DistrictService;

import java.util.List;

@RestController
@RequestMapping("/api/districts")
public class DistrictController {

    private final DistrictService service;
    private final AuditLogService auditLogService;

    public DistrictController(DistrictService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<District> getAll(@RequestParam(name = "active_only", defaultValue = "false") boolean activeOnly) {
        return service.findAll(activeOnly);
    }

    @GetMapping("/{id}")
    public District getById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public District create(@Valid @RequestBody DistrictRequest request) {
        District d = service.create(request.name(), request.sortOrder(), request.isActive());
        auditLogService.log("DISTRICT", d.id(), "CREATE", "Создан район: " + d.name());
        return d;
    }

    @PutMapping("/{id}")
    public District update(@PathVariable Long id, @Valid @RequestBody DistrictRequest request) {
        District d = service.update(id, request.name(), request.sortOrder(), request.isActive());
        auditLogService.log("DISTRICT", id, "UPDATE", "Обновлён район: " + d.name());
        return d;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
        auditLogService.log("DISTRICT", id, "DELETE", "Удалён район #" + id);
    }
}
