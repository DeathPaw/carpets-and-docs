package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;

/**
 * Виджеты главной страницы. Раньше всё это было в одном большом {@code AnalyticsRepository}.
 * Вынесено отдельно, потому что:
 *   — сводка набирает виджеты быстрее всего (сегодня лиды, висящие, без координат и т.п.);
 *   — формат ответа — Map (намеренно гибкий — TS-сторого типизирован);
 *   — отдельный файл проще ревьюить и расширять без конфликта с аналитикой по доходности.
 */
@Repository
public class DashboardRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public DashboardRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
            "SELECT COUNT(*) FROM orders WHERE delivery_date < CURRENT_DATE AND status NOT IN ('DELIVERED','COMPLETED','CANCELLED')",
            Map.of(), Long.class));

        // «Висящие» заказы — лиды/созданные старше 7 дней без назначенной даты забора.
        // Это второй вид просрочки, не дублирующий overdue (там — просрочена delivery_date).
        result.put("stuck", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders " +
            "WHERE status IN ('LEAD','CREATED','FOR_PICKUP') " +
            "AND actual_pickup_date IS NULL AND pickup_date IS NULL " +
            "AND created_at < NOW() - INTERVAL '7 days'",
            Map.of(), Long.class));

        // Заказы без координат — в активных статусах есть адрес, но lat/lon = NULL.
        // На карте такие точки не отображаются, оператор может «потерять» заказ.
        result.put("no_coords", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders " +
            "WHERE status NOT IN ('DELIVERED','COMPLETED','CANCELLED') " +
            "AND ((pickup_address IS NOT NULL AND pickup_address <> '' AND pickup_lat IS NULL) " +
            "  OR (delivery_address IS NOT NULL AND delivery_address <> '' AND delivery_lat IS NULL))",
            Map.of(), Long.class));

        result.put("total_active", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status NOT IN ('DELIVERED','COMPLETED','CANCELLED')",
            Map.of(), Long.class));

        result.put("today_revenue", jdbc.queryForObject(
            "SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_date::date = CURRENT_DATE",
            Map.of(), java.math.BigDecimal.class));

        // Все лиды (для перехода на полный список) и отдельно — новых сегодня.
        result.put("total_leads", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status = 'LEAD'",
            Map.of(), Long.class));
        result.put("today_leads", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders WHERE status = 'LEAD' AND created_at::date = CURRENT_DATE",
            Map.of(), Long.class));

        // ───── Проблемные заказы (нижний блок «Главной») ─────

        // Просроченная фактическая доставка/забор: дата уже прошла, а статус активный.
        // overdue (выше) считает по plan-дате (delivery_date) — здесь именно фактическая.
        result.put("overdue_actual", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders " +
            "WHERE status NOT IN ('DELIVERED','COMPLETED','CANCELLED') " +
            "AND ((actual_pickup_date IS NOT NULL AND actual_pickup_date < CURRENT_DATE) " +
            "  OR (actual_delivery_date IS NOT NULL AND actual_delivery_date < CURRENT_DATE))",
            Map.of(), Long.class));

        // Не распределено в логистике: пора забирать (FOR_PICKUP) или доставлять (DONE),
        // но соответствующая фактическая дата ещё не назначена.
        result.put("unassigned_logistics", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders " +
            "WHERE (status = 'FOR_PICKUP' AND actual_pickup_date IS NULL) " +
            "   OR (status = 'DONE' AND actual_delivery_date IS NULL)",
            Map.of(), Long.class));

        // Некорректный адрес: пора забрать/доставить, но адрес не заполнен.
        // Дополняет «no_coords» сверху — там адрес есть, но без координат; здесь — самого адреса нет.
        result.put("bad_address", jdbc.queryForObject(
            "SELECT COUNT(*) FROM orders " +
            "WHERE (status = 'FOR_PICKUP' AND (pickup_address IS NULL OR pickup_address = '')) " +
            "   OR (status = 'DONE' AND (delivery_address IS NULL OR delivery_address = ''))",
            Map.of(), Long.class));

        return result;
    }
}
