package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderItemPhoto;

import java.util.List;
import java.util.Map;

@Repository
public class OrderItemPhotoRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<OrderItemPhoto> ROW_MAPPER = (rs, rowNum) -> new OrderItemPhoto(
            rs.getLong("id"),
            rs.getLong("order_item_id"),
            rs.getString("filename"),
            rs.getString("content_type"),
            rs.getString("data"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    public OrderItemPhotoRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OrderItemPhoto> findByOrderItemId(Long orderItemId) {
        return jdbc.query(
                "SELECT id, order_item_id, filename, content_type, data, created_at FROM order_item_photos WHERE order_item_id = :orderItemId ORDER BY created_at",
                Map.of("orderItemId", orderItemId),
                ROW_MAPPER
        );
    }

    public OrderItemPhoto save(Long orderItemId, String filename, String contentType, String data) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        var params = new MapSqlParameterSource()
                .addValue("orderItemId", orderItemId)
                .addValue("filename", filename)
                .addValue("contentType", contentType)
                .addValue("data", data);
        jdbc.update(
                "INSERT INTO order_item_photos (order_item_id, filename, content_type, data) VALUES (:orderItemId, :filename, :contentType, :data)",
                params, keyHolder, new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return jdbc.queryForObject(
                "SELECT id, order_item_id, filename, content_type, data, created_at FROM order_item_photos WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM order_item_photos WHERE id = :id", Map.of("id", id));
    }
}
