package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Затрата: материальная закупка или прочий расход (ТЗ v2, блок 2).
 *
 * <p>Два реестра — один тип записи: поля совпадают, различается смысл
 * ({@link #kind()}) и то, что у закупки есть количество и единица. Главное
 * отличие от старого реестра месячных расходов — способ учёта в себестоимости
 * ({@link #allocation()}): на месяц, на период или прямо на заказ.
 *
 * @param kind        MATERIAL — закупка у поставщика, OTHER — прочая затрата
 * @param allocation  MONTH | PERIOD | ORDER
 * @param filesCount  сколько вложений прикреплено (счета, акты, фото чека)
 */
public record CostEntry(
        Long id,
        String kind,
        LocalDate entryDate,
        Long categoryId,
        String categoryName,
        String title,
        BigDecimal quantity,
        String unit,
        BigDecimal amount,
        String counterparty,
        String comment,
        String allocation,
        LocalDate allocMonth,
        LocalDate allocFrom,
        LocalDate allocTo,
        Long allocOrderId,
        String createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        int filesCount
) {}
