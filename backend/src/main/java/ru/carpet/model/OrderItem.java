package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderItem(
        Long id,
        Long orderId,
        Long itemTypeId,
        String itemTypeName,
        String description,
        String defects,
        OrderItemStatus status,
        BigDecimal price,
        BigDecimal length,
        BigDecimal width,
        BigDecimal weight,
        BigDecimal area,
        BigDecimal runningMeters,
        /** Периметр (V10). Самостоятельная мера; формула 2(L+W) работает только
         *  для прямоугольника, а у нас бывают овальные/круглые ковры. */
        BigDecimal perimeter,
        String cancellationReason,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /** V58 (ПР-017): цена позиции до обнуления в гарантийном заказе. */
        BigDecimal warrantyOriginalPrice,
        /**
         * V63 (ПР-002): сколько одинаковых изделий в позиции. Размеры — на одну
         * штуку; цена и метры умножаются на quantity.
         */
        int quantity
) {
    /** Площадь всех штук позиции (для метров, себестоимости, контрактов). */
    public BigDecimal totalArea() {
        return area == null ? null : area.multiply(BigDecimal.valueOf(quantity));
    }
}
