package ru.carpet.model;

import java.time.LocalDateTime;

public record OrderStatusHistory(
        Long id,
        Long orderId,
        OrderStatus oldStatus,
        OrderStatus newStatus,
        LocalDateTime changedAt
) {}
