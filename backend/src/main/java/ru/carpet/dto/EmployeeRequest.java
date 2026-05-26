package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * DTO для создания/редактирования сотрудника.
 *
 * <p>{@code roleId} — необязательная привязка к роли. {@code null} = без роли (универсал,
 * может назначаться на любые услуги — обратная совместимость).
 */
public record EmployeeRequest(
        @NotBlank String name,
        /** V15: разделено на phone + email. Если фронт прислал старое поле contact —
         *  в контроллере обработаем как fallback. */
        String phone,
        String email,
        Long roleId) {}
