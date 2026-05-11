package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Тип вещи клиента (V10): «Ковёр», «Тюль», «Шторы», «Покрывало», и т.п.
 *
 * <p>Раньше тип нёс на себе ценовую логику (is_default/default_price/free_threshold)
 * для default-позиций типа «Доставка». Сейчас эта логика на SKU
 * (см. {@link Sku#isAutoAdd()} / {@link Sku#freeThreshold()}). Тип — просто
 * категория вещи клиента.
 */
public record ItemType(
        Long id,
        String name,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
