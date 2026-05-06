package ru.carpet.dto;

import ru.carpet.model.OrderItemStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Позиция заказа с дополнительным полем «номер позиции в заказе» (position_in_order).
 * Возвращается из ItemFilterService, чтобы UI мог показывать «#3 в заказе #00042».
 */
public record OrderItemWithPosition(
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
        String cancellationReason,
        int positionInOrder,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
