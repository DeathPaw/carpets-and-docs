package ru.carpet.training;

import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Эндпоинты тренажёрного режима. Регистрируются ТОЛЬКО в профиле `training` —
 * в проде их нет (см. @Profile), поэтому случайно дёрнуть «сброс» в боевой
 * базе невозможно.
 *
 * Эндпоинты:
 *   GET  /api/training/status — здоровье тренажёра + флаг для фронта
 *                               (фронт по нему показывает баннер «Тренажёр»).
 *   POST /api/training/reset  — пересоздать демо-данные (TRUNCATE + сидер).
 *
 * Доступ закрыт Spring Security'ью на тех же правилах, что и остальные /api/**.
 */
@RestController
@RequestMapping("/api/training")
@Profile("training")
public class TrainingController {

    private final TrainingDataSeeder seeder;

    public TrainingController(TrainingDataSeeder seeder) {
        this.seeder = seeder;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of(
            "training",  true,
            "message",   "Это тренажёр. Изменения не сохраняются в боевой базе."
        );
    }

    @PostMapping("/reset")
    public ResponseEntity<Map<String, Object>> reset() {
        seeder.reset();
        return ResponseEntity.ok(Map.of(
            "ok", true,
            "message", "Демо-данные пересозданы"
        ));
    }
}
