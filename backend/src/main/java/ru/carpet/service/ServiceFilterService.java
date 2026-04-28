package ru.carpet.service;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.carpet.model.OrderItemServiceInstance;
import ru.carpet.model.ServiceStatus;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class ServiceFilterService {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<OrderItemServiceInstance> ROW_MAPPER = (rs, rowNum) -> new OrderItemServiceInstance(
            rs.getLong("id"),
            rs.getLong("order_item_id"),
            rs.getLong("service_def_id"),
            ServiceStatus.valueOf(rs.getString("status")),
            rs.getBigDecimal("price"),
            rs.getBoolean("is_manual_price"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ServiceFilterService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OrderItemServiceInstance> findServices(
            Long employeeId, ServiceStatus status, Long itemTypeId, Long orderId,
            LocalDateTime dateFrom, LocalDateTime dateTo, int page, int size
    ) {
        var params = new MapSqlParameterSource();
        var sql = new StringBuilder(
                "SELECT DISTINCT ois.id, ois.order_item_id, ois.service_def_id, ois.status, ois.price, ois.is_manual_price, ois.created_at, ois.updated_at " +
                "FROM order_item_services ois " +
                "JOIN order_items oi ON oi.id = ois.order_item_id "
        );

        if (employeeId != null) {
            sql.append("JOIN service_assignees sa ON sa.order_item_service_id = ois.id ");
        }

        sql.append("WHERE 1=1 ");

        if (employeeId != null) {
            sql.append("AND sa.employee_id = :employeeId ");
            params.addValue("employeeId", employeeId);
        }
        if (status != null) {
            sql.append("AND ois.status = :status ");
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
        if (dateFrom != null) {
            sql.append("AND ois.updated_at >= :dateFrom ");
            params.addValue("dateFrom", dateFrom);
        }
        if (dateTo != null) {
            sql.append("AND ois.updated_at <= :dateTo ");
            params.addValue("dateTo", dateTo);
        }

        sql.append("ORDER BY ois.id LIMIT :limit OFFSET :offset");
        params.addValue("limit", size);
        params.addValue("offset", (long) page * size);

        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }
}
