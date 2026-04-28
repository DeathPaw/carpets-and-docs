package ru.carpet.dto;

import jakarta.validation.constraints.NotNull;

public record AddServiceRequest(@NotNull Long serviceDefId) {}
