package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.dto.AnalyticsDto;

import java.util.List;

import static ru.carpet.repository.AnalyticsHelpers.longOrZero;
import static ru.carpet.repository.AnalyticsHelpers.nz;

/**
 * Общая аналитика (карточки разделов, графики страницы Аналитика).
 *
 * <p>Раньше был один большой репозиторий на 500+ строк. После разбивки тут остались
 * методы, которые не относятся ни к дашборду главной, ни к производственной очереди,
 * ни к доходности — это сводки для графиков (по статусам, типам, районам, выручка
 * по месяцам, гарантия, маржа). См. также:
 * <ul>
 *   <li>{@link DashboardRepository} — виджеты главной страницы;</li>
 *   <li>{@link ProductionRepository} — производственная очередь (заказ/позиция/услуга);</li>
 *   <li>{@link ProfitabilityRepository} — доходность по разрезам;</li>
 *   <li>{@link AnalyticsHelpers} — общие SQL-фрагменты (COST_EXPR, dateFilter и т.п.).</li>
 * </ul>
 */
@Repository
public class AnalyticsRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public AnalyticsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AnalyticsDto.DistrictCount> ordersByDistrict() {
        return jdbc.query(
            "SELECT COALESCE(delivery_district, pickup_district, 'Не указан') as district, " +
            "COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total " +
            "FROM orders WHERE status NOT IN ('CANCELLED') " +
            "GROUP BY district ORDER BY count DESC",
            (RowMapper<AnalyticsDto.DistrictCount>) (rs, n) -> new AnalyticsDto.DistrictCount(
                rs.getString("district"), longOrZero(rs, "count"), nz(rs.getBigDecimal("total"))
            )
        );
    }

    public List<AnalyticsDto.StatusCount> ordersByStatus() {
        // «Активные» = всё, что НЕ в финальных состояниях. COMPLETED — финальное
        // (заказ выдан и закрыт), его не считаем активным; раньше попадал в график.
        return jdbc.query(
            "SELECT status, COUNT(*) as count " +
            "FROM orders WHERE status NOT IN ('DELIVERED', 'COMPLETED', 'CANCELLED') " +
            "GROUP BY status ORDER BY count DESC",
            (RowMapper<AnalyticsDto.StatusCount>) (rs, n) -> new AnalyticsDto.StatusCount(
                rs.getString("status"), longOrZero(rs, "count")
            )
        );
    }

    public List<AnalyticsDto.TypeCount> itemsByType() {
        // V10: is_default у item_types удалён. Считаем все типы; «авто-добавленные»
        // позиции (доставка/приём) теперь отделяются по SKU.is_auto_add, но для
        // аналитики имеет смысл их тоже видеть.
        return jdbc.query(
            "SELECT it.name as type_name, COUNT(*) as count " +
            "FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id " +
            "GROUP BY it.name ORDER BY count DESC",
            (RowMapper<AnalyticsDto.TypeCount>) (rs, n) -> new AnalyticsDto.TypeCount(
                rs.getString("type_name"), longOrZero(rs, "count")
            )
        );
    }

    public List<AnalyticsDto.EmployeeStat> employeeStats() {
        return jdbc.query(
            "SELECT e.name, COUNT(*) as services_done, COALESCE(SUM(ois.price), 0) as total_earned " +
            "FROM service_assignees sa " +
            "JOIN employees e ON e.id = sa.employee_id " +
            "JOIN order_item_services ois ON ois.id = sa.order_item_service_id " +
            "WHERE ois.status = 'DONE' " +
            "GROUP BY e.name ORDER BY services_done DESC",
            (RowMapper<AnalyticsDto.EmployeeStat>) (rs, n) -> new AnalyticsDto.EmployeeStat(
                rs.getString("name"), longOrZero(rs, "services_done"), nz(rs.getBigDecimal("total_earned"))
            )
        );
    }

    public List<AnalyticsDto.MonthRevenue> revenueByMonth() {
        return jdbc.query(
            "SELECT TO_CHAR(created_at, 'YYYY-MM') as month, " +
            "COUNT(*) as orders_count, COALESCE(SUM(total_amount), 0) as revenue " +
            "FROM orders WHERE paid = true " +
            "GROUP BY month ORDER BY month DESC LIMIT 12",
            (RowMapper<AnalyticsDto.MonthRevenue>) (rs, n) -> new AnalyticsDto.MonthRevenue(
                rs.getString("month"), longOrZero(rs, "orders_count"), nz(rs.getBigDecimal("revenue"))
            )
        );
    }

    public List<AnalyticsDto.TopClient> topClients() {
        return jdbc.query(
            "SELECT c.id as client_id, c.name, c.client_type, COUNT(o.id) as orders_count, " +
            "COALESCE(SUM(o.total_amount), 0) as total_spent " +
            "FROM clients c JOIN orders o ON o.client_id = c.id " +
            "WHERE o.status NOT IN ('CANCELLED') " +
            "GROUP BY c.id, c.name, c.client_type ORDER BY total_spent DESC LIMIT 10",
            (RowMapper<AnalyticsDto.TopClient>) (rs, n) -> new AnalyticsDto.TopClient(
                rs.getLong("client_id"), rs.getString("name"), rs.getString("client_type"),
                longOrZero(rs, "orders_count"), nz(rs.getBigDecimal("total_spent"))
            )
        );
    }

    public List<AnalyticsDto.MarginRow> marginAnalysis() {
        return jdbc.query(
            // V10: имя/тип/себестоимость берутся напрямую с SKU через ois.sku_id.
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
            "WHERE ois.status = 'DONE' " +
            "GROUP BY s.name ORDER BY revenue DESC",
            (RowMapper<AnalyticsDto.MarginRow>) (rs, n) -> new AnalyticsDto.MarginRow(
                rs.getString("service_name"), longOrZero(rs, "count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost"))
            )
        );
    }

    public List<AnalyticsDto.WarrantyStat> warrantyStats() {
        return jdbc.query(
            "SELECT c.id as client_id, c.name as client_name, " +
            "COUNT(DISTINCT o.id) as total_orders, " +
            "COUNT(DISTINCT wo.id) as warranty_orders, " +
            "ROUND(COUNT(DISTINCT wo.id)::numeric / NULLIF(COUNT(DISTINCT o.id), 0) * 100, 1) as warranty_percent " +
            "FROM clients c " +
            "JOIN orders o ON o.client_id = c.id " +
            "LEFT JOIN orders wo ON wo.client_id = c.id AND wo.is_warranty = true " +
            "GROUP BY c.id, c.name HAVING COUNT(DISTINCT o.id) > 0 " +
            "ORDER BY warranty_percent DESC NULLS LAST LIMIT 20",
            (RowMapper<AnalyticsDto.WarrantyStat>) (rs, n) -> new AnalyticsDto.WarrantyStat(
                rs.getLong("client_id"), rs.getString("client_name"),
                longOrZero(rs, "total_orders"), longOrZero(rs, "warranty_orders"),
                nz(rs.getBigDecimal("warranty_percent"))
            )
        );
    }
}
