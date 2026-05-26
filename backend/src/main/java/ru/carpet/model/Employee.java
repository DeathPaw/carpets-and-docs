package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Сотрудник.
 *
 * <p>{@code roleId} — необязательная привязка к роли (см. {@link EmployeeRole}).
 * Сотрудник без роли может быть назначен на любые услуги (legacy, по умолчанию).
 * Сотрудник с ролью назначается только на позиции тех типов, что входят в роль.
 */
public record Employee(
        Long id,
        String name,
        /** V15: телефон и email в отдельных колонках. Раньше было одно поле `contact` —
         *  юр.лица записывали туда e-mail, физлица — телефон, и в UI выходил винегрет. */
        String phone,
        String email,
        boolean active,
        Long roleId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {}
