package ru.carpet.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Запрос на создание обращения от оператора.
 *
 * <p>{@code topic} — один из:
 * SUGGESTION_HOW («можем сделать вот так?»), FEATURE_REQUEST («хочу такую функцию»),
 * LOGIC_BUG («ошибка в логике/поведении»), VISUAL_BUG («визуальная ошибка»),
 * UNCLEAR («непонятно что делать»).
 *
 * <p>{@code screenshots} — V27: список вложений (base64 без data:-префикса).
 * Одна ошибка часто требует несколько экранов или последовательность действий.
 * Старые поля {@code screenshot}/{@code screenshotType} оставлены для совместимости
 * со звонками старого фронта; если пришли они — бэк положит их первым вложением.
 */
public record FeedbackRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 5000) String body,
        @NotBlank @Size(max = 2000) String pagePath,
        String screenshot,
        @Size(max = 50) String screenshotType,
        @Size(max = 10, message = "Не больше 10 скриншотов на обращение")
        List<Screenshot> screenshots
) {
    /** Одно вложение: base64-данные + mime. */
    public record Screenshot(
            @NotBlank String data,
            @Size(max = 50) String contentType
    ) {}

    /**
     * Единый список вложений независимо от того, каким полем их прислал фронт.
     * Возвращает пустой список, если вложений нет.
     */
    public List<Screenshot> allScreenshots() {
        if (screenshots != null && !screenshots.isEmpty()) return screenshots;
        if (screenshot != null && !screenshot.isBlank()) {
            return List.of(new Screenshot(screenshot, screenshotType));
        }
        return List.of();
    }
}
