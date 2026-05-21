package ru.carpet.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * V11: бэк раздаёт собранный фронт (static/index.html) и форвардит
 * SPA-маршруты на index.html, чтобы React Router работал при F5
 * на любой странице (/orders, /orders/5, /dashboard и т.д.).
 *
 * <p>API на /api/** ловят остальные контроллеры, статика (.js/.css/.png)
 * раздаётся Spring'ом автоматически из classpath:/static/.
 * Здесь мы ловим только «человеческие» пути без расширения.
 */
@Controller
public class SpaController {

    @GetMapping({
            "/",
            "/dashboard",
            "/login",
            "/orders", "/orders/{id:[0-9]+}",
            "/items", "/items/{id:[0-9]+}",
            "/logistics", "/production", "/analytics", "/clients", "/profitability",
            "/references", "/employees", "/feedback",
            "/users", "/expenses",
            "/error-log", "/audit-log",
            "/worker-login", "/worker", "/worker/route"
    })
    public String spa() {
        return "forward:/index.html";
    }
}
