package ru.carpet.dto;

import java.time.LocalDate;

public record UpdateActualDatesRequest(
    LocalDate actualPickupDate, String actualPickupTimeSlot,
    LocalDate actualDeliveryDate, String actualDeliveryTimeSlot
) {}
