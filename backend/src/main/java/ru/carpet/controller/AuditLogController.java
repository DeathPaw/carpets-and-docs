package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.model.AuditLogEntry;
import ru.carpet.service.AuditLogService;

import java.util.List;

@RestController
@RequestMapping("/api/audit-log")
public class AuditLogController {

    private final AuditLogService service;

    public AuditLogController(AuditLogService service) {
        this.service = service;
    }

    @GetMapping
    public List<AuditLogEntry> getAll(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) Long entityId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size
    ) {
        return service.findAll(entityType, action, entityId, page, size);
    }
}
