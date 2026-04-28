package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;

public record ServiceDefinitionRequest(
        @NotBlank String name,
        BigDecimal basePrice,
        @NotBlank String pricingType
) {}
