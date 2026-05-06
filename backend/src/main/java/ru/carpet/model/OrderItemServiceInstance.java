package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderItemServiceInstance(
        Long id,
        Long orderItemId,
        Long serviceDefId,
        ServiceStatus status,
        BigDecimal price,
        Boolean isManualPrice,
        String cancellationReason,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
