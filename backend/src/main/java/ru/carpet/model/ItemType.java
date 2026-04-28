package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ItemType(
        Long id,
        String name,
        boolean isDefault,
        BigDecimal defaultPrice,
        BigDecimal freeThreshold,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
