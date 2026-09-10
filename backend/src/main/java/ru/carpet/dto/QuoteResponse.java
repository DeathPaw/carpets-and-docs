package ru.carpet.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Результат предварительного расчёта (правка №9). Считается по тем же правилам,
 * что и настоящий заказ: цена услуги — {@code PricingHelper}, забор и доставка —
 * auto-add SKU с порогом бесплатности, модификаторы — процент от базы, итог
 * округляется вниз до сотни.
 *
 * @param items           по одному результату на каждое изделие запроса, в том же
 *                        порядке — даже для незаполненных, чтобы индексы совпадали
 * @param logistics       обязательные позиции заказа: оформление, забор, доставка
 * @param goodsAmount     изделия и их услуги
 * @param baseAmount      goodsAmount + logistics, до модификаторов
 * @param roundingAmount  разница от округления итога вниз до сотни, ≤ 0
 * @param freeThreshold   сумма изделий, начиная с которой забор и доставка бесплатны
 */
public record QuoteResponse(
        List<ItemResult> items,
        List<Line> logistics,
        List<ModifierLine> modifiers,
        BigDecimal goodsAmount,
        BigDecimal baseAmount,
        BigDecimal modifiersAmount,
        BigDecimal roundingAmount,
        BigDecimal totalAmount,
        BigDecimal freeThreshold,
        List<String> warnings) {

    public record ItemResult(Long itemTypeId, String itemTypeName, BigDecimal area,
                             List<Line> services, BigDecimal price) {}

    /**
     * Строка услуги.
     *
     * @param unitPrice базовая цена SKU (за м², кг или штуку)
     * @param free      позиция стала бесплатной по порогу
     * @param matches   услуга подходит изделию по типу и размерам
     */
    public record Line(Long skuId, String name, String pricingType,
                       BigDecimal unitPrice, BigDecimal price, boolean free, boolean matches) {}

    public record ModifierLine(Long modifierId, String name, BigDecimal percent, BigDecimal amount) {}
}
