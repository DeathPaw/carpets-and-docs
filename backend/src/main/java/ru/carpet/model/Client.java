package ru.carpet.model;

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
        String district,
        String inn,
        String contactPerson,
        String contactPersonPhone,
        String comment,
        boolean isPensioner,
        boolean isProblem,
        boolean isRegular,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
