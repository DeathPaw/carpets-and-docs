package ru.carpet.model;

import java.time.LocalDateTime;

public record ClientEvent(Long id, Long clientId, String eventType, String description, LocalDateTime createdAt) {}
