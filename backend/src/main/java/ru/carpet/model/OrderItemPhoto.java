package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Фото позиции заказа.
 *
 * <p>{@code data} — base64-строка для JSON. В БД фото хранится в bytea (бинарь);
 * репозиторий конвертирует bytea → base64 при чтении и base64 → bytea при записи.
 * Так фронт продолжает работать с base64 без изменений, а БД не разрастается
 * на 33% из-за текстовой кодировки.
 */
public record OrderItemPhoto(Long id, Long orderItemId, String filename, String contentType, String data, LocalDateTime createdAt) {}
