package ru.carpet.model;

import java.time.LocalDateTime;

public record OrderItemPhoto(Long id, Long orderItemId, String filename, String contentType, String data, LocalDateTime createdAt) {}
