package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateClientRequest(
        String clientType,
        @NotBlank String name,
        String firstName,
        String lastName,
        String phone,
        String extraPhone,
        String address,
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        Boolean isPensioner,
        Boolean isProblem,
        Boolean isRegular
) {}
