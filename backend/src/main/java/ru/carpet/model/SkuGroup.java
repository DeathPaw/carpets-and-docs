package ru.carpet.model;

import java.time.LocalDateTime;

/** Группа SKU (V10) — для группировки в UI каталога: «Стирка», «Чистка», «Доставка». */
public record SkuGroup(
        Long id,
        String name,
        int sortOrder,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
