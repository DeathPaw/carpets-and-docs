package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateOrderRequest(
        Long clientId,
        @NotBlank String clientName,
        String comment,
        String pickupAddress,
        String deliveryAddress,
        Long legacyId,
        /** V5: при импорте заказа из старой системы (legacy_id задан) — позволяем
         *  оператору указать дату создания в прошлом. Формат ISO YYYY-MM-DDTHH:MM:SS
         *  или просто YYYY-MM-DD. Игнорируется если legacy_id == null. */
        java.time.LocalDateTime createdAt
) {}
