package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderModifier(Long id, Long orderId, Long modifierId, String modifierName, BigDecimal percent, LocalDateTime createdAt) {}
