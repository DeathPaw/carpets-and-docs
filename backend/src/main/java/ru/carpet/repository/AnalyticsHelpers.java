package ru.carpet.repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

/**
 * Общие хелперы для аналитических репозиториев. Раньше дублировались в одном
 * большом {@code AnalyticsRepository}; после разбивки на три (Dashboard/Production/Profitability)
 * вынесены сюда, чтобы каждый репозиторий не носил свою копию.
 */
final class AnalyticsHelpers {
    private AnalyticsHelpers() {}

    /**
     * Расчёт себестоимости по pricing_type — единое выражение для всех аналитик доходности.
     * Завязано на алиасы {@code pl} (price_list), {@code sd} (service_definitions),
     * {@code oi} (order_items). Все запросы доходности используют эти псевдонимы.
     */
    static final String COST_EXPR =
            "COALESCE(SUM(pl.cost_price * CASE " +
            "  WHEN sd.pricing_type = 'FIXED' THEN 1 " +
            "  WHEN sd.pricing_type = 'BY_WEIGHT' THEN COALESCE(oi.weight, 0) " +
            "  WHEN sd.pricing_type = 'BY_AREA' THEN COALESCE(oi.length * oi.width, COALESCE(oi.area, 0)) " +
            "  WHEN sd.pricing_type = 'BY_PERIMETER' THEN COALESCE(2 * (oi.length + oi.width), 0) " +
            "  ELSE 1 END), 0)";

    /** Безопасное чтение Long: возвращает 0 если NULL. */
    static long longOrZero(ResultSet rs, String col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? 0L : v;
    }

    /** NULL → 0 для BigDecimal. */
    static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }

    /** Кусок WHERE-clause для фильтра по диапазону дат. */
    static String dateFilterClause(String alias, String dateFrom, String dateTo) {
        StringBuilder sb = new StringBuilder();
        if (dateFrom != null && !dateFrom.isEmpty()) sb.append(" AND ").append(alias).append(".created_at >= :dateFrom");
        if (dateTo   != null && !dateTo.isEmpty())   sb.append(" AND ").append(alias).append(".created_at < :dateTo");
        return sb.toString();
    }

    /** Параметры для бинда — соответствуют именам в {@link #dateFilterClause}. */
    static Map<String, Object> dateParams(String dateFrom, String dateTo) {
        Map<String, Object> p = new HashMap<>();
        if (dateFrom != null && !dateFrom.isEmpty()) p.put("dateFrom", java.time.LocalDate.parse(dateFrom).atStartOfDay());
        if (dateTo   != null && !dateTo.isEmpty())   p.put("dateTo",   java.time.LocalDate.parse(dateTo).plusDays(1).atStartOfDay());
        return p;
    }
}
