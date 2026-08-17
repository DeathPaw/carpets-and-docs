package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Feedback;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class FeedbackRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public FeedbackRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Скриншоты хранятся в TEXT как base64 (см. комментарий у фото в V1__).
     * Для списка супервизора отдаём вместе с вложениями — в reasonable объёмах
     * страницу никто не уронит; если фид станет большим, добавим findAllMeta().
     */
    private static final String COLS =
            "id, topic, body, page_path, submitted_by, status, created_at";

    /** Маппер без вложений — их дозагружаем отдельным запросом и склеиваем. */
    private static final RowMapper<Feedback> ROW_MAPPER = (rs, n) -> new Feedback(
            rs.getLong("id"),
            rs.getString("topic"),
            rs.getString("body"),
            rs.getString("page_path"),
            null, null, List.of(),
            rs.getString("submitted_by"),
            rs.getString("status"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    private static final RowMapper<Feedback.Screenshot> SHOT_MAPPER = (rs, n) -> new Feedback.Screenshot(
            rs.getLong("id"), rs.getString("screenshot"), rs.getString("content_type"));

    public List<Feedback> findAll() {
        List<Feedback> rows = jdbc.query(
                "SELECT " + COLS + " FROM feedback_messages ORDER BY created_at DESC",
                Map.of(), ROW_MAPPER);
        return attachScreenshots(rows);
    }

    /**
     * V27: вложения приходят списком. Пишем обращение, затем его скриншоты
     * в порядке, в котором оператор их приложил.
     */
    public Feedback save(String topic, String body, String pagePath,
                         List<ru.carpet.dto.FeedbackRequest.Screenshot> screenshots,
                         String submittedBy) {
        var keyHolder = new GeneratedKeyHolder();
        var params = new MapSqlParameterSource()
                .addValue("topic", topic)
                .addValue("body", body)
                .addValue("pagePath", pagePath)
                .addValue("submittedBy", submittedBy);
        // status = 'NEW' по умолчанию (DEFAULT в схеме).
        jdbc.update(
                "INSERT INTO feedback_messages (topic, body, page_path, submitted_by) " +
                "VALUES (:topic, :body, :pagePath, :submittedBy)",
                params, keyHolder, new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();

        if (screenshots != null) {
            int order = 0;
            for (var shot : screenshots) {
                if (shot == null || shot.data() == null || shot.data().isBlank()) continue;
                jdbc.update(
                        "INSERT INTO feedback_screenshots (feedback_id, screenshot, content_type, sort_order) " +
                        "VALUES (:fid, :data, :ct, :ord)",
                        new MapSqlParameterSource()
                                .addValue("fid", id)
                                .addValue("data", shot.data())
                                .addValue("ct", shot.contentType())
                                .addValue("ord", order++));
            }
        }
        return findById(id);
    }

    public void delete(Long id) {
        // feedback_screenshots висит на ON DELETE CASCADE — вложения уйдут сами.
        jdbc.update("DELETE FROM feedback_messages WHERE id = :id", Map.of("id", id));
    }

    /** Смена статуса. Валидацию допустимых значений делает контроллер/сервис. */
    public Feedback updateStatus(Long id, String status) {
        jdbc.update(
                "UPDATE feedback_messages SET status = :status WHERE id = :id",
                Map.of("id", id, "status", status));
        return findById(id);
    }

    private Feedback findById(Long id) {
        List<Feedback> rows = jdbc.query(
                "SELECT " + COLS + " FROM feedback_messages WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
        List<Feedback> withShots = attachScreenshots(rows);
        return withShots.isEmpty() ? null : withShots.get(0);
    }

    /**
     * Дозагружает вложения одним запросом на всю пачку (без N+1) и складывает
     * их в записи. Первое вложение дублируется в legacy-поля screenshot/type,
     * чтобы старый фронт продолжал показывать хотя бы одну картинку.
     */
    private List<Feedback> attachScreenshots(List<Feedback> rows) {
        if (rows.isEmpty()) return rows;
        List<Long> ids = rows.stream().map(Feedback::id).toList();
        var shots = jdbc.query(
                "SELECT id, feedback_id, screenshot, content_type FROM feedback_screenshots " +
                "WHERE feedback_id IN (:ids) ORDER BY feedback_id, sort_order, id",
                new MapSqlParameterSource("ids", ids),
                (rs, n) -> Map.entry(rs.getLong("feedback_id"), SHOT_MAPPER.mapRow(rs, n)));

        Map<Long, List<Feedback.Screenshot>> byFeedback = new HashMap<>();
        for (var e : shots) {
            byFeedback.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue());
        }
        return rows.stream().map(f -> {
            List<Feedback.Screenshot> list = byFeedback.getOrDefault(f.id(), List.of());
            var first = list.isEmpty() ? null : list.get(0);
            return new Feedback(
                    f.id(), f.topic(), f.body(), f.pagePath(),
                    first == null ? null : first.data(),
                    first == null ? null : first.contentType(),
                    list, f.submittedBy(), f.status(), f.createdAt());
        }).toList();
    }
}
