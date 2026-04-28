package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ServiceDefinition(
        Long id, 
        String name, 
        BigDecimal basePrice, 
        PricingType pricingType, 
        LocalDateTime createdAt, 
        LocalDateTime updatedAt
) {}
