package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Пользователь системы (оператор, администратор, супервизор, readonly).
 * Не путать с {@link Employee} — сотрудник выполняет услуги, а пользователь
 * входит в web-интерфейс. Один человек может быть и тем, и другим
 * (связь через {@code employeeId}).
 */
public record AppUser(
        Long id,
        String username,
        String passwordHash,
        String displayName,
        String role,        // SUPERVISOR | ADMIN | OPERATOR | READONLY
        Long employeeId,    // nullable — привязка к employees для авто-назначения
        boolean isActive,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /** V62 (ПР-016): выборочные права поверх роли — см. {@link #ALL_PERMISSIONS}. */
        java.util.List<String> permissions
) {
    /** Допустимые права. Супервизору доступно всё без них. */
    public static final java.util.List<String> ALL_PERMISSIONS =
            java.util.List.of("REPORTS", "PAYROLL_VIEW", "PAYROLL_SHIFTS", "PAYROLL_EDIT");
}
