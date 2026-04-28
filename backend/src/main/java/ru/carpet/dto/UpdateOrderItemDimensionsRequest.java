package ru.carpet.dto;

import java.math.BigDecimal;

public record UpdateOrderItemDimensionsRequest(
        BigDecimal length,
        BigDecimal width,
        BigDecimal weight,
        BigDecimal area,
        BigDecimal runningMeters
) {}
