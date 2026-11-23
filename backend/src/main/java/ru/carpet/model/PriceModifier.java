package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Скидка или надбавка из конструктора скидок.
 *
 * <p>V60 (ПР-004, ПР-018): kind — PERCENT | FIXED | FREE_DELIVERY; promoCode —
 * кодовое слово для промокода; autoAssignToClient — закреплять за клиентом при
 * первом применении; validFrom/validTo, usageLimit, active — условия.
 * usedCount — в скольких заказах уже применена (для лимита и подсказок).
 */
public record PriceModifier(
        Long id,
        String name,
        BigDecimal percent,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String kind,
        BigDecimal amount,
        String promoCode,
        boolean autoAssignToClient,
        LocalDate validFrom,
        LocalDate validTo,
        Integer usageLimit,
        boolean active,
        long usedCount
) {}
