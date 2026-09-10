package ru.carpet.audit;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Возвращает логин текущего пользователя для записи в {@code changed_by} полей
 * версионных таблиц (V9). Это «кто изменил услугу / прайс / тип позиции».
 *
 * <p>Источники:
 *   • Spring Security (Basic Auth для оператора) — возвращает {@code admin}
 *     или конкретный логин супервизора.
 *   • Если контекста нет — например, изменение из системного процесса
 *     или сидера — возвращаем {@code system}.
 *
 * <p>Для мобильного приложения работника (PIN-вход через {@code /api/worker/**})
 * Spring Security не задействован, поэтому такие изменения нужно подписывать
 * вручную через {@link #worker(long)}. На текущий момент работники прайс не
 * правят, но запас полезен.
 */
public final class AuditUser {

    private AuditUser() {}

    /**
     * Подпись на время действия из кабинета работника: PIN-вход идёт мимо Spring
     * Security. Пока она задана, {@link #current()} отдаёт её — так записи, которые
     * сервисы делают по просьбе кабинета, подписаны работником, а не «system».
     */
    private static final ThreadLocal<String> ACTOR = new ThreadLocal<>();

    /** Выполнить действие от имени {@code actor}, например «Холиев Асрор (кабинет)». */
    public static <T> T as(String actor, java.util.function.Supplier<T> action) {
        String previous = ACTOR.get();
        ACTOR.set(actor);
        try {
            return action.get();
        } finally {
            if (previous == null) ACTOR.remove(); else ACTOR.set(previous);
        }
    }

    /** Логин из SecurityContext или {@code system}, если контекста нет. */
    public static String current() {
        String actor = ACTOR.get();
        if (actor != null) return actor;
        var auth = SecurityContextHolder.getContext().getAuthentication();
        // Анонимный токен Spring тоже «authenticated»: без этой проверки публичные
        // эндпоинты подписывались бы пользователем «anonymousUser».
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) return "system";
        String name = auth.getName();
        return name == null || name.isBlank() ? "system" : name;
    }

    /** Подпись изменения, сделанного работником через мобилку. */
    public static String worker(long employeeId) {
        return "worker:" + employeeId;
    }
}
