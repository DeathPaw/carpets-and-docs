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
        Long legacyId,
        LocalDate pickupDate,
        String pickupTimeSlot,
        LocalDate deliveryDate,
        String deliveryTimeSlot,
        String pickupDistrict,
        String deliveryDistrict,
        LocalDate actualPickupDate,
        String actualPickupTimeSlot,
        LocalDate actualDeliveryDate,
        String actualDeliveryTimeSlot,
        BigDecimal baseAmount,
        BigDecimal discountPercent,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
