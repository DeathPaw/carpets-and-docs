package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Feedback;

import java.util.List;
import java.util.Map;

@Repository
public class FeedbackRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public FeedbackRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Скриншот хранится в TEXT как base64 (см. комментарий у фото в V1__).
     * Для списка супервизора отдаём со скриншотом — в reasonable объёмах
     * страницу никто не уронит; если в будущем фид станет большим,
     * добавим лёгкий вариант findAllMeta() без screenshot.
     */
    private static final String COLS =
            "id, topic, body, page_path, screenshot, screenshot_type, submitted_by, status, created_at";

    private static final RowMapper<Feedback> ROW_MAPPER = (rs, n) -> new Feedback(
            rs.getLong("id"),
            rs.getString("topic"),
            rs.getString("body"),
            rs.getString("page_path"),
            rs.getString("screenshot"),
            rs.getString("screenshot_type"),
            rs.getString("submitted_by"),
            rs.getString("status"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    public List<Feedback> findAll() {
        return jdbc.query(
                "SELECT " + COLS + " FROM feedback_messages ORDER BY created_at DESC",
                Map.of(), ROW_MAPPER);
    }

    /** {@code screenshot} — base64-строка от фронта или null. */
    public Feedback save(String topic, String body, String pagePath,
                         String screenshot, String screenshotType, String submittedBy) {
        var keyHolder = new GeneratedKeyHolder();
        var params = new MapSqlParameterSource()
                .addValue("topic", topic)
                .addValue("body", body)
                .addValue("pagePath", pagePath)
                .addValue("screenshot", screenshot)
                .addValue("screenshotType", screenshotType)
                .addValue("submittedBy", submittedBy);
        // status = 'NEW' по умолчанию (DEFAULT в схеме).
        jdbc.update(
                "INSERT INTO feedback_messages (topic, body, page_path, screenshot, screenshot_type, submitted_by) " +
                "VALUES (:topic, :body, :pagePath, :screenshot, :screenshotType, :submittedBy)",
                params, keyHolder, new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return jdbc.queryForObject(
                "SELECT " + COLS + " FROM feedback_messages WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM feedback_messages WHERE id = :id", Map.of("id", id));
    }

    /** Смена статуса. Валидацию допустимых значений делает контроллер/сервис. */
    public Feedback updateStatus(Long id, String status) {
        jdbc.update(
                "UPDATE feedback_messages SET status = :status WHERE id = :id",
                Map.of("id", id, "status", status));
        return jdbc.queryForObject(
                "SELECT " + COLS + " FROM feedback_messages WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
    }
}
