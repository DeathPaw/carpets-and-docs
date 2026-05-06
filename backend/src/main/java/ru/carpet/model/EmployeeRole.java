package ru.carpet.model;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Роль сотрудника — набор типов позиций, с которыми он умеет работать.
 *
 * <p>{@code itemTypeIds} наполняется при чтении через JOIN с {@code employee_role_item_types}.
 * При записи передаётся отдельным запросом — таблица связи M:N управляется явно.
 */
public record EmployeeRole(
        Long id,
        String name,
        String description,
        List<Long> itemTypeIds,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
