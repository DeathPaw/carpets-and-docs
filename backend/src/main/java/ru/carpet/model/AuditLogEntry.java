package ru.carpet.model;

import java.time.LocalDateTime;

public record AuditLogEntry(
        Long id,
        String entityType,
        Long entityId,
        String action,
        String description,
        LocalDateTime occurredAt,
        /** V41: кто сделал — логин оператора или «Имя (кабинет)» работника. У старых записей пусто. */
        String actor
) {}
