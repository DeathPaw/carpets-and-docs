package ru.carpet.service;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * V11: SSE-нотификации + персональные уведомления.
 *
 * <p>Два уровня:
 * <ul>
 *   <li>SSE broadcast — при любом изменении данных фронт получает event и делает refetch.</li>
 *   <li>Персональные — пишутся в таблицу {@code notifications} и отображаются в колокольчике.</li>
 * </ul>
 */
@Service
public class NotificationService {

    private final NamedParameterJdbcTemplate jdbc;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public NotificationService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---- SSE broadcast ----

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        // Отправляем initial event чтобы клиент знал что подключился
        try { emitter.send(SseEmitter.event().name("connected").data("ok")); }
        catch (IOException ignored) {}
        return emitter;
    }

    /** Отправить event всем подключённым клиентам. */
    public void broadcast(String eventType, Object data) {
        for (var e : emitters) {
            try {
                e.send(SseEmitter.event().name(eventType).data(data));
            } catch (IOException ex) {
                emitters.remove(e);
            }
        }
    }

    // ---- Персональные уведомления ----

    public void createNotification(Long userId, String type, String message,
                                   String entityType, Long entityId) {
        jdbc.update("""
            INSERT INTO notifications (user_id, type, message, entity_type, entity_id)
            VALUES (:u, :t, :m, :et, :ei)
        """, Map.of("u", userId, "t", type, "m", message,
                "et", entityType != null ? entityType : "", "ei", entityId != null ? entityId : 0));
        // Пушим SSE чтобы фронт обновил счётчик колокольчика
        broadcast("new_notification", Map.of("user_id", userId, "type", type));
    }

    public List<Map<String, Object>> getUnread(Long userId) {
        return jdbc.queryForList(
                "SELECT * FROM notifications WHERE user_id = :u AND is_read = FALSE ORDER BY created_at DESC LIMIT 50",
                Map.of("u", userId));
    }

    public void markRead(Long notificationId) {
        jdbc.update("UPDATE notifications SET is_read = TRUE WHERE id = :id",
                Map.of("id", notificationId));
    }

    public void markAllRead(Long userId) {
        jdbc.update("UPDATE notifications SET is_read = TRUE WHERE user_id = :u AND is_read = FALSE",
                Map.of("u", userId));
    }

    public long countUnread(Long userId) {
        Long c = jdbc.queryForObject(
                "SELECT COUNT(*) FROM notifications WHERE user_id = :u AND is_read = FALSE",
                Map.of("u", userId), Long.class);
        return c != null ? c : 0;
    }
}
