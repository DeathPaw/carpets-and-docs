package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record CreateClientRequest(
        String clientType,
        @NotBlank String name,
        String firstName,
        String lastName,
        String phone,
        String extraPhone,
        String address,
        /** V18: номер квартиры (отдельно от адреса). */
        String apartment,
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        Boolean isPensioner,
        Boolean isProblem,
        Boolean isRegular,
        BigDecimal lat,
        BigDecimal lon
) {}
