package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class ServiceAssigneeRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ServiceAssigneeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void assignEmployees(Long orderItemServiceId, List<Long> employeeIds) {
        // Сначала удаляем старые назначения
        jdbc.update(
                "DELETE FROM service_assignees WHERE order_item_service_id = :serviceId",
                Map.of("serviceId", orderItemServiceId)
        );
        // Затем вставляем новые
        for (Long employeeId : employeeIds) {
            var params = new MapSqlParameterSource()
                    .addValue("serviceId", orderItemServiceId)
                    .addValue("employeeId", employeeId);
            jdbc.update(
                    "INSERT INTO service_assignees (order_item_service_id, employee_id) " +
                    "VALUES (:serviceId, :employeeId) ON CONFLICT DO NOTHING",
                    params
            );
        }
    }

    public Map<Long, List<Long>> findEmployeeIdsByServiceIds(List<Long> serviceIds) {
        if (serviceIds.isEmpty()) return Map.of();
        var params = new MapSqlParameterSource("serviceIds", serviceIds);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT order_item_service_id, employee_id FROM service_assignees WHERE order_item_service_id IN (:serviceIds)",
            params
        );
        Map<Long, List<Long>> result = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Long svcId = ((Number) row.get("order_item_service_id")).longValue();
            Long empId = ((Number) row.get("employee_id")).longValue();
            result.computeIfAbsent(svcId, k -> new ArrayList<>()).add(empId);
        }
        return result;
    }

    public List<Long> findEmployeeIdsByServiceId(Long orderItemServiceId) {
        return jdbc.queryForList(
                "SELECT employee_id FROM service_assignees WHERE order_item_service_id = :serviceId ORDER BY employee_id",
                Map.of("serviceId", orderItemServiceId),
                Long.class
        );
    }
}
