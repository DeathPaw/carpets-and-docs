package ru.carpet.model;

import java.time.LocalDateTime;

public record District(
        Long id,
        String name,
        int sortOrder,
        boolean isActive,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
