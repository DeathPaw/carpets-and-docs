package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;

public record CreateOrderItemRequest(@NotNull Long itemTypeId, String description) {}
