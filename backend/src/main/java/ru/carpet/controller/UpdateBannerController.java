package ru.carpet.controller;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * V32: справочник баннеров «Обновления».
 *
 * <p>Кнопка «Обновления» рядом с «Что делать?» показывает оператору список
 * активных баннеров — что починили, что появилось нового. Содержимое настраивается
 * в Справочниках, без правки кода.
 *
 * <p>Даты отдаём строкой YYYY-MM-DD: java.sql.Date Jackson сериализует как
 * timestamp со сдвигом таймзоны, и фронт получал дату «на день раньше».
 */
@RestController
@RequestMapping("/api/update-banners")
public class UpdateBannerController {

    private static final String COLS =
        "id, title, body, " +
        "TO_CHAR(starts_on, 'YYYY-MM-DD') AS starts_on, " +
        "TO_CHAR(ends_on,   'YYYY-MM-DD') AS ends_on, " +
        "sort_order, is_active ";

    private final NamedParameterJdbcTemplate jdbc;

    public UpdateBannerController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Баннеры для попапа «Обновления»: активные и попадающие в сегодняшнюю дату.
     * NULL-граница means «без ограничения» с этой стороны.
     */
    @GetMapping
    public List<Map<String, Object>> active() {
        return jdbc.queryForList(
            "SELECT " + COLS + "FROM update_banners " +
            "WHERE is_active = TRUE " +
            "  AND (starts_on IS NULL OR starts_on <= CURRENT_DATE) " +
            "  AND (ends_on   IS NULL OR ends_on   >= CURRENT_DATE) " +
            "ORDER BY sort_order, id DESC",
            Map.of());
    }

    /** Все баннеры, включая скрытые и просроченные — для страницы Справочников. */
    @GetMapping("/all")
    public List<Map<String, Object>> listAll() {
        return jdbc.queryForList(
            "SELECT " + COLS + "FROM update_banners ORDER BY sort_order, id DESC",
            Map.of());
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        var p = params(body);
        var kh = new GeneratedKeyHolder();
        jdbc.update(
            "INSERT INTO update_banners (title, body, starts_on, ends_on, sort_order, is_active) " +
            "VALUES (:title, :body, NULLIF(:starts,'')::date, NULLIF(:ends,'')::date, :so, :act)",
            p, kh, new String[]{"id"});
        return byId(kh.getKey().longValue());
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        var p = params(body).addValue("id", id);
        jdbc.update(
            "UPDATE update_banners SET title=:title, body=:body, " +
            "starts_on=NULLIF(:starts,'')::date, ends_on=NULLIF(:ends,'')::date, " +
            "sort_order=:so, is_active=:act, updated_at=NOW() WHERE id=:id", p);
        return byId(id);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        jdbc.update("DELETE FROM update_banners WHERE id = :id", Map.of("id", id));
    }

    private MapSqlParameterSource params(Map<String, Object> body) {
        return new MapSqlParameterSource()
            .addValue("title",  body.get("title"))
            .addValue("body",   body.get("body"))
            .addValue("starts", body.get("starts_on"))
            .addValue("ends",   body.get("ends_on"))
            .addValue("so",     body.getOrDefault("sort_order", 0))
            .addValue("act",    body.getOrDefault("is_active", true));
    }

    private Map<String, Object> byId(Long id) {
        return jdbc.queryForMap("SELECT " + COLS + "FROM update_banners WHERE id = :id", Map.of("id", id));
    }
}
