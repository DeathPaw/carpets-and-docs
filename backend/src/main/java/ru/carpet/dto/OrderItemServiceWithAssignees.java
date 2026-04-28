package ru.carpet.dto;

import ru.carpet.model.Employee;
import ru.carpet.model.ServiceStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderItemServiceWithAssignees(
        Long id,
        Long orderItemId,
        Long serviceDefId,
        String serviceDefName,
        ServiceStatus status,
        BigDecimal price,
        Boolean isManualPrice,
        List<Employee> assignees,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}