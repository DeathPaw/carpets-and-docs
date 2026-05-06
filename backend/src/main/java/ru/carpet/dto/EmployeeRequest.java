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
        String contact,
        Long roleId) {}
