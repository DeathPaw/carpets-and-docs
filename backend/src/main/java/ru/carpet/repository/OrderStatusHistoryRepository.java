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
        insert(orderId, oldStatus, newStatus, false);
    }

    /** Запись отката (V57): помечается флагом, чтобы findPreviousStatus её пропускал. */
    public void saveRollback(Long orderId, OrderStatus oldStatus, OrderStatus newStatus) {
        insert(orderId, oldStatus, newStatus, true);
    }

    private void insert(Long orderId, OrderStatus oldStatus, OrderStatus newStatus, boolean isRollback) {
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("oldStatus", oldStatus != null ? oldStatus.name() : null)
                .addValue("newStatus", newStatus.name())
                .addValue("isRollback", isRollback);
        jdbc.update(
                "INSERT INTO order_status_history (order_id, old_status, new_status, is_rollback) " +
                "VALUES (:orderId, :oldStatus, :newStatus, :isRollback)",
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
     *
     * <p>Идём по истории от новых записей к старым как по стеку: каждый откат
     * отменяет ближайший к нему обычный переход, поэтому пару «переход + его
     * откат» пропускаем. Первый неотменённый переход и даёт ответ. Так повторный
     * откат идёт дальше назад (COMPLETED → DELIVERED → DONE), а не возвращает
     * заказ туда, откуда его только что откатили.
     *
     * <p>Сортируем по id, а не по changed_at: несколько переходов внутри одной
     * транзакции получают одинаковый timestamp (NOW() в Postgres постоянен внутри
     * транзакции), и по времени порядок был бы недетерминированным. Возвращает
     * null, если откатывать некуда.
     */
    public OrderStatus findPreviousStatus(Long orderId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT old_status, is_rollback FROM order_status_history " +
                "WHERE order_id = :orderId ORDER BY id DESC",
                Map.of("orderId", orderId)
        );
        int undone = 0;
        for (Map<String, Object> row : rows) {
            if (Boolean.TRUE.equals(row.get("is_rollback"))) {
                undone++;
            } else if (undone > 0) {
                undone--;
            } else {
                String old = (String) row.get("old_status");
                return old == null ? null : OrderStatus.valueOf(old);
            }
        }
        return null;
    }
}
