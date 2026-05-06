package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;

public record DistrictRequest(
        @NotBlank String name,
        Integer sortOrder,
        Boolean isActive
) {}
