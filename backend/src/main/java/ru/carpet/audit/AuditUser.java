package ru.carpet.audit;

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

    /** Логин из SecurityContext или {@code system}, если контекста нет. */
    public static String current() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return "system";
        String name = auth.getName();
        return name == null || name.isBlank() ? "system" : name;
    }

    /** Подпись изменения, сделанного работником через мобилку. */
    public static String worker(long employeeId) {
        return "worker:" + employeeId;
    }
}
