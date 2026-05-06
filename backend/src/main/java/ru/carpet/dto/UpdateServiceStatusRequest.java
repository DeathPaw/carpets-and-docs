package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.ServiceStatus;

public record UpdateServiceStatusRequest(
        @NotNull ServiceStatus status,
        /** Обязательна при переходе в CANCELLED, минимум 10 символов после trim. */
        String cancellationReason
) {}
