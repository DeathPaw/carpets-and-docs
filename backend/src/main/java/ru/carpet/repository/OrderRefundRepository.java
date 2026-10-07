package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderRefund;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Возвраты и компенсации по заказам (V45, правка №3 от 19.09).
 *
 * <p>Читается карточкой заказа (что вернули по этому заказу) и аналитикой
 * потерь по претензиям за период.
 */
@Repository
public class OrderRefundRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OrderRefundRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT_COLS = """
        r.id, r.order_id, o.client_name, r.kind, r.amount, r.reason, r.comment,
        r.occurred_on, r.created_by, r.created_at
        """;

    private static final RowMapper<OrderRefund> ROW_MAPPER = (rs, rn) -> new OrderRefund(
            rs.getLong("id"),
            rs.getLong("order_id"),
            rs.getString("client_name"),
            rs.getString("kind"),
            rs.getBigDecimal("amount"),
            rs.getString("reason"),
            rs.getString("comment"),
            rs.getDate("occurred_on").toLocalDate(),
            rs.getString("created_by"),
            rs.getTimestamp("created_at").toLocalDateTime());

    public Long save(Long orderId, String kind, BigDecimal amount, String reason, String comment,
                     LocalDate occurredOn, String createdBy) {
        return jdbc.queryForObject("""
            INSERT INTO order_refunds (order_id, kind, amount, reason, comment, occurred_on, created_by)
            VALUES (:order, :kind, :amount, :reason, :comment, COALESCE(:on, CURRENT_DATE), :by)
            RETURNING id
        """, new MapSqlParameterSource()
                .addValue("order", orderId)
                .addValue("kind", kind)
                .addValue("amount", amount)
                .addValue("reason", reason)
                .addValue("comment", comment)
                .addValue("on", occurredOn)
                .addValue("by", createdBy), Long.class);
    }

    public List<OrderRefund> findByOrderId(Long orderId) {
        return jdbc.query("SELECT " + SELECT_COLS + " FROM order_refunds r "
                        + "JOIN orders o ON o.id = r.order_id "
                        + "WHERE r.order_id = :id ORDER BY r.occurred_on DESC, r.id DESC",
                Map.of("id", orderId), ROW_MAPPER);
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM order_refunds WHERE id = :id", Map.of("id", id));
    }

    /** Список потерь за период — для таблицы в аналитике. */
    public List<OrderRefund> findByPeriod(LocalDate from, LocalDate to) {
        return jdbc.query("SELECT " + SELECT_COLS + " FROM order_refunds r "
                        + "JOIN orders o ON o.id = r.order_id "
                        + "WHERE (CAST(:from AS date) IS NULL OR r.occurred_on >= CAST(:from AS date)) "
                        + "  AND (CAST(:to AS date) IS NULL OR r.occurred_on <= CAST(:to AS date)) "
                        + "ORDER BY r.occurred_on DESC, r.id DESC",
                new MapSqlParameterSource().addValue("from", from).addValue("to", to), ROW_MAPPER);
    }

    /**
     * Свод по типам событий: сколько заказов и на какую сумму. Заказы считаем
     * уникальными — по одному заказу может быть несколько записей (например,
     * частичный возврат и компенсация ковра).
     */
    public List<Map<String, Object>> summaryByKind(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
            SELECT r.kind,
                   COUNT(*)                        AS events,
                   COUNT(DISTINCT r.order_id)      AS orders,
                   COALESCE(SUM(r.amount), 0)      AS total
              FROM order_refunds r
             WHERE (CAST(:from AS date) IS NULL OR r.occurred_on >= CAST(:from AS date))
               AND (CAST(:to AS date) IS NULL OR r.occurred_on <= CAST(:to AS date))
             GROUP BY r.kind
             ORDER BY total DESC
        """, new MapSqlParameterSource().addValue("from", from).addValue("to", to));
    }

    /** Свод по причинам — из-за чего компания теряет деньги чаще всего. */
    public List<Map<String, Object>> summaryByReason(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
            SELECT r.reason,
                   COUNT(*)                   AS events,
                   COALESCE(SUM(r.amount), 0) AS total
              FROM order_refunds r
             WHERE (CAST(:from AS date) IS NULL OR r.occurred_on >= CAST(:from AS date))
               AND (CAST(:to AS date) IS NULL OR r.occurred_on <= CAST(:to AS date))
             GROUP BY r.reason
             ORDER BY total DESC
        """, new MapSqlParameterSource().addValue("from", from).addValue("to", to));
    }
}
