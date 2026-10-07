package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Корректировка данных ковра (V44, правка №2 от 17.09).
 *
 * <p>Запись о том, что фактические данные ковра разошлись с тем, что указал
 * оператор при оформлении: перемерили размеры или определили другой материал.
 * Оператору важна не только новая цена, но и прежняя — чтобы объяснить
 * клиенту, откуда взялась разница.
 *
 * @param field       {@code DIMENSIONS} — размеры, {@code ITEM_TYPE} — тип/материал
 * @param source      {@code PRODUCTION} — кабинет работника, {@code OPERATOR} — карточка заказа
 * @param itemName    описание позиции и тип — чтобы список корректировок читался без доп. запросов
 */
public record OrderItemAdjustment(
        Long id,
        Long orderItemId,
        Long orderId,
        String itemName,
        String field,
        String oldValue,
        String newValue,
        BigDecimal priceBefore,
        BigDecimal priceAfter,
        String changedBy,
        String source,
        LocalDateTime createdAt
) {}
