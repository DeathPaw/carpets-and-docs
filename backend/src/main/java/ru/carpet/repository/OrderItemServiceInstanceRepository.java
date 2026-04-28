package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderItemServiceInstance;
import ru.carpet.model.ServiceStatus;

import java.util.List;
import java.util.Map;

@Repository
public class OrderItemServiceInstanceRepository {

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

    public OrderItemServiceInstanceRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void saveAll(Long orderItemId, List<Long> serviceDefIds) {
        if (serviceDefIds == null || serviceDefIds.isEmpty()) {
            return;
        }
        for (Long serviceDefId : serviceDefIds) {
            var params = new MapSqlParameterSource()
                    .addValue("orderItemId", orderItemId)
                    .addValue("serviceDefId", serviceDefId);
            jdbc.update(
                    "INSERT INTO order_item_services (order_item_id, service_def_id, status, price, is_manual_price) " +
                    "VALUES (:orderItemId, :serviceDefId, 'CREATED', 0, FALSE)",
                    params
            );
        }
    }

    public List<OrderItemServiceInstance> findByOrderItemId(Long orderItemId) {
        return jdbc.query(
                "SELECT id, order_item_id, service_def_id, status, price, is_manual_price, created_at, updated_at " +
                "FROM order_item_services WHERE order_item_id = :orderItemId ORDER BY id",
                Map.of("orderItemId", orderItemId),
                ROW_MAPPER
        );
    }

    public void updateStatus(Long id, ServiceStatus status) {
        jdbc.update(
                "UPDATE order_item_services SET status = :status, updated_at = NOW() WHERE id = :id",
                Map.of("status", status.name(), "id", id)
        );
    }

    public void updatePrice(Long id, java.math.BigDecimal price) {
        jdbc.update(
                "UPDATE order_item_services SET price = :price, is_manual_price = TRUE, updated_at = NOW() WHERE id = :id",
                Map.of("price", price, "id", id)
        );
    }

    public void updateCalculatedPrice(Long id, java.math.BigDecimal price) {
        jdbc.update(
                "UPDATE order_item_services SET price = :price, updated_at = NOW() WHERE id = :id AND is_manual_price = FALSE",
                Map.of("price", price, "id", id)
        );
    }

    public java.math.BigDecimal sumPriceByOrderItemId(Long orderItemId) {
        List<java.math.BigDecimal> result = jdbc.query(
                "SELECT COALESCE(SUM(price), 0) as total FROM order_item_services WHERE order_item_id = :orderItemId AND status != 'CANCELLED'",
                Map.of("orderItemId", orderItemId),
                (rs, rowNum) -> rs.getBigDecimal("total")
        );
        return result.isEmpty() ? java.math.BigDecimal.ZERO : result.get(0);
    }

    public java.util.Optional<OrderItemServiceInstance> findById(Long id) {
        List<OrderItemServiceInstance> result = jdbc.query(
                "SELECT id, order_item_id, service_def_id, status, price, is_manual_price, created_at, updated_at " +
                "FROM order_item_services WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public List<OrderItemServiceInstance> findByEmployeeId(Long employeeId, String status) {
        String sql = """
            SELECT ois.id, ois.order_item_id, ois.service_def_id, ois.status, ois.price, ois.is_manual_price, ois.created_at, ois.updated_at
            FROM order_item_services ois
            JOIN service_assignees sa ON ois.id = sa.order_item_service_id
            WHERE sa.employee_id = :employeeId
            """;
        
        Map<String, Object> params = Map.of("employeeId", employeeId);
        
        if (status != null && !status.isEmpty()) {
            sql += " AND ois.status = :status";
            params = Map.of("employeeId", employeeId, "status", status);
        }
        
        sql += " ORDER BY ois.id DESC";
        
        return jdbc.query(sql, params, ROW_MAPPER);
    }

    public java.math.BigDecimal sumPriceByEmployeeId(Long employeeId, String status, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder("""
            SELECT COALESCE(SUM(ois.price), 0) as total
            FROM order_item_services ois
            JOIN service_assignees sa ON ois.id = sa.order_item_service_id
            WHERE sa.employee_id = :employeeId
            """);
        
        Map<String, Object> params = new java.util.HashMap<>();
        params.put("employeeId", employeeId);
        
        if (status != null && !status.isEmpty()) {
            sql.append(" AND ois.status = :status");
            params.put("status", status);
        }
        
        if (dateFrom != null && !dateFrom.isEmpty()) {
            sql.append(" AND ois.updated_at >= :dateFrom");
            params.put("dateFrom", dateFrom);
        }
        
        if (dateTo != null && !dateTo.isEmpty()) {
            sql.append(" AND ois.updated_at <= :dateTo");
            params.put("dateTo", dateTo);
        }
        
        List<java.math.BigDecimal> result = jdbc.query(sql.toString(), params, 
            (rs, rowNum) -> rs.getBigDecimal("total"));
        return result.isEmpty() ? java.math.BigDecimal.ZERO : result.get(0);
    }
}