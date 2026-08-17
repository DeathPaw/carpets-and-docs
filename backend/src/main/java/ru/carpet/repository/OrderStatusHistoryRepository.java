package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderStatus;
import ru.carpet.model.OrderStatusHistory;

import java.util.List;
import java.util.Map;

@Repository
public class OrderStatusHistoryRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<OrderStatusHistory> ROW_MAPPER = (rs, rowNum) -> {
        String oldStatusStr = rs.getString("old_status");
        OrderStatus oldStatus = oldStatusStr != null ? OrderStatus.valueOf(oldStatusStr) : null;
        return new OrderStatusHistory(
                rs.getLong("id"),
                rs.getLong("order_id"),
                oldStatus,
                OrderStatus.valueOf(rs.getString("new_status")),
                rs.getTimestamp("changed_at").toLocalDateTime()
        );
    };

    public OrderStatusHistoryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void save(Long orderId, OrderStatus oldStatus, OrderStatus newStatus) {
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("oldStatus", oldStatus != null ? oldStatus.name() : null)
                .addValue("newStatus", newStatus.name());
        jdbc.update(
                "INSERT INTO order_status_history (order_id, old_status, new_status) " +
                "VALUES (:orderId, :oldStatus, :newStatus)",
                params
        );
    }

    public List<OrderStatusHistory> findByOrderId(Long orderId) {
        return jdbc.query(
                "SELECT id, order_id, old_status, new_status, changed_at " +
                "FROM order_status_history WHERE order_id = :orderId ORDER BY changed_at ASC",
                Map.of("orderId", orderId),
                ROW_MAPPER
        );
    }

    /**
     * Статус, из которого заказ пришёл в текущий — для кнопки «Откатить».
     * Берём old_status последней записи. Сортируем по id, а не по changed_at:
     * несколько переходов внутри одной транзакции получают одинаковый timestamp
     * (NOW() в Postgres постоянен внутри транзакции), и по времени порядок был бы
     * недетерминированным. Возвращает null, если истории нет или в ней null.
     */
    public OrderStatus findPreviousStatus(Long orderId) {
        List<String> rows = jdbc.queryForList(
                "SELECT old_status FROM order_status_history " +
                "WHERE order_id = :orderId ORDER BY id DESC LIMIT 1",
                Map.of("orderId", orderId),
                String.class
        );
        if (rows.isEmpty() || rows.get(0) == null) return null;
        return OrderStatus.valueOf(rows.get(0));
    }
}
