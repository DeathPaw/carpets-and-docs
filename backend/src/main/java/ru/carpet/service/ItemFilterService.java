package ru.carpet.service;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.carpet.model.OrderItem;
import ru.carpet.model.OrderItemStatus;

import java.util.List;

@Service
public class ItemFilterService {

    private final NamedParameterJdbcTemplate jdbc;

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
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ItemFilterService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OrderItem> findItems(
            OrderItemStatus status, Long itemTypeId, Long orderId, Long employeeId,
            int page, int size
    ) {
        var params = new MapSqlParameterSource();
        var sql = new StringBuilder(
                "SELECT DISTINCT oi.id, oi.order_id, oi.item_type_id, it.name as item_type_name, oi.description, oi.defects, " +
                "oi.status, oi.price, oi.length, oi.width, oi.weight, oi.area, oi.running_meters, oi.created_at, oi.updated_at " +
                "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id "
        );

        if (employeeId != null) {
            sql.append("JOIN order_item_services ois ON ois.order_item_id = oi.id ");
            sql.append("JOIN service_assignees sa ON sa.order_item_service_id = ois.id ");
        }

        sql.append("WHERE 1=1 ");

        if (status != null) {
            sql.append("AND oi.status = :status ");
            params.addValue("status", status.name());
        }
        if (itemTypeId != null) {
            sql.append("AND oi.item_type_id = :itemTypeId ");
            params.addValue("itemTypeId", itemTypeId);
        }
        if (orderId != null) {
            sql.append("AND oi.order_id = :orderId ");
            params.addValue("orderId", orderId);
        }
        if (employeeId != null) {
            sql.append("AND sa.employee_id = :employeeId ");
            params.addValue("employeeId", employeeId);
        }

        sql.append("ORDER BY oi.id LIMIT :limit OFFSET :offset");
        params.addValue("limit", size);
        params.addValue("offset", (long) page * size);

        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }
}
