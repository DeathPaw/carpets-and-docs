package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderItem;
import ru.carpet.model.OrderItemStatus;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class OrderItemRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Все запросы возвращают позицию вместе с item_type_name через JOIN на item_types.
     * Раньше был отдельный ROW_MAPPER без имени — он не использовался, дублировал логику и
     * заполнял поле itemTypeName в OrderItem null'ом.
     */
    private static final RowMapper<OrderItem> ROW_MAPPER = (rs, rowNum) -> new OrderItem(
            rs.getLong("id"),
            rs.getLong("order_id"),
            rs.getLong("item_type_id"),
            rs.getString("item_type_name"),
            rs.getString("description"),
            rs.getString("defects"),
            OrderItemStatus.valueOf(rs.getString("status")),
            rs.getBigDecimal("price"),
            rs.getBigDecimal("length"),
            rs.getBigDecimal("width"),
            rs.getBigDecimal("weight"),
            rs.getBigDecimal("area"),
            rs.getBigDecimal("running_meters"),
            rs.getBigDecimal("perimeter"),
            rs.getString("cancellation_reason"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public OrderItemRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Для сложных ad-hoc запросов из OrderService (exclude_from_status_calc и т.п.). */
    public NamedParameterJdbcTemplate getJdbc() { return jdbc; }

    public List<OrderItem> findByOrderId(Long orderId) {
        return jdbc.query(
                "SELECT oi.id, oi.order_id, oi.item_type_id, oi.description, oi.defects, oi.status, oi.price, " +
                "oi.length, oi.width, oi.weight, oi.area, oi.running_meters, oi.perimeter, oi.cancellation_reason, " +
                "oi.created_at, oi.updated_at, " +
                "it.name as item_type_name " +
                "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
                "WHERE oi.order_id = :orderId ORDER BY oi.id",
                Map.of("orderId", orderId),
                ROW_MAPPER
        );
    }

    public OrderItem save(Long orderId, Long itemTypeId, String description) {
        // V10: item_types упрощены, версионирование типа убрано (типы — просто справочник
        // имён, история имени не критична). Сохраняем только item_type_id.
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("itemTypeId", itemTypeId)
                .addValue("description", description);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO order_items (order_id, item_type_id, description, status, price) " +
                "VALUES (:orderId, :itemTypeId, :description, 'CREATED', 0)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public OrderItem saveWithDimensions(Long orderId, Long itemTypeId, String description,
                                        BigDecimal length, BigDecimal width, BigDecimal weight,
                                        BigDecimal area, BigDecimal runningMeters) {
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("itemTypeId", itemTypeId)
                .addValue("description", description)
                .addValue("length", length)
                .addValue("width", width)
                .addValue("weight", weight)
                .addValue("area", area)
                .addValue("runningMeters", runningMeters);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO order_items (order_id, item_type_id, description, status, price, length, width, weight, area, running_meters) " +
                "VALUES (:orderId, :itemTypeId, :description, 'CREATED', 0, :length, :width, :weight, :area, :runningMeters)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public void updateStatus(Long id, OrderItemStatus status) {
        jdbc.update(
                "UPDATE order_items SET status = :status, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("status", status.name(), "id", id)
        );
    }

    /** Установка статуса вместе с причиной отмены. */
    public void updateStatusWithReason(Long id, OrderItemStatus status, String reason) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", status.name())
                .addValue("reason", reason);
        jdbc.update(
                "UPDATE order_items SET status = :status, cancellation_reason = :reason, " +
                "version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    /**
     * Обновление цены позиции. Цена всегда = сумма цен услуг, оператор её вручную
     * больше не меняет (V14: убрали is_manual_price на order_items, ручное
     * редактирование переехало на уровень услуги).
     */
    public void updatePrice(Long id, BigDecimal price) {
        jdbc.update(
                "UPDATE order_items SET price = :price, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("price", price, "id", id)
        );
    }

    public void updateDimensions(Long id, BigDecimal length, BigDecimal width, BigDecimal weight,
                                  BigDecimal area, BigDecimal runningMeters) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("length", length)
                .addValue("width", width)
                .addValue("weight", weight)
                .addValue("area", area)
                .addValue("runningMeters", runningMeters);
        jdbc.update(
                "UPDATE order_items SET length = :length, width = :width, weight = :weight, " +
                "area = :area, running_meters = :runningMeters, version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public void updateDescription(Long id, String description, String defects) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("description", description)
                .addValue("defects", defects);
        jdbc.update(
                "UPDATE order_items SET description = :description, defects = :defects, version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public BigDecimal sumPriceByOrderId(Long orderId) {
        BigDecimal result = jdbc.queryForObject(
                "SELECT COALESCE(SUM(price), 0) FROM order_items WHERE order_id = :orderId AND status != 'CANCELLED'",
                Map.of("orderId", orderId),
                BigDecimal.class
        );
        return result != null ? result : BigDecimal.ZERO;
    }

    public Optional<OrderItem> findById(Long id) {
        List<OrderItem> result = jdbc.query(
                "SELECT oi.id, oi.order_id, oi.item_type_id, oi.description, oi.defects, oi.status, oi.price, " +
                "oi.length, oi.width, oi.weight, oi.area, oi.running_meters, oi.perimeter, oi.cancellation_reason, " +
                "oi.created_at, oi.updated_at, " +
                "it.name as item_type_name " +
                "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
                "WHERE oi.id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }
}
