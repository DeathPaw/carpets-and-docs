package ru.carpet.model;

import java.time.LocalDateTime;

public record Employee(Long id, String name, String contact, boolean active, LocalDateTime createdAt, LocalDateTime updatedAt) {}
