package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Схема оплаты сотрудника с периодом действия (ТЗ v2, блок 3).
 *
 * <p>В один момент у сотрудника действует одна схема; прошлые сохраняются,
 * чтобы закрытые месяцы считались по тем ставкам, что были тогда.
 *
 * @param scheme PIECEWORK — сделка за метры, SALARY — оклад,
 *               DRIVER_POINTS — за точки, DRIVER_SHIFT — смена с доплатой
 */
public record PayScheme(
        Long id,
        Long employeeId,
        String employeeName,
        String scheme,
        LocalDate validFrom,
        LocalDate validTo,
        BigDecimal ratePerSqm,
        BigDecimal salary,
        BigDecimal pointRate,
        BigDecimal shiftHours,
        BigDecimal shiftFix,
        Integer pointsIncluded,
        BigDecimal extraPointRate,
        String comment,
        String createdBy,
        LocalDateTime createdAt
) {}
