package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;
import ru.carpet.model.ServiceStatus;

public record UpdateServiceStatusRequest(@NotNull ServiceStatus status) {}
