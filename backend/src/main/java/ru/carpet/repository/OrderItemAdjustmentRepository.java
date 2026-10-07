package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderItemAdjustment;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * История корректировок ковра (V44, правка №2 от 17.09).
 *
 * <p>Пишется при изменении размеров или типа/материала позиции — и из кабинета
 * работника, и из карточки заказа. Читается блоком «Скорректировано
 * производством» и фильтром таких заказов.
 */
@Repository
public class OrderItemAdjustmentRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OrderItemAdjustmentRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT_COLS = """
        a.id, a.order_item_id, oi.order_id,
        COALESCE(NULLIF(oi.description, ''), it.name) AS item_name,
        a.field, a.old_value, a.new_value, a.price_before, a.price_after,
        a.changed_by, a.source, a.created_at
        """;

    private static final String FROM_JOINS = """
         FROM order_item_adjustments a
         JOIN order_items oi ON oi.id = a.order_item_id
         LEFT JOIN item_types it ON it.id = oi.item_type_id
        """;

    private static final RowMapper<OrderItemAdjustment> ROW_MAPPER = (rs, rn) -> new OrderItemAdjustment(
            rs.getLong("id"),
            rs.getLong("order_item_id"),
            rs.getLong("order_id"),
            rs.getString("item_name"),
            rs.getString("field"),
            rs.getString("old_value"),
            rs.getString("new_value"),
            rs.getBigDecimal("price_before"),
            rs.getBigDecimal("price_after"),
            rs.getString("changed_by"),
            rs.getString("source"),
            rs.getTimestamp("created_at").toLocalDateTime());

    public Long save(Long orderItemId, String field, String oldValue, String newValue,
                     BigDecimal priceBefore, BigDecimal priceAfter, String changedBy, String source) {
        return jdbc.queryForObject("""
            INSERT INTO order_item_adjustments
                (order_item_id, field, old_value, new_value, price_before, price_after, changed_by, source)
            VALUES (:item, :field, :old, :new, :pb, :pa, :by, :src)
            RETURNING id
        """, new MapSqlParameterSource()
                .addValue("item", orderItemId)
                .addValue("field", field)
                .addValue("old", oldValue)
                .addValue("new", newValue)
                .addValue("pb", priceBefore)
                .addValue("pa", priceAfter)
                .addValue("by", changedBy)
                .addValue("src", source), Long.class);
    }

    /** Все корректировки заказа — для блока в карточке, свежие сверху. */
    public List<OrderItemAdjustment> findByOrderId(Long orderId) {
        return jdbc.query("SELECT " + SELECT_COLS + FROM_JOINS
                        + " WHERE oi.order_id = :id ORDER BY a.created_at DESC, a.id DESC",
                Map.of("id", orderId), ROW_MAPPER);
    }

    /** Последние корректировки по всем заказам — для режима «что поправило производство». */
    public List<OrderItemAdjustment> findRecent(String source, int limit) {
        var params = new MapSqlParameterSource().addValue("limit", limit).addValue("src", source);
        String where = source == null ? "" : " WHERE a.source = :src";
        return jdbc.query("SELECT " + SELECT_COLS + FROM_JOINS + where
                + " ORDER BY a.created_at DESC, a.id DESC LIMIT :limit", params, ROW_MAPPER);
    }
}
