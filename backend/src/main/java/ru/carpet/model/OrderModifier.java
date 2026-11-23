package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Скидка/надбавка, применённая к заказу — снимок на момент применения.
 *
 * <p>V60: kind, amount, promoCode остаются в заказе, даже если скидку потом
 * выключат или поменяют. discountAmount — фактический эффект в рублях
 * (минус — скидка), пересчитывается вместе с итогом заказа.
 */
public record OrderModifier(
        Long id,
        Long orderId,
        Long modifierId,
        String modifierName,
        BigDecimal percent,
        LocalDateTime createdAt,
        String kind,
        BigDecimal amount,
        String promoCode,
        BigDecimal discountAmount
) {}
