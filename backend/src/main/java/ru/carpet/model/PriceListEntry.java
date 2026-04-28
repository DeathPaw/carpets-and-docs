package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PriceListEntry(
        Long id,
        Long itemTypeId,
        Long serviceDefId,
        BigDecimal price,
        boolean isActive,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
