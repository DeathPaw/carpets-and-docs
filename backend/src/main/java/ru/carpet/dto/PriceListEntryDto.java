package ru.carpet.dto;

import java.math.BigDecimal;

public record PriceListEntryDto(
        Long id,
        Long itemTypeId,
        String itemTypeName,
        Long serviceDefId,
        String serviceDefName,
        String pricingType,
        BigDecimal price,
        BigDecimal costPrice,
        boolean isActive
) {}
