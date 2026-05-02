package ru.carpet.dto;

import java.time.LocalDate;

public record UpdateOrderDetailsRequest(
    String pickupAddress, String deliveryAddress, Long legacyId,
    LocalDate pickupDate, String pickupTimeSlot,
    LocalDate deliveryDate, String deliveryTimeSlot,
    String pickupDistrict, String deliveryDistrict
) {}
