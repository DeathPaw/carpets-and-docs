package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/** DTO для создания/редактирования роли сотрудника. */
public record EmployeeRoleRequest(
        @NotBlank String name,
        String description,
        List<Long> itemTypeIds) {}
