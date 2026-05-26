package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.audit.AuditUser;
import ru.carpet.repository.AppUserRepository;
import ru.carpet.service.PresenceService;

@RestController
@RequestMapping("/api/presence")
public class PresenceController {

    private final PresenceService presence;
    private final AppUserRepository userRepository;

    public PresenceController(PresenceService presence, AppUserRepository userRepository) {
        this.presence = presence;
        this.userRepository = userRepository;
    }

    /** Фронт пингует этот эндпоинт раз в 15 сек пока страница заказа открыта. */
    @PostMapping("/order/{orderId}")
    public void heartbeat(@PathVariable Long orderId) {
        userId().ifPresent(uid -> presence.heartbeat(uid, orderId));
    }

    /** Закрытие страницы — явный leave. TTL и так протухнет за 30 сек если не вызвать. */
    @DeleteMapping("/order/{orderId}")
    public void leave(@PathVariable Long orderId) {
        userId().ifPresent(uid -> presence.leave(uid, orderId));
    }

    private java.util.Optional<Long> userId() {
        try {
            String username = AuditUser.current();
            if (username == null) return java.util.Optional.empty();
            return userRepository.findByUsername(username).map(u -> u.id());
        } catch (Exception e) { return java.util.Optional.empty(); }
    }
}
