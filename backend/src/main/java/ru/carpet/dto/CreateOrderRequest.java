package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateOrderRequest(
        Long clientId,
        @NotBlank String clientName,
        String comment,
        String pickupAddress,
        String deliveryAddress,
        Long legacyId
) {}
