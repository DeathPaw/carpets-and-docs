package ru.carpet.model;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Обращение оператора к разработчику.
 *
 * <p>Вложения (V27) лежат в {@code screenshots} — отдельная таблица
 * feedback_screenshots, 1:N. Поля {@code screenshot}/{@code screenshotType}
 * оставлены ради совместимости со старыми клиентами и всегда содержат
 * первое вложение (или null, если их нет).
 */
public record Feedback(
        Long id,
        String topic,           // SUGGESTION_HOW | FEATURE_REQUEST | LOGIC_BUG | VISUAL_BUG | UNCLEAR
        String body,
        String pagePath,
        String screenshot,      // base64 первого вложения или null (legacy)
        String screenshotType,  // mime первого вложения (legacy)
        List<Screenshot> screenshots,
        String submittedBy,
        /** Статус жизненного цикла: NEW | REVIEWED | IN_PROGRESS | DONE | REJECTED | NEED_INFO. */
        String status,
        LocalDateTime createdAt
) {
    /** Одно вложение обращения. */
    public record Screenshot(Long id, String data, String contentType) {}
}
