package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import ru.carpet.model.AppUser;
import ru.carpet.repository.AppUserRepository;
import ru.carpet.service.AuditLogService;

import java.util.List;
import java.util.Map;

/**
 * CRUD пользователей. Доступен только SUPERVISOR.
 * Авторизация на уровне фронта (по роли), бэк доверяет authenticated.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AppUserRepository repo;
    private final PasswordEncoder encoder;
    private final AuditLogService audit;

    public UserController(AppUserRepository repo, PasswordEncoder encoder, AuditLogService audit) {
        this.repo = repo;
        this.encoder = encoder;
        this.audit = audit;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return repo.findAll().stream().map(this::toPublic).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String displayName = (String) body.get("display_name");
        String role = (String) body.getOrDefault("role", "OPERATOR");
        Long employeeId = body.get("employee_id") != null
                ? ((Number) body.get("employee_id")).longValue() : null;

        AppUser user = repo.create(username, encoder.encode(password), displayName, role, employeeId);
        repo.syncEmployeeRoleFromUserRole(employeeId, role);
        audit.log("USER", user.id(), "CREATE", "Создан пользователь " + username + " [" + role + "]");
        return toPublic(user);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        String displayName = (String) body.get("display_name");
        String role = (String) body.getOrDefault("role", "OPERATOR");
        Long employeeId = body.get("employee_id") != null
                ? ((Number) body.get("employee_id")).longValue() : null;
        boolean isActive = body.get("is_active") == null || (Boolean) body.get("is_active");

        AppUser user = repo.update(id, displayName, role, employeeId, isActive);
        repo.syncEmployeeRoleFromUserRole(employeeId, role);
        audit.log("USER", user.id(), "UPDATE", "Обновлён пользователь " + user.username() + " [" + role + "]");
        return toPublic(user);
    }

    @PatchMapping("/{id}/password")
    public Map<String, Object> changePassword(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String newPassword = body.get("password");
        repo.updatePassword(id, encoder.encode(newPassword));
        audit.log("USER", id, "PASSWORD_CHANGE", "Сменён пароль пользователя #" + id);
        return Map.of("ok", true);
    }

    /** Не отдаём password_hash наружу. */
    private Map<String, Object> toPublic(AppUser u) {
        return Map.of(
                "id", u.id(),
                "username", u.username(),
                "display_name", u.displayName(),
                "role", u.role(),
                "employee_id", u.employeeId() != null ? u.employeeId() : 0,
                "is_active", u.isActive()
        );
    }
}
