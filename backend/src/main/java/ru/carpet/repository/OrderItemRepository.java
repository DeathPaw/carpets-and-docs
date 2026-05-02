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

    private static final RowMapper<OrderItem> ROW_MAPPER = (rs, rowNum) -> new OrderItem(
            rs.getLong("id"),
            rs.getLong("order_id"),
            rs.getLong("item_type_id"),
            null,
            rs.getString("description"),
            rs.getString("defects"),
            OrderItemStatus.valueOf(rs.getString("status")),
            rs.getBigDecimal("price"),
            rs.getBigDecimal("length"),
            rs.getBigDecimal("width"),
            rs.getBigDecimal("weight"),
            rs.getBigDecimal("area"),
            rs.getBigDecimal("running_meters"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    private static final RowMapper<OrderItem> ROW_MAPPER_WITH_NAME = (rs, rowNum) -> new OrderItem(
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
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public OrderItemRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OrderItem> findByOrderId(Long orderId) {
        return jdbc.query(
                "SELECT oi.id, oi.order_id, oi.item_type_id, oi.description, oi.defects, oi.status, oi.price, " +
                "oi.length, oi.width, oi.weight, oi.area, oi.running_meters, oi.created_at, oi.updated_at, " +
                "it.name as item_type_name " +
                "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
                "WHERE oi.order_id = :orderId ORDER BY oi.id",
                Map.of("orderId", orderId),
                ROW_MAPPER_WITH_NAME
        );
    }

    public OrderItem save(Long orderId, Long itemTypeId, String description) {
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
                "oi.length, oi.width, oi.weight, oi.area, oi.running_meters, oi.created_at, oi.updated_at, " +
                "it.name as item_type_name " +
                "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
                "WHERE oi.id = :id",
                Map.of("id", id),
                ROW_MAPPER_WITH_NAME
        );
        return result.stream().findFirst();
    }
}
