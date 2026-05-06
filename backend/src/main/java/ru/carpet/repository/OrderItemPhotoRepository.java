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

    /**
     * data в БД — TEXT с base64. Раньше пробовали bytea (бинарь, ×0.75 размер),
     * но при отдельных JPG ломалось превью — strict-режим Base64.getDecoder
     * на отдельных кодировках выдавал расхождение. TEXT надёжнее: фронт сразу
     * встраивает в data:url, бэк ничего не конвертирует.
     */
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

    /**
     * Батч-выборка фото для нескольких позиций одним запросом.
     * Спасает от N+1 на странице заказа: было N запросов (по одному на позицию),
     * стал один. Каждое фото — base64 в data, потенциально большое;
     * для списков (превью thumbs) есть лёгкий вариант findMetaByOrderItemIds().
     */
    public List<OrderItemPhoto> findByOrderItemIds(java.util.Collection<Long> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return List.of();
        return jdbc.query(
                "SELECT id, order_item_id, filename, content_type, data, created_at " +
                "FROM order_item_photos WHERE order_item_id IN (:ids) ORDER BY order_item_id, created_at",
                new MapSqlParameterSource("ids", orderItemIds),
                ROW_MAPPER
        );
    }

    /** Только метаданные (без data) — для превью thumbs, чтобы не таскать base64. */
    public List<OrderItemPhotoMeta> findMetaByOrderItemIds(java.util.Collection<Long> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return List.of();
        return jdbc.query(
                "SELECT id, order_item_id, filename, content_type, created_at " +
                "FROM order_item_photos WHERE order_item_id IN (:ids) ORDER BY order_item_id, created_at",
                new MapSqlParameterSource("ids", orderItemIds),
                (rs, n) -> new OrderItemPhotoMeta(
                        rs.getLong("id"), rs.getLong("order_item_id"),
                        rs.getString("filename"), rs.getString("content_type"),
                        rs.getTimestamp("created_at").toLocalDateTime()
                )
        );
    }

    /** Лёгкий DTO без поля data — для списков (превью). */
    public record OrderItemPhotoMeta(
            Long id, Long orderItemId, String filename, String contentType,
            java.time.LocalDateTime createdAt) {}

    /**
     * Первое фото каждой указанной позиции — с полем data, для thumbs в ItemsPage.
     * Использует DISTINCT ON (PostgreSQL-специфика) — одна запись на order_item_id,
     * первая по created_at.
     */
    public List<OrderItemPhoto> findFirstPhotoByOrderItemIds(java.util.Collection<Long> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return List.of();
        return jdbc.query(
                "SELECT DISTINCT ON (order_item_id) " +
                "       id, order_item_id, filename, content_type, data, created_at " +
                "FROM order_item_photos WHERE order_item_id IN (:ids) " +
                "ORDER BY order_item_id, created_at",
                new MapSqlParameterSource("ids", orderItemIds),
                ROW_MAPPER
        );
    }

    /** {@code data} — base64-строка от фронта, кладём как есть в TEXT. */
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
