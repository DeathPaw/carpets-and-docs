package ru.carpet.model;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record Client(
        Long id,
        String clientType,
        String name,
        String firstName,
        String lastName,
        String phone,
        String extraPhone,
        String address,
        /** V18: номер квартиры (отдельно от address, не участвует в геокодировании). */
        String apartment,
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        boolean isPensioner,
        boolean isProblem,
        boolean isRegular,
        BigDecimal lat,
        BigDecimal lon,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
