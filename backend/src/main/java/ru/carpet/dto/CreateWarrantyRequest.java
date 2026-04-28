package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record CreateWarrantyRequest(
        @NotEmpty List<Long> itemIds,
        @NotBlank String warrantyComment
) {}
