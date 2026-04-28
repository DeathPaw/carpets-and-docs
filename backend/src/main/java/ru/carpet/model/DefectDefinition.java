package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record DefectDefinition(
        Long id,
        String name,
        BigDecimal surchargePercent,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
