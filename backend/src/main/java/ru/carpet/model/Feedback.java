package ru.carpet.model;

import java.time.LocalDateTime;

/**
 * Обращение оператора к разработчику.
 *
 * <p>{@code screenshot} — base64-строка для JSON. В БД лежит bytea
 * (как фото позиций), репозиторий конвертирует на лету.
 */
public record Feedback(
        Long id,
        String topic,           // SUGGESTION_HOW | FEATURE_REQUEST | LOGIC_BUG | VISUAL_BUG | UNCLEAR
        String body,
        String pagePath,
        String screenshot,      // base64 или null
        String screenshotType,  // mime, например "image/png"
        String submittedBy,
        /** Статус жизненного цикла: NEW | REVIEWED | IN_PROGRESS | DONE | REJECTED | NEED_INFO. */
        String status,
        LocalDateTime createdAt
) {}
