package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Определение атрибута SKU (V10).
 * value_type:
 *   NUMBER              — числовое значение (вес, площадь, периметр и т.д.);
 *   STRING              — строковое (материал, цвет);
 *   REFERENCE_ITEM_TYPE — id типа вещи из {@code item_types}.
 */
public record AttributeDefinition(
        String key,
        String label,
        String valueType,
        String unit,
        int sortOrder,
        LocalDateTime createdAt
) {}
