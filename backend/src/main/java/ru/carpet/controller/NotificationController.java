package ru.carpet.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import ru.carpet.model.AppUser;
import ru.carpet.repository.AppUserRepository;
import ru.carpet.service.NotificationService;

import java.util.List;
import java.util.Map;

/**
 * V11: SSE-поток событий + CRUD для персональных уведомлений (колокольчик).
 */
@RestController
@RequestMapping("/api")
public class NotificationController {

    private final NotificationService notificationService;
    private final AppUserRepository userRepo;

    public NotificationController(NotificationService notificationService, AppUserRepository userRepo) {
        this.notificationService = notificationService;
        this.userRepo = userRepo;
    }

    /** SSE-поток. Фронт подключается через EventSource('/api/events'). */
    @GetMapping("/events")
    public SseEmitter events() {
        return notificationService.subscribe();
    }

    @GetMapping("/notifications")
    public Map<String, Object> myNotifications(Authentication auth) {
        AppUser user = userRepo.findByUsername(auth.getName()).orElseThrow();
        List<Map<String, Object>> items = notificationService.getUnread(user.id());
        long count = notificationService.countUnread(user.id());
        return Map.of("items", items, "unread_count", count);
    }

    @PostMapping("/notifications/{id}/read")
    public Map<String, Object> markRead(@PathVariable Long id) {
        notificationService.markRead(id);
        return Map.of("ok", true);
    }

    @PostMapping("/notifications/read-all")
    public Map<String, Object> markAllRead(Authentication auth) {
        AppUser user = userRepo.findByUsername(auth.getName()).orElseThrow();
        notificationService.markAllRead(user.id());
        return Map.of("ok", true);
    }
}
