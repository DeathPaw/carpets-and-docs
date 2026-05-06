package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.OrderStatus;

public record UpdateOrderStatusRequest(
        @NotNull OrderStatus status,
        /** Обязательна при переходе в CANCELLED, минимум 10 символов после trim. */
        String cancellationReason
) {}
