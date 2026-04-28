package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.OrderItemStatus;

public record UpdateOrderItemStatusRequest(@NotNull OrderItemStatus status) {}
