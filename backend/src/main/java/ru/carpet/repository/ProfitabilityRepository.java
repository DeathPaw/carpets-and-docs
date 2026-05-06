package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.dto.AnalyticsDto;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static ru.carpet.repository.AnalyticsHelpers.COST_EXPR;
import static ru.carpet.repository.AnalyticsHelpers.dateFilterClause;
import static ru.carpet.repository.AnalyticsHelpers.dateParams;
import static ru.carpet.repository.AnalyticsHelpers.longOrZero;
import static ru.carpet.repository.AnalyticsHelpers.nz;

/**
 * Доходность — все срезы prof... запросы. Раньше жили в общем AnalyticsRepository.
 *
 * <p>Везде {@code revenue = SUM(ois.price)} (только DONE-услуги),
 * {@code cost} — расчёт по cost_price из price_list через {@link AnalyticsHelpers#COST_EXPR}.
 */
@Repository
public class ProfitabilityRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ProfitabilityRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Доходность по типам позиций. */
    public List<AnalyticsDto.ProfitByItemType> profitByItemType(String dateFrom, String dateTo) {
        return jdbc.query(
            "SELECT it.id, it.name, " +
            "COUNT(DISTINCT oi.id) AS items_count, " +
            "COALESCE(SUM(ois.price), 0) AS revenue, " +
            COST_EXPR + " AS cost, " +
            "COALESCE(SUM(ois.price), 0) - " + COST_EXPR + " AS profit, " +
            "COUNT(*) FILTER (WHERE ois.id IS NOT NULL AND pl.cost_price IS NULL) AS cost_missing " +
            "FROM item_types it " +
            "LEFT JOIN order_items oi ON oi.item_type_id = it.id " +
            "LEFT JOIN orders o ON o.id = oi.order_id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id AND ois.status = 'DONE' " +
            "LEFT JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE 1=1 " + dateFilterClause("o", dateFrom, dateTo) + " " +
            "GROUP BY it.id, it.name ORDER BY revenue DESC NULLS LAST",
            dateParams(dateFrom, dateTo),
            (RowMapper<AnalyticsDto.ProfitByItemType>) (rs, n) -> new AnalyticsDto.ProfitByItemType(
                rs.getLong("id"), rs.getString("name"), longOrZero(rs, "items_count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost")), nz(rs.getBigDecimal("profit")),
                longOrZero(rs, "cost_missing")
            )
        );
    }

    /** Доходность по клиентам. */
    public List<AnalyticsDto.ProfitByClient> profitByClient(String dateFrom, String dateTo) {
        return jdbc.query(
            "SELECT c.id AS client_id, c.name, c.client_type, " +
            "COUNT(DISTINCT o.id) AS orders_count, " +
            "COALESCE(SUM(ois.price), 0) AS revenue, " +
            COST_EXPR + " AS cost, " +
            "COALESCE(SUM(ois.price), 0) - " + COST_EXPR + " AS profit " +
            "FROM clients c " +
            "JOIN orders o ON o.client_id = c.id " +
            "LEFT JOIN order_items oi ON oi.order_id = o.id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id AND ois.status = 'DONE' " +
            "LEFT JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE o.status NOT IN ('CANCELLED') " + dateFilterClause("o", dateFrom, dateTo) + " " +
            "GROUP BY c.id, c.name, c.client_type ORDER BY profit DESC NULLS LAST LIMIT 50",
            dateParams(dateFrom, dateTo),
            (RowMapper<AnalyticsDto.ProfitByClient>) (rs, n) -> new AnalyticsDto.ProfitByClient(
                rs.getLong("client_id"), rs.getString("name"), rs.getString("client_type"),
                longOrZero(rs, "orders_count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost")), nz(rs.getBigDecimal("profit"))
            )
        );
    }

    /** Доходность по сотрудникам — кто сколько услуг сделал, по каким услугам и какая прибыль. */
    public List<AnalyticsDto.ProfitByEmployee> profitByEmployee(String dateFrom, String dateTo) {
        return jdbc.query(
            "SELECT e.id AS employee_id, e.name, " +
            "COUNT(DISTINCT ois.id) AS services_count, " +
            "COALESCE(SUM(ois.price / NULLIF(assigned_count.cnt, 0)), 0) AS revenue, " +
            "COALESCE(SUM((pl.cost_price * CASE " +
            "  WHEN sd.pricing_type = 'FIXED' THEN 1 " +
            "  WHEN sd.pricing_type = 'BY_WEIGHT' THEN COALESCE(oi.weight, 0) " +
            "  WHEN sd.pricing_type = 'BY_AREA' THEN COALESCE(oi.length * oi.width, COALESCE(oi.area, 0)) " +
            "  WHEN sd.pricing_type = 'BY_PERIMETER' THEN COALESCE(2 * (oi.length + oi.width), 0) " +
            "  ELSE 1 END) / NULLIF(assigned_count.cnt, 0)), 0) AS cost " +
            "FROM employees e " +
            "JOIN service_assignees sa ON sa.employee_id = e.id " +
            "JOIN order_item_services ois ON ois.id = sa.order_item_service_id AND ois.status = 'DONE' " +
            "JOIN order_items oi ON oi.id = ois.order_item_id " +
            "JOIN orders o ON o.id = oi.order_id " +
            "JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "JOIN (SELECT order_item_service_id, COUNT(*) AS cnt FROM service_assignees GROUP BY order_item_service_id) assigned_count " +
            "  ON assigned_count.order_item_service_id = ois.id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE 1=1 " + dateFilterClause("o", dateFrom, dateTo) + " " +
            "GROUP BY e.id, e.name ORDER BY revenue DESC",
            dateParams(dateFrom, dateTo),
            (RowMapper<AnalyticsDto.ProfitByEmployee>) (rs, n) -> new AnalyticsDto.ProfitByEmployee(
                rs.getLong("employee_id"), rs.getString("name"), longOrZero(rs, "services_count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost"))
            )
        );
    }

    /** Доходность по сотруднику в разрезе услуг — какую сумму он приносит на каких услугах. */
    public List<AnalyticsDto.ProfitByEmployeeService> profitByEmployeeServices(Long employeeId, String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>(dateParams(dateFrom, dateTo));
        p.put("employeeId", employeeId);
        return jdbc.query(
            "SELECT sd.id AS service_id, sd.name AS service_name, " +
            "COUNT(DISTINCT ois.id) AS count, " +
            "COALESCE(SUM(ois.price / NULLIF(assigned_count.cnt, 0)), 0) AS revenue " +
            "FROM service_assignees sa " +
            "JOIN order_item_services ois ON ois.id = sa.order_item_service_id AND ois.status = 'DONE' " +
            "JOIN order_items oi ON oi.id = ois.order_item_id " +
            "JOIN orders o ON o.id = oi.order_id " +
            "JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "JOIN (SELECT order_item_service_id, COUNT(*) AS cnt FROM service_assignees GROUP BY order_item_service_id) assigned_count " +
            "  ON assigned_count.order_item_service_id = ois.id " +
            "WHERE sa.employee_id = :employeeId " + dateFilterClause("o", dateFrom, dateTo) + " " +
            "GROUP BY sd.id, sd.name ORDER BY revenue DESC",
            p,
            (RowMapper<AnalyticsDto.ProfitByEmployeeService>) (rs, n) -> new AnalyticsDto.ProfitByEmployeeService(
                rs.getLong("service_id"), rs.getString("service_name"),
                longOrZero(rs, "count"), nz(rs.getBigDecimal("revenue"))
            )
        );
    }

    /** Доходность по районам (берём pickup_district как основной). */
    public List<AnalyticsDto.ProfitByDistrict> profitByDistrict(String dateFrom, String dateTo) {
        return jdbc.query(
            "SELECT COALESCE(o.pickup_district, '(без района)') AS district, " +
            "COUNT(DISTINCT o.id) AS orders_count, " +
            "COALESCE(SUM(ois.price), 0) AS revenue, " +
            COST_EXPR + " AS cost, " +
            "COALESCE(SUM(ois.price), 0) - " + COST_EXPR + " AS profit " +
            "FROM orders o " +
            "LEFT JOIN order_items oi ON oi.order_id = o.id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id AND ois.status = 'DONE' " +
            "LEFT JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE o.status NOT IN ('CANCELLED') " + dateFilterClause("o", dateFrom, dateTo) + " " +
            "GROUP BY COALESCE(o.pickup_district, '(без района)') ORDER BY profit DESC NULLS LAST",
            dateParams(dateFrom, dateTo),
            (RowMapper<AnalyticsDto.ProfitByDistrict>) (rs, n) -> new AnalyticsDto.ProfitByDistrict(
                rs.getString("district"), longOrZero(rs, "orders_count"),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost")), nz(rs.getBigDecimal("profit"))
            )
        );
    }

    /** Доходность по заказам (с возможностью отфильтровать по конкретному клиенту). */
    public List<AnalyticsDto.ProfitByOrder> profitByOrder(String dateFrom, String dateTo, Long clientId) {
        Map<String, Object> p = new HashMap<>(dateParams(dateFrom, dateTo));
        StringBuilder sb = new StringBuilder("SELECT o.id, o.client_name, o.status, o.created_at, " +
            "o.total_amount AS revenue, " +
            COST_EXPR + " AS cost, " +
            "o.total_amount - " + COST_EXPR + " AS profit " +
            "FROM orders o " +
            "LEFT JOIN order_items oi ON oi.order_id = o.id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id AND ois.status = 'DONE' " +
            "LEFT JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "LEFT JOIN price_list pl ON pl.item_type_id = oi.item_type_id AND pl.service_def_id = ois.service_def_id " +
            "WHERE o.status NOT IN ('CANCELLED') " + dateFilterClause("o", dateFrom, dateTo));
        if (clientId != null) {
            sb.append(" AND o.client_id = :clientId ");
            p.put("clientId", clientId);
        }
        sb.append(" GROUP BY o.id, o.client_name, o.status, o.created_at, o.total_amount " +
                  " ORDER BY profit DESC NULLS LAST LIMIT 200");
        return jdbc.query(sb.toString(), p,
            (RowMapper<AnalyticsDto.ProfitByOrder>) (rs, n) -> new AnalyticsDto.ProfitByOrder(
                rs.getLong("id"), rs.getString("client_name"), rs.getString("status"),
                rs.getTimestamp("created_at").toLocalDateTime(),
                nz(rs.getBigDecimal("revenue")), nz(rs.getBigDecimal("cost")), nz(rs.getBigDecimal("profit"))
            )
        );
    }
}
