package ru.carpet.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Фиксация возврата или компенсации по заказу (V45, правка №3 от 19.09).
 *
 * @param kind       FULL_REFUND | PARTIAL_REFUND | ITEM_COMPENSATION | OTHER
 * @param occurredOn когда деньги отдали; пусто — сегодня
 */
public record CreateRefundRequest(
        @NotBlank(message = "Не указан тип события")
        String kind,

        @NotNull(message = "Не указана сумма")
        @DecimalMin(value = "0.01", message = "Сумма должна быть больше нуля")
        BigDecimal amount,

        @NotBlank(message = "Укажите причину")
        String reason,

        String comment,

        LocalDate occurredOn
) {}
