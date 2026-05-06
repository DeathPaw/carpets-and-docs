package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Запрос на создание обращения от оператора.
 *
 * <p>{@code topic} — один из:
 * SUGGESTION_HOW («можем сделать вот так?»), FEATURE_REQUEST («хочу такую функцию»),
 * LOGIC_BUG («ошибка в логике/поведении»), VISUAL_BUG («визуальная ошибка»),
 * UNCLEAR («непонятно что делать»).
 *
 * <p>{@code screenshot} — опционально, base64-строка PNG/JPEG из буфера обмена
 * или загруженного файла. Бэк декодирует в bytea при INSERT.
 */
public record FeedbackRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 5000) String body,
        @NotBlank @Size(max = 2000) String pagePath,
        String screenshot,
        @Size(max = 50) String screenshotType
) {}
