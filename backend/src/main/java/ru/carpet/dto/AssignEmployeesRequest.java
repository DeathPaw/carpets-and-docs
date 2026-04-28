package ru.carpet.dto;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record AssignEmployeesRequest(@NotEmpty List<Long> employeeIds) {}
