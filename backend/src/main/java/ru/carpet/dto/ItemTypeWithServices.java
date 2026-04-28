package ru.carpet.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record ItemTypeWithServices(
        Long id,
        String name,
        boolean isDefault,
        BigDecimal defaultPrice,
        BigDecimal freeThreshold,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<PriceListEntryDto> services
) {}
