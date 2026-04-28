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
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
