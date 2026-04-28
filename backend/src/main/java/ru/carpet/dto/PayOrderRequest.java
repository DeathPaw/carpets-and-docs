package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.PaymentType;

public record PayOrderRequest(@NotNull PaymentType paymentType) {}
