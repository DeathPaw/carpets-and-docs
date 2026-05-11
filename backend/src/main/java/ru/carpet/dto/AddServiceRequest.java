package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;

/** V10: добавление услуги к позиции через выбор SKU. */
public record AddServiceRequest(@NotNull Long skuId) {}
