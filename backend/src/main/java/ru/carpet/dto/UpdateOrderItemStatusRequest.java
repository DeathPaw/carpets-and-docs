package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.OrderItemStatus;

public record UpdateOrderItemStatusRequest(
        @NotNull OrderItemStatus status,
        /** Обязательна при переходе в CANCELLED, минимум 10 символов после trim. */
        String cancellationReason
) {}
