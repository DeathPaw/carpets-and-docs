package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PriceModifier(Long id, String name, BigDecimal percent, LocalDateTime createdAt, LocalDateTime updatedAt) {}
