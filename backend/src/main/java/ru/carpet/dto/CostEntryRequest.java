package ru.carpet.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Затрата: материальная закупка или прочий расход (ТЗ v2, блок 2).
 *
 * @param kind        MATERIAL | OTHER
 * @param allocation  MONTH | PERIOD | ORDER — способ учёта в себестоимости
 * @param allocMonth  для MONTH: любая дата месяца, сервер нормализует к первому числу
 */
public record CostEntryRequest(
        @NotBlank(message = "Не указан вид записи")
        String kind,

        @NotNull(message = "Не указана дата")
        LocalDate entryDate,

        Long categoryId,

        @NotBlank(message = "Укажите наименование")
        String title,

        BigDecimal quantity,
        String unit,

        @NotNull(message = "Не указана сумма")
        @DecimalMin(value = "0.00", message = "Сумма не может быть отрицательной")
        BigDecimal amount,

        String counterparty,
        String comment,

        String allocation,
        LocalDate allocMonth,
        LocalDate allocFrom,
        LocalDate allocTo,
        Long allocOrderId
) {}
