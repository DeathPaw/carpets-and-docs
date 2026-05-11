package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Услуга, навешенная на позицию заказа.
 *
 * <p>V10: вместо {@code service_def_id} теперь {@code sku_id} + {@code sku_version_id}.
 * Имя услуги и группа берутся snapshot'ом из конкретной версии SKU — заказ
 * показывает «как было на момент покупки», даже если позже SKU переименовали.
 */
public record OrderItemServiceInstance(
        Long id,
        Long orderItemId,
        Long skuId,
        Long skuVersionId,
        String skuName,        // JOIN'ится в RowMapper (snapshot названия)
        String skuGroupName,   // тоже из JOIN
        String pricingType,    // тоже из JOIN на текущую версию SKU
        ServiceStatus status,
        BigDecimal price,
        Boolean isManualPrice,
        String cancellationReason,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
