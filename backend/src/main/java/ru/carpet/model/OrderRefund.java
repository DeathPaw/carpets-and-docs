package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Возврат или компенсация по заказу (V45, правка №3 от 19.09).
 *
 * <p>Финансовая потеря компании по претензии клиента: вернули деньги целиком
 * или частично, компенсировали испорченный ковёр. Сумма всегда положительная —
 * что именно произошло, говорит {@link #kind()}.
 *
 * @param kind        FULL_REFUND | PARTIAL_REFUND | ITEM_COMPENSATION | OTHER
 * @param occurredOn  когда деньги фактически отдали
 * @param clientName  имя клиента — чтобы список потерь читался без доп. запросов
 */
public record OrderRefund(
        Long id,
        Long orderId,
        String clientName,
        String kind,
        BigDecimal amount,
        String reason,
        String comment,
        LocalDate occurredOn,
        String createdBy,
        LocalDateTime createdAt
) {}
