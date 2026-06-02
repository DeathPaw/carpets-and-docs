package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record Order(
        Long id,
        Long clientId,
        String clientName,
        String clientAddress,
        String comment,
        OrderStatus status,
        boolean isWarranty,
        Long parentOrderId,
        BigDecimal totalAmount,
        boolean paid,
        PaymentType paymentType,
        LocalDateTime paymentDate,
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
        LocalDateTime updatedAt
) {}
