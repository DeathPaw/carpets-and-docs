package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.dto.AnalyticsDto;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static ru.carpet.repository.AnalyticsHelpers.longOrZero;
import static ru.carpet.repository.AnalyticsHelpers.nz;

/**
 * Общая аналитика (карточки разделов, графики страницы Аналитика).
 *
 * <p>V8 (Аналитика): все методы принимают dateFrom/dateTo (опционально, YYYY-MM-DD).
 *    Если оба null — за всё время; иначе фильтр по нужному дата-полю (created_at/updated_at).
 */
@Repository
public class AnalyticsRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public AnalyticsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Хелпер — добавляет диапазон дат к params; возвращает SQL-фрагмент (или ""). */
    private static String dateFilter(String column, String dateFrom, String dateTo,
                                     Map<String, Object> params) {
        StringBuilder sb = new StringBuilder();
        if (dateFrom != null && !dateFrom.isBlank()) {
            sb.append(" AND ").append(column).append(" >= :df ");
            params.put("df", dateFrom);
        }
        if (dateTo != null && !dateTo.isBlank()) {
            // +1 день, чтобы диапазон был inclusive по дате окончания
            sb.append(" AND ").append(column).append(" < (:dt::date + INTERVAL '1 day') ");
            params.put("dt", dateTo);
        }
        return sb.toString();
    }

    public List<AnalyticsDto.DistrictCount> ordersByDistrict(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT COALESCE(delivery_district, pickup_district, 'Не указан') as district, " +
            "COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total " +
            "FROM orders WHERE status NOT IN ('CANCELLED') " + filter +
            "GROUP BY district ORDER BY count DESC", p,
            (RowMapper<AnalyticsDto.DistrictCount>) (rs, n) -> new AnalyticsDto.DistrictCount(
                rs.getString("district"), longOrZero(rs, "count"), nz(rs.getBigDecimal("total"))
            )
        );
    }

    public List<AnalyticsDto.StatusCount> ordersByStatus(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT status, COUNT(*) as count " +
            "FROM orders WHERE status NOT IN ('DELIVERED', 'COMPLETED', 'CANCELLED') " + filter +
            "GROUP BY status ORDER BY count DESC", p,
            (RowMapper<AnalyticsDto.StatusCount>) (rs, n) -> new AnalyticsDto.StatusCount(
                rs.getString("status"), longOrZero(rs, "count")
            )
        );
    }

    public List<AnalyticsDto.TypeCount> itemsByType(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        // Фильтр по дате создания родительского заказа.
        String filter = dateFilter("o.created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT it.name as type_name, COUNT(*) as count " +
            "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
            "JOIN orders o ON o.id = oi.order_id " +
            "WHERE 1=1 " + filter +
            "GROUP BY it.name ORDER BY count DESC", p,
            (RowMapper<AnalyticsDto.TypeCount>) (rs, n) -> new AnalyticsDto.TypeCount(
                rs.getString("type_name"), longOrZero(rs, "count")
            )
        );
    }

    public List<AnalyticsDto.EmployeeStat> employeeStats(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("ois.updated_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT e.id as employee_id, e.name, COUNT(*) as services_done, COALESCE(SUM(ois.price), 0) as total_earned " +
            "FROM service_assignees sa " +
            "JOIN employees e ON e.id = sa.employee_id " +
            "JOIN order_item_services ois ON ois.id = sa.order_item_service_id " +
            "WHERE ois.status = 'DONE' " + filter +
            "GROUP BY e.id, e.name ORDER BY services_done DESC", p,
            (RowMapper<AnalyticsDto.EmployeeStat>) (rs, n) -> new AnalyticsDto.EmployeeStat(
                rs.getLong("employee_id"), rs.getString("name"),
                longOrZero(rs, "services_done"), nz(rs.getBigDecimal("total_earned"))
            )
        );
    }

    public List<AnalyticsDto.MonthRevenue> revenueByMonth(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT TO_CHAR(created_at, 'YYYY-MM') as month, " +
            "COUNT(*) as orders_count, COALESCE(SUM(total_amount), 0) as revenue " +
            "FROM orders WHERE paid = true " + filter +
            "GROUP BY month ORDER BY month DESC LIMIT 12", p,
            (RowMapper<AnalyticsDto.MonthRevenue>) (rs, n) -> new AnalyticsDto.MonthRevenue(
                rs.getString("month"), longOrZero(rs, "orders_count"), nz(rs.getBigDecimal("revenue"))
            )
        );
    }

    public List<AnalyticsDto.TopClient> topClients(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("o.created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT c.id as client_id, c.name, c.client_type, COUNT(o.id) as orders_count, " +
            "COALESCE(SUM(o.total_amount), 0) as total_spent " +
            "FROM clients c JOIN orders o ON o.client_id = c.id " +
            "WHERE o.status NOT IN ('CANCELLED') " + filter +
            "GROUP BY c.id, c.name, c.client_type ORDER BY total_spent DESC LIMIT 10", p,
            (RowMapper<AnalyticsDto.TopClient>) (rs, n) -> new AnalyticsDto.TopClient(
                rs.getLong("client_id"), rs.getString("name"), rs.getString("client_type"),
                longOrZero(rs, "orders_count"), nz(rs.getBigDecimal("total_spent"))
            )
        );
    }

    public List<AnalyticsDto.MarginRow> marginAnalysis(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("ois.updated_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT s.name as service_name, " +
            "COUNT(ois.id) as count, " +
            "COALESCE(SUM(ois.price), 0) as revenue, " +
            "COALESCE(SUM(s.cost_price * CASE " +
            "  WHEN s.pricing_type = 'FIXED'             THEN 1 " +
            "  WHEN s.pricing_type = 'BY_WEIGHT'         THEN COALESCE(oi.weight, 0) " +
            "  WHEN s.pricing_type = 'BY_AREA'           THEN COALESCE(oi.area, 0) " +
            "  WHEN s.pricing_type = 'BY_PERIMETER'      THEN COALESCE(oi.perimeter, 0) " +
            "  WHEN s.pricing_type = 'BY_LENGTH'         THEN COALESCE(oi.length, 0) " +
            "  WHEN s.pricing_type = 'BY_WIDTH'          THEN COALESCE(oi.width, 0) " +
            "  WHEN s.pricing_type = 'BY_RUNNING_METERS' THEN COALESCE(oi.running_meters, 0) " +
            "  ELSE 1 END), 0) as cost " +
            "FROM order_item_services ois " +
            "JOIN skus s          ON s.id = ois.sku_id " +
            "JOIN order_items oi  ON oi.id = ois.order_item_id " +
            "WHERE ois.status = 'DONE' " + filter +
            "GROUP BY s.name ORDER BY revenue DESC", p,
            (RowMapper<AnalyticsDto.MarginRow>) (rs, n) -> new AnalyticsDto.MarginRow(
                rs.getString("service_name"), longOrZero(rs, "count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost"))
            )
        );
    }

    public List<AnalyticsDto.WarrantyStat> warrantyStats(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        String filter = dateFilter("o.created_at", dateFrom, dateTo, p);
        return jdbc.query(
            "SELECT c.id as client_id, c.name as client_name, " +
            "COUNT(DISTINCT o.id) as total_orders, " +
            "COUNT(DISTINCT wo.id) as warranty_orders, " +
            "ROUND(COUNT(DISTINCT wo.id)::numeric / NULLIF(COUNT(DISTINCT o.id), 0) * 100, 1) as warranty_percent " +
            "FROM clients c " +
            "JOIN orders o ON o.client_id = c.id " +
            "LEFT JOIN orders wo ON wo.client_id = c.id AND wo.is_warranty = true " +
            "WHERE 1=1 " + filter +
            "GROUP BY c.id, c.name HAVING COUNT(DISTINCT o.id) > 0 " +
            "ORDER BY warranty_percent DESC NULLS LAST LIMIT 20", p,
            (RowMapper<AnalyticsDto.WarrantyStat>) (rs, n) -> new AnalyticsDto.WarrantyStat(
                rs.getLong("client_id"), rs.getString("client_name"),
                longOrZero(rs, "total_orders"), longOrZero(rs, "warranty_orders"),
                nz(rs.getBigDecimal("warranty_percent"))
            )
        );
    }

    // Старые перегрузки для обратной совместимости (вызовы без дат — за всё время).
    public List<AnalyticsDto.DistrictCount>  ordersByDistrict() { return ordersByDistrict(null, null); }
    public List<AnalyticsDto.StatusCount>    ordersByStatus()   { return ordersByStatus(null, null); }
    public List<AnalyticsDto.TypeCount>      itemsByType()      { return itemsByType(null, null); }
    public List<AnalyticsDto.EmployeeStat>   employeeStats()    { return employeeStats(null, null); }
    public List<AnalyticsDto.MonthRevenue>   revenueByMonth()   { return revenueByMonth(null, null); }
    public List<AnalyticsDto.TopClient>      topClients()       { return topClients(null, null); }
    public List<AnalyticsDto.MarginRow>      marginAnalysis()   { return marginAnalysis(null, null); }
    public List<AnalyticsDto.WarrantyStat>   warrantyStats()    { return warrantyStats(null, null); }
}
