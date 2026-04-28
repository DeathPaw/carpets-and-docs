package ru.carpet.model;

import java.time.LocalDateTime;

public record ErrorLogEntry(
        Long id,
        String errorType,
        String message,
        String requestPath,
        LocalDateTime occurredAt
) {}
