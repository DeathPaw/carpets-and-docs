package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
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

        // V9: счётчик заказов с потерянными позициями (delivery_state = LOST).
        result.put("lost_in_delivery", jdbc.queryForObject(
            "SELECT COUNT(DISTINCT o.id) FROM orders o " +
            "JOIN order_items oi ON oi.order_id = o.id " +
            "WHERE o.status NOT IN ('COMPLETED','CANCELLED') " +
            "  AND oi.delivery_state = 'LOST'",
            Map.of(), Long.class));

        return result;
    }

    /**
     * Детали проблемных заказов — для виджета на главной (Спринт B).
     * Возвращает до {@code limit} штук в каждой из трёх категорий, чтобы оператор
     * сразу видел, к кому проваливаться, а не отдельно открывал список и фильтровал.
     *
     * <p>Категории совпадают со счётчиками выше:
     *   • overdue_actual    — фактическая дата уже прошла, заказ не закрыт;
     *   • unassigned_logistics — пора забирать/доставлять, дата не назначена;
     *   • bad_address       — пора в логистику, адреса нет.
     *
     * <p>Если категорий с заказами больше {@code limit} — в счётчиках видно общее
     * число, а здесь — топ-N с пометкой «и ещё X».
     */
    public Map<String, Object> problemOrders(int limit) {
        Map<String, Object> result = new HashMap<>();
        result.put("overdue_actual",       fetchList(SQL_OVERDUE_ACTUAL,       limit));
        result.put("unassigned_logistics", fetchList(SQL_UNASSIGNED_LOGISTICS, limit));
        result.put("bad_address",          fetchList(SQL_BAD_ADDRESS,          limit));
        // Спринт V9: «Потеряно в доставке» — позиции с delivery_state=LOST
        // в незакрытых заказах. Это новый блок проблем.
        result.put("lost_in_delivery",     fetchList(SQL_LOST_IN_DELIVERY,     limit));
        return result;
    }

    private List<Map<String, Object>> fetchList(String sql, int limit) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, Map.of("limit", limit));
        // Приводим к простому формату: id, client_name, status, address, problem_date, problem_reason.
        // Поля для UI пробрасываются через snake_case (Jackson сконфигурирован).
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) out.add(r);
        return out;
    }

    private static final String SQL_OVERDUE_ACTUAL = """
        SELECT id,
               client_name,
               status,
               COALESCE(actual_pickup_date,  actual_delivery_date) AS problem_date,
               CASE
                 WHEN actual_pickup_date < CURRENT_DATE   THEN 'Просрочка забора'
                 WHEN actual_delivery_date < CURRENT_DATE THEN 'Просрочка доставки'
                 ELSE 'Просрочка по факт. дате'
               END AS problem_reason,
               COALESCE(pickup_address, delivery_address) AS address
        FROM orders
        WHERE status NOT IN ('DELIVERED','COMPLETED','CANCELLED')
          AND ((actual_pickup_date IS NOT NULL AND actual_pickup_date < CURRENT_DATE)
            OR (actual_delivery_date IS NOT NULL AND actual_delivery_date < CURRENT_DATE))
        ORDER BY problem_date
        LIMIT :limit
        """;

    private static final String SQL_UNASSIGNED_LOGISTICS = """
        SELECT id,
               client_name,
               status,
               CASE WHEN status = 'FOR_PICKUP' THEN 'Не назначен забор'
                    WHEN status = 'DONE'       THEN 'Не назначена доставка' END AS problem_reason,
               COALESCE(pickup_address, delivery_address) AS address,
               COALESCE(pickup_date, delivery_date) AS problem_date
        FROM orders
        WHERE (status = 'FOR_PICKUP' AND actual_pickup_date IS NULL)
           OR (status = 'DONE' AND actual_delivery_date IS NULL)
        ORDER BY created_at DESC
        LIMIT :limit
        """;

    private static final String SQL_LOST_IN_DELIVERY = """
        SELECT DISTINCT o.id,
               o.client_name,
               o.status,
               'Потеряно при доставке' AS problem_reason,
               o.actual_delivery_date  AS problem_date,
               o.delivery_address      AS address
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status NOT IN ('COMPLETED','CANCELLED')
          AND oi.delivery_state = 'LOST'
        ORDER BY o.actual_delivery_date NULLS LAST, o.id DESC
        LIMIT :limit
        """;

    private static final String SQL_BAD_ADDRESS = """
        SELECT id,
               client_name,
               status,
               'Адрес не заполнен' AS problem_reason,
               NULL::text AS address,
               COALESCE(pickup_date, delivery_date) AS problem_date
        FROM orders
        WHERE (status = 'FOR_PICKUP' AND (pickup_address IS NULL OR pickup_address = ''))
           OR (status = 'DONE' AND (delivery_address IS NULL OR delivery_address = ''))
        ORDER BY created_at DESC
        LIMIT :limit
        """;
}
