package ru.carpet.controller;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * V18: справочник слотов доставки по дням недели.
 *
 * <p>Будни 17:00-20:30, Сб 10:00-20:30, Вс — без слотов. Хранится в таблице
 * {@code delivery_time_slots} с полем {@code day_of_week} (0-6, 0=Вс).
 * Фронт при выборе времени забора/доставки фильтрует по дню недели даты.
 *
 * <p>V28: {@code end_time} может быть NULL — это слот с фиксированным временем
 * («доставка строго к 15:00»). Пустая строка от фронта = NULL (см. NULLIF).
 */
@RestController
@RequestMapping("/api/delivery-slots")
public class DeliverySlotController {

    private final NamedParameterJdbcTemplate jdbc;

    public DeliverySlotController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return jdbc.queryForList(
            "SELECT id, day_of_week, " +
            "  TO_CHAR(start_time, 'HH24:MI') AS start_time, " +
            "  TO_CHAR(end_time,   'HH24:MI') AS end_time, " +
            "  label, is_active, sort_order " +
            "FROM delivery_time_slots WHERE is_active = TRUE " +
            "ORDER BY day_of_week, sort_order, start_time",
            Map.of()
        );
    }

    /** Полный список (включая неактивные) — для админ-страницы Справочников. */
    @GetMapping("/all")
    public List<Map<String, Object>> listAll() {
        return jdbc.queryForList(
            "SELECT id, day_of_week, " +
            "  TO_CHAR(start_time, 'HH24:MI') AS start_time, " +
            "  TO_CHAR(end_time,   'HH24:MI') AS end_time, " +
            "  label, is_active, sort_order " +
            "FROM delivery_time_slots ORDER BY day_of_week, sort_order, start_time",
            Map.of()
        );
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        var p = new MapSqlParameterSource()
            .addValue("dow",   ((Number) body.get("day_of_week")).intValue())
            .addValue("st",    body.get("start_time"))   // строка "HH:MI"
            .addValue("et",    body.get("end_time"))
            .addValue("lbl",   body.get("label"))
            .addValue("act",   body.getOrDefault("is_active", true))
            .addValue("so",    body.getOrDefault("sort_order", 0));
        var kh = new GeneratedKeyHolder();
        jdbc.update(
            "INSERT INTO delivery_time_slots (day_of_week, start_time, end_time, label, is_active, sort_order) " +
            "VALUES (:dow, :st::time, NULLIF(:et,'')::time, :lbl, :act, :so)",
            p, kh, new String[]{"id"});
        return jdbc.queryForMap(
            "SELECT id, day_of_week, TO_CHAR(start_time,'HH24:MI') AS start_time, " +
            "TO_CHAR(end_time,'HH24:MI') AS end_time, label, is_active, sort_order " +
            "FROM delivery_time_slots WHERE id = :id",
            Map.of("id", kh.getKey().longValue()));
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        var p = new MapSqlParameterSource()
            .addValue("id",    id)
            .addValue("dow",   ((Number) body.get("day_of_week")).intValue())
            .addValue("st",    body.get("start_time"))
            .addValue("et",    body.get("end_time"))
            .addValue("lbl",   body.get("label"))
            .addValue("act",   body.getOrDefault("is_active", true))
            .addValue("so",    body.getOrDefault("sort_order", 0));
        jdbc.update(
            "UPDATE delivery_time_slots SET day_of_week=:dow, start_time=:st::time, " +
            "end_time=NULLIF(:et,'')::time, " +
            "label=:lbl, is_active=:act, sort_order=:so, updated_at=NOW() WHERE id=:id", p);
        return jdbc.queryForMap(
            "SELECT id, day_of_week, TO_CHAR(start_time,'HH24:MI') AS start_time, " +
            "TO_CHAR(end_time,'HH24:MI') AS end_time, label, is_active, sort_order " +
            "FROM delivery_time_slots WHERE id = :id", Map.of("id", id));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        jdbc.update("DELETE FROM delivery_time_slots WHERE id = :id", Map.of("id", id));
    }
}
