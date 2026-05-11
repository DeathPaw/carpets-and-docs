package ru.carpet.dto;

import ru.carpet.model.Employee;
import ru.carpet.model.ServiceStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Услуга на позиции заказа + назначенные исполнители (V10).
 *
 * <p>SKU-ссылка вместо старой service_def_id: имя и группа берутся snapshot'ом
 * из конкретной версии SKU (см. RowMapper в OrderItemServiceInstanceRepository).
 */
public record OrderItemServiceWithAssignees(
        Long id,
        Long orderItemId,
        Long skuId,
        String skuName,
        String skuGroupName,
        String pricingType,
        ServiceStatus status,
        BigDecimal price,
        Boolean isManualPrice,
        List<Employee> assignees,
        String cancellationReason,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
