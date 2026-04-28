package ru.carpet.model;

import java.time.LocalDateTime;

public record AuditLogEntry(
        Long id,
        String entityType,
        Long entityId,
        String action,
        String description,
        LocalDateTime occurredAt
) {}
