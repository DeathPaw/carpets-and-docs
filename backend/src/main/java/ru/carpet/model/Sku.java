package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * SKU — учётная единица каталога (V10, замена связки service_definitions × price_list).
 *
 * <p>Каждый SKU — это конкретная услуга с конкретным набором атрибутов и ценой.
 * Например: «Стирка ковра шерстяного 5-10 кг» — name. Группа («Стирка») —
 * для группировки в UI. Атрибуты ({@code attributes}) — массив key/value через
 * EAV-таблицу sku_attributes, могут содержать несколько значений одного ключа
 * (один SKU применим к нескольким типам вещей).
 *
 * <p>{@link #priceType} говорит, на какой параметр позиции умножать {@link #price}
 * для расчёта итога: FIXED — просто price; BY_WEIGHT — price × weight позиции;
 * BY_AREA — price × area; и т.п.
 *
 * <p>{@link #isAutoAdd} — этот SKU автоматически добавляется в каждый новый
 * заказ (заменяет старую логику default-типов).
 *
 * <p>{@link #freeThreshold} — порог суммы заказа, выше которой цена SKU
 * становится 0 (бесплатная доставка от N ₽).
 */
public record Sku(
        Long id,
        Long groupId,
        String groupName,
        String name,
        String pricingType,
        BigDecimal price,
        BigDecimal costPrice,
        boolean isAutoAdd,
        BigDecimal freeThreshold,
        boolean isActive,
        boolean isDeleted,
        Long currentVersionId,
        /**
         * V11 lifecycle: при каком статусе ЗАКАЗА автоматически завершить услугу.
         * Пример: Оформление → auto_complete_on_status = "CREATED".
         * null = не завершать автоматически.
         */
        String autoCompleteOnStatus,
        /**
         * V11 lifecycle: какой статус заказа выставить, когда ЭТА услуга завершена.
         * Пример: Доставка → triggers_order_status = "DELIVERED".
         * null = не выставлять.
         */
        String triggersOrderStatus,
        /**
         * V11 lifecycle: исключить из вычисления общего статуса заказа.
         * Оформление/Доставка/Приём не должны блокировать переход в DONE.
         */
        boolean excludeFromStatusCalc,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /**
         * Атрибуты как map {key: [values]}. Один и тот же ключ может содержать
         * несколько значений (например, item_type=[2,5,7]).
         */
        Map<String, List<String>> attributes
) {}
