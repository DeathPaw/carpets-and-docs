package ru.carpet.model;

/**
 * Типы расчета стоимости услуг.
 */
public enum PricingType {
    /** Фиксированная стоимость (не зависит от параметров) */
    FIXED,
    /** Стоимость зависит от веса (base_price × weight) */
    BY_WEIGHT,
    /** Стоимость зависит от площади (base_price × length × width) */
    BY_AREA,
    /** Стоимость зависит от периметра (base_price × 2 × (length + width)) */
    BY_PERIMETER
}
