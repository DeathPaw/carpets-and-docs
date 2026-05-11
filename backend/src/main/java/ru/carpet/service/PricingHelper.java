package ru.carpet.service;

import ru.carpet.model.OrderItem;

import java.math.BigDecimal;

/**
 * Помощник расчёта цены услуги под позицию (V10).
 *
 * <p>Раньше жил отдельным {@code PricingService}; здесь — минимум:
 * берём базовую цену SKU и умножаем на нужный параметр позиции согласно
 * {@code pricingType} SKU.
 */
public final class PricingHelper {

    private PricingHelper() {}

    /**
     * Цена услуги для конкретной позиции.
     * Если у SKU pricingType = FIXED — возвращаем basePrice.
     * Если BY_* — умножаем basePrice на соответствующий параметр позиции
     * (вес/площадь/периметр/длина/ширина/погонные метры). Если параметра нет —
     * возвращаем basePrice без множителя (фронт покажет «не заполнены размеры»).
     */
    public static BigDecimal calculate(BigDecimal basePrice, String pricingType, OrderItem item) {
        if (basePrice == null) return BigDecimal.ZERO;
        if (pricingType == null) return basePrice;
        return switch (pricingType) {
            case "BY_WEIGHT"         -> mul(basePrice, item.weight());
            case "BY_AREA"           -> mul(basePrice, item.area());
            case "BY_PERIMETER"      -> mul(basePrice, item.perimeter());
            case "BY_LENGTH"         -> mul(basePrice, item.length());
            case "BY_WIDTH"          -> mul(basePrice, item.width());
            case "BY_RUNNING_METERS" -> mul(basePrice, item.runningMeters());
            case "FIXED"             -> basePrice;
            default                  -> basePrice;
        };
    }

    private static BigDecimal mul(BigDecimal base, BigDecimal factor) {
        if (factor == null) return base;
        return base.multiply(factor);
    }

    /**
     * Проверяет, заполнены ли в позиции параметры, нужные для расчёта по этому
     * pricingType. Возвращает {@code null} если ок, иначе описание недостающих.
     */
    public static String checkDimensions(String pricingType, OrderItem item) {
        if (pricingType == null) return null;
        return switch (pricingType) {
            case "BY_WEIGHT"         -> item.weight() == null         ? "вес" : null;
            case "BY_AREA"           -> item.area() == null           ? "площадь" : null;
            case "BY_PERIMETER"      -> item.perimeter() == null      ? "периметр" : null;
            case "BY_LENGTH"         -> item.length() == null         ? "длина" : null;
            case "BY_WIDTH"          -> item.width() == null          ? "ширина" : null;
            case "BY_RUNNING_METERS" -> item.runningMeters() == null  ? "погонные метры" : null;
            default                  -> null;
        };
    }
}
