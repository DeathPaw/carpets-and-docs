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
     * Расчёт себестоимости по pricing_type — V10: завязано на SKU (s.cost_price,
     * s.pricing_type) и параметры позиции (oi.*). Все запросы доходности
     * используют алиас {@code s} для skus.
     */
    static final String COST_EXPR =
            "COALESCE(SUM(s.cost_price * CASE " +
            "  WHEN s.pricing_type = 'FIXED'             THEN 1 " +
            "  WHEN s.pricing_type = 'BY_WEIGHT'         THEN COALESCE(oi.weight, 0) " +
            "  WHEN s.pricing_type = 'BY_AREA'           THEN COALESCE(oi.area, 0) " +
            "  WHEN s.pricing_type = 'BY_PERIMETER'      THEN COALESCE(oi.perimeter, 0) " +
            "  WHEN s.pricing_type = 'BY_LENGTH'         THEN COALESCE(oi.length, 0) " +
            "  WHEN s.pricing_type = 'BY_WIDTH'          THEN COALESCE(oi.width, 0) " +
            "  WHEN s.pricing_type = 'BY_RUNNING_METERS' THEN COALESCE(oi.running_meters, 0) " +
            "  ELSE 1 END), 0)";

    /**
     * Коэффициент «цена услуги → фактическая выручка».
     *
     * <p>Клиент платит {@code orders.total_amount} — это база минус/плюс модификаторы
     * и минус округление до сотни. Сумма же голых {@code ois.price} равна
     * {@code base_amount}, то есть выручке ДО модификаторов. Раньше часть отчётов
     * брала total_amount, а часть — SUM(ois.price), и доходность одного заказа
     * в карточке и в сводке по клиентам расходилась ровно на величину модификаторов.
     *
     * <p>Теперь каждая услуга берётся с этим коэффициентом: суммы всех срезов
     * (по клиенту, типу позиции, сотруднику, району) сходятся с total_amount заказа.
     * Требует алиас {@code o} для orders в запросе.
     */
    static final String REVENUE_RATIO = "COALESCE(o.total_amount / NULLIF(o.base_amount, 0), 1)";

    /** Выручка по набору услуг с учётом {@link #REVENUE_RATIO}. Требует алиасы {@code ois} и {@code o}. */
    static final String REVENUE_EXPR = "COALESCE(SUM(ois.price * " + REVENUE_RATIO + "), 0)";

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
