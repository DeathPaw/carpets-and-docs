package ru.carpet.controller;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.carpet.model.AppUser;
import ru.carpet.repository.AppUserRepository;

import java.util.Map;

/**
 * Текущий пользователь. Фронт вызывает GET /api/me после логина,
 * получает роль + display_name + employee_id.
 */
@RestController
@RequestMapping("/api")
public class AuthController {

    private final AppUserRepository userRepo;

    public AuthController(AppUserRepository userRepo) {
        this.userRepo = userRepo;
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication auth) {
        AppUser user = userRepo.findByUsername(auth.getName()).orElseThrow();
        return Map.of(
                "id", user.id(),
                "username", user.username(),
                "display_name", user.displayName(),
                "role", user.role(),
                "employee_id", user.employeeId() != null ? user.employeeId() : 0
        );
    }
}
