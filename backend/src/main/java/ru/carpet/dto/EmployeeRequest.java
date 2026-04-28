package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

public record EmployeeRequest(@NotBlank String name, String contact) {}
