package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

public record ItemTypeRequest(
        @NotBlank String name,
        boolean isDefault,
        BigDecimal defaultPrice,
        BigDecimal freeThreshold
) {}
