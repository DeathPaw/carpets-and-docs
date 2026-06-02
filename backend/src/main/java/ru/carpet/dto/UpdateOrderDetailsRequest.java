package ru.carpet.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateOrderDetailsRequest(
    String pickupAddress, String deliveryAddress,
    /** V18: номер квартиры — отдельно от адреса. */
    String pickupApartment, String deliveryApartment,
    Long legacyId,
    LocalDate pickupDate, String pickupTimeSlot,
    LocalDate deliveryDate, String deliveryTimeSlot,
    String pickupDistrict, String deliveryDistrict,
    BigDecimal pickupLat, BigDecimal pickupLon,
    BigDecimal deliveryLat, BigDecimal deliveryLon
) {}
