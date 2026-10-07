package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record Order(
        Long id,
        Long clientId,
        String clientName,
        String clientAddress,
        /** Телефон клиента (JOIN из clients) — нужен маршрутному листу и логистике. */
        String clientPhone,
        String comment,
        OrderStatus status,
        boolean isWarranty,
        Long parentOrderId,
        BigDecimal totalAmount,
        boolean paid,
        PaymentType paymentType,
        LocalDateTime paymentDate,
        /**
         * V30: предполагаемый способ расчёта, который оператор проставляет заранее —
         * водитель видит его в маршрутном листе. Фактическая оплата фиксируется
         * отдельно ({@code paid} + {@code paymentType}) и это поле не заменяет.
         * Значения: CASH | CARD | TRANSFER | PAID | FREE, либо null.
         */
        String preliminaryPaymentType,
        String pickupAddress,
        String deliveryAddress,
        /** V18: номер квартиры (отдельно от адреса, не геокодится). */
        String pickupApartment,
        String deliveryApartment,
        Long legacyId,
        LocalDate pickupDate,
        String pickupTimeSlot,
        LocalDate deliveryDate,
        String deliveryTimeSlot,
        String pickupDistrict,
        String deliveryDistrict,
        BigDecimal pickupLat,
        BigDecimal pickupLon,
        BigDecimal deliveryLat,
        BigDecimal deliveryLon,
        LocalDate actualPickupDate,
        String actualPickupTimeSlot,
        LocalDate actualDeliveryDate,
        String actualDeliveryTimeSlot,
        BigDecimal baseAmount,
        BigDecimal discountPercent,
        String cancellationReason,
        /** Назначенный водитель/логист (Спринт D). NULL — не назначен. */
        Long assignedDriverId,
        /** Имя назначенного водителя для удобства фронта — JOIN'ится в репозитории. */
        String assignedDriverName,
        /** V17: оператор-оформитель. Заполняется автоматически при создании
         *  заказа, если у текущего пользователя есть employee_id. По нему шлём
         *  персональные уведомления о смене статуса. */
        Long assignedOperatorId,
        String assignedOperatorName,
        /** V17: проблемный заказ. Оператор поднимает флаг — админам приходит уведомление. */
        boolean isProblem,
        String problemReason,
        Long version,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        /**
         * V42: дата прайса. По ней считаются цены услуг заказа — берётся версия
         * услуги, действовавшая на этот день. По умолчанию день оформления;
         * «Пересчитать по текущему прайсу» переводит её на сегодня.
         */
        LocalDate priceDate,
        /**
         * V43: клиент подтвердил день выезда (правка №1 от 17.09).
         * FALSE — «Уточнить», надо звонить. Не статус заказа, а рабочий
         * признак логистики; сбрасывается при переносе даты и после забора.
         */
        boolean clientConfirmed,
        /** Оператор, поставивший подтверждение — по нему видно, кто звонил. */
        String clientConfirmedBy,
        LocalDateTime clientConfirmedAt,
        /**
         * V46 (правка №3 от 13.09): основной повод обращения. Относится к
         * заказу, а не к клиенту: сегодня залили ковёр, через полгода —
         * плановая чистка. Коды — см. фронт.
         */
        String orderReason,
        /** V46: расшифровка для повода «Другой». */
        String orderReasonNote,
        /** V46: код причины отмены из справочника cancellation_reasons. */
        String cancelReasonCode,
        /** V54: контракт юрлица, по которому идёт заказ (ТЗ v2, блок 6). */
        Long contractId,
        /**
         * V54: договорная цена за м², зафиксированная на момент привязки.
         * Изменение контракта не трогает уже учтённые заказы.
         */
        java.math.BigDecimal contractPricePerSqm,
        /** V54: отметка сдачи заказчику — до неё метры в факт контракта не идут. */
        LocalDateTime contractDeliveredAt
) {}
