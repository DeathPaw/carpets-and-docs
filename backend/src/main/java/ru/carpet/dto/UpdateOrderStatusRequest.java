package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.OrderStatus;

public record UpdateOrderStatusRequest(
        @NotNull OrderStatus status,
        /**
         * Уточнение к причине отмены. V46: обязательно только для причин, у
         * которых в справочнике стоит requires_note («Другая причина»).
         */
        String cancellationReason,
        /** V46: код причины отмены из справочника. Обязателен при CANCELLED. */
        String cancelReasonCode
) {}
