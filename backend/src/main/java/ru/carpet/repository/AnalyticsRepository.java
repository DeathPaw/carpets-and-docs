package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class AnalyticsRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public AnalyticsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> ordersByDistrict() {
        return jdbc.queryForList(
            "SELECT COALESCE(delivery_district, pickup_district, 'Не указан') as district, " +
            "COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total " +
            "FROM orders WHERE status NOT IN ('CANCELLED') " +
            "GROUP BY district ORDER BY count DESC",
            Map.of()
        );
    }

    public List<Map<String, Object>> ordersByStatus() {
        return jdbc.queryForList(
            "SELECT status, COUNT(*) as count " +
            "FROM orders WHERE status NOT IN ('DELIVERED', 'CANCELLED') " +
            "GROUP BY status ORDER BY count DESC",
            Map.of()
        );
    }

    public List<Map<String, Object>> itemsByType() {
        return jdbc.queryForList(
            "SELECT it.name as type_name, COUNT(*) as count " +
            "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
            "WHERE it.is_default = false " +
            "GROUP BY it.name ORDER BY count DESC",
            Map.of()
        );
    }

    public List<Map<String, Object>> employeeStats() {
        return jdbc.queryForList(
            "SELECT e.name, COUNT(*) as services_done, COALESCE(SUM(ois.price), 0) as total_earned " +
            "FROM service_assignees sa " +
            "JOIN employees e ON e.id = sa.employee_id " +
            "JOIN order_item_services ois ON ois.id = sa.order_item_service_id " +
            "WHERE ois.status = 'DONE' " +
            "GROUP BY e.name ORDER BY services_done DESC",
            Map.of()
        );
    }

    public List<Map<String, Object>> revenueByMonth() {
        return jdbc.queryForList(
            "SELECT TO_CHAR(created_at, 'YYYY-MM') as month, " +
            "COUNT(*) as orders_count, COALESCE(SUM(total_amount), 0) as revenue " +
            "FROM orders WHERE paid = true " +
            "GROUP BY month ORDER BY month DESC LIMIT 12",
            Map.of()
        );
    }

    public List<Map<String, Object>> topClients() {
        return jdbc.queryForList(
            "SELECT c.name, c.client_type, COUNT(o.id) as orders_count, " +
            "COALESCE(SUM(o.total_amount), 0) as total_spent " +
            "FROM clients c JOIN orders o ON o.client_id = c.id " +
            "WHERE o.status NOT IN ('CANCELLED') " +
            "GROUP BY c.id, c.name, c.client_type ORDER BY total_spent DESC LIMIT 10",
            Map.of()
        );
    }

    public List<Map<String, Object>> marginAnalysis() {
        return jdbc.queryForList(
            "SELECT sd.name as service_name, " +
            "COUNT(ois.id) as count, " +
            "COALESCE(SUM(ois.price), 0) as revenue, " +
            "COALESCE(SUM(pl.cost_price * CASE WHEN sd.pricing_type = 'FIXED' THEN 1 " +
            "WHEN sd.pricing_type = 'BY_WEIGHT' THEN COALESCE(oi.weight, 0) " +
            "WHEN sd.pricing_type = 'BY_AREA' THEN COALESCE(oi.length * oi.width, 0) " +
            "ELSE 1 END), 0) as cost " +
            "FROM order_item_services ois " +
            "JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "JOIN order_items oi ON oi.id = ois.order_item_id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE ois.status = 'DONE' " +
            "GROUP BY sd.name ORDER BY revenue DESC",
            Map.of()
        );
    }

    public List<Map<String, Object>> warrantyStats() {
        return jdbc.queryForList(
            "SELECT c.name as client_name, " +
            "COUNT(DISTINCT o.id) as total_orders, " +
            "COUNT(DISTINCT wo.id) as warranty_orders, " +
            "ROUND(COUNT(DISTINCT wo.id)::numeric / NULLIF(COUNT(DISTINCT o.id), 0) * 100, 1) as warranty_percent " +
            "FROM clients c " +
            "JOIN orders o ON o.client_id = c.id " +
            "LEFT JOIN orders wo ON wo.client_id = c.id AND wo.is_warranty = true " +
            "GROUP BY c.id, c.name HAVING COUNT(DISTINCT o.id) > 0 " +
            "ORDER BY warranty_percent DESC NULLS LAST LIMIT 20",
            Map.of()
        );
    }

    public Map<String, Object> dashboard() {
        Map<String, Object> result = new HashMap<>();

        result.put("today_pickups", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE actual_pickup_date = CURRENT_DATE AND status IN ('LEAD','CREATED','FOR_PICKUP')",
            Map.of(), Long.class));

        result.put("today_deliveries", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE actual_delivery_date = CURRENT_DATE AND status = 'DONE'",
            Map.of(), Long.class));

        result.put("in_progress", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status IN ('IN_PROGRESS','PARTIALLY_DONE')",
            Map.of(), Long.class));

        result.put("ready_for_delivery", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status = 'DONE' AND paid = false",
            Map.of(), Long.class));

        result.put("overdue", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE delivery_date < CURRENT_DATE AND status NOT IN ('DELIVERED','CANCELLED')",
            Map.of(), Long.class));

        result.put("total_active", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status NOT IN ('DELIVERED','CANCELLED')",
            Map.of(), Long.class));

        result.put("today_revenue", jdbc.queryForObject(
            "SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_date::date = CURRENT_DATE",
            Map.of(), java.math.BigDecimal.class));

        result.put("today_leads", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status = 'LEAD' AND created_at::date = CURRENT_DATE",
            Map.of(), Long.class));

        return result;
    }

    public List<Map<String, Object>> productionQueue() {
        return jdbc.queryForList(
            "SELECT o.id as order_id, o.client_name, o.status, o.created_at, o.total_amount, " +
            "o.pickup_district, o.delivery_district, " +
            "COUNT(DISTINCT oi.id) as items_count, " +
            "COUNT(DISTINCT ois.id) as services_count, " +
            "COUNT(DISTINCT CASE WHEN ois.status = 'DONE' THEN ois.id END) as services_done " +
            "FROM orders o " +
            "LEFT JOIN order_items oi ON oi.order_id = o.id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id " +
            "WHERE o.status IN ('FOR_PICKUP','IN_PROGRESS','PARTIALLY_DONE') " +
            "GROUP BY o.id ORDER BY o.created_at ASC",
            Map.of()
        );
    }
}
