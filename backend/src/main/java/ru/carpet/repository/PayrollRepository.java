package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.PayScheme;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Данные ФОТ (ТЗ v2, блоки 3 и 4): схемы оплаты, доли за ковёр, табель смен,
 * точки водителей и строки ведомости.
 *
 * <p>Один репозиторий на модуль: таблицы мелкие и всегда используются вместе,
 * а раскладывать их по шести файлам — больше переходов, чем пользы.
 */
@Repository
public class PayrollRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public PayrollRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------- схемы оплаты ----------------

    private static final String SCHEME_COLS = """
        s.id, s.employee_id, e.name AS employee_name, s.scheme, s.valid_from, s.valid_to,
        s.rate_per_sqm, s.salary, s.point_rate, s.shift_hours, s.shift_fix,
        s.points_included, s.extra_point_rate, s.comment, s.created_by, s.created_at
        """;

    private static final RowMapper<PayScheme> SCHEME_MAPPER = (rs, rn) -> new PayScheme(
            rs.getLong("id"),
            rs.getLong("employee_id"),
            rs.getString("employee_name"),
            rs.getString("scheme"),
            rs.getDate("valid_from").toLocalDate(),
            rs.getDate("valid_to") == null ? null : rs.getDate("valid_to").toLocalDate(),
            rs.getBigDecimal("rate_per_sqm"),
            rs.getBigDecimal("salary"),
            rs.getBigDecimal("point_rate"),
            rs.getBigDecimal("shift_hours"),
            rs.getBigDecimal("shift_fix"),
            rs.getObject("points_included", Integer.class),
            rs.getBigDecimal("extra_point_rate"),
            rs.getString("comment"),
            rs.getString("created_by"),
            rs.getTimestamp("created_at").toLocalDateTime());

    public List<PayScheme> schemes(Long employeeId) {
        String where = employeeId == null ? "" : " WHERE s.employee_id = :id ";
        return jdbc.query("SELECT " + SCHEME_COLS
                        + " FROM employee_pay_schemes s JOIN employees e ON e.id = s.employee_id "
                        + where + " ORDER BY e.name, s.valid_from DESC",
                employeeId == null ? Map.of() : Map.of("id", employeeId), SCHEME_MAPPER);
    }

    /** Схема, действующая на дату. Если их несколько — берём позднейшую по началу. */
    public Optional<PayScheme> schemeAt(Long employeeId, LocalDate date) {
        return jdbc.query("SELECT " + SCHEME_COLS
                        + " FROM employee_pay_schemes s JOIN employees e ON e.id = s.employee_id "
                        + " WHERE s.employee_id = :id AND s.valid_from <= :d "
                        + "   AND (s.valid_to IS NULL OR s.valid_to >= :d) "
                        + " ORDER BY s.valid_from DESC LIMIT 1",
                Map.of("id", employeeId, "d", date), SCHEME_MAPPER).stream().findFirst();
    }

    public Long saveScheme(PayScheme s, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO employee_pay_schemes
                (employee_id, scheme, valid_from, valid_to, rate_per_sqm, salary, point_rate,
                 shift_hours, shift_fix, points_included, extra_point_rate, comment, created_by)
            VALUES (:emp, :scheme, :from, :to, :rate, :salary, :point,
                    :hours, :fix, :included, :extra, :comment, :by)
        """, new MapSqlParameterSource()
                .addValue("emp", s.employeeId())
                .addValue("scheme", s.scheme())
                .addValue("from", s.validFrom())
                .addValue("to", s.validTo())
                .addValue("rate", s.ratePerSqm())
                .addValue("salary", s.salary())
                .addValue("point", s.pointRate())
                .addValue("hours", s.shiftHours())
                .addValue("fix", s.shiftFix())
                .addValue("included", s.pointsIncluded())
                .addValue("extra", s.extraPointRate())
                .addValue("comment", s.comment())
                .addValue("by", createdBy), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    /**
     * Закрывает открытые схемы сотрудника днём раньше начала новой: в один
     * момент действует только одна схема.
     */
    public void closeOpenSchemes(Long employeeId, LocalDate newFrom) {
        jdbc.update("""
            UPDATE employee_pay_schemes
               SET valid_to = :from - INTERVAL '1 day'
             WHERE employee_id = :emp AND valid_to IS NULL AND valid_from < :from
        """, Map.of("emp", employeeId, "from", newFrom));
    }

    public void deleteScheme(Long id) {
        jdbc.update("DELETE FROM employee_pay_schemes WHERE id = :id", Map.of("id", id));
    }

    // ---------------- правило долей ----------------

    public Optional<Map<String, Object>> shareRule(String yearMonth) {
        return jdbc.queryForList("SELECT * FROM payroll_share_rules WHERE year_month = :ym",
                Map.of("ym", yearMonth)).stream().findFirst();
    }

    public List<Map<String, Object>> shareRuleMembers(Long ruleId) {
        return jdbc.queryForList("""
            SELECT m.employee_id, e.name AS employee_name, m.percent
              FROM payroll_share_rule_members m
              JOIN employees e ON e.id = m.employee_id
             WHERE m.rule_id = :id ORDER BY e.name
        """, Map.of("id", ruleId));
    }

    public Long upsertShareRule(String yearMonth, String mode, String createdBy) {
        jdbc.update("""
            INSERT INTO payroll_share_rules (year_month, mode, created_by)
            VALUES (:ym, :mode, :by)
            ON CONFLICT (year_month) DO UPDATE SET mode = :mode, updated_at = NOW()
        """, Map.of("ym", yearMonth, "mode", mode, "by", createdBy == null ? "" : createdBy));
        return jdbc.queryForObject("SELECT id FROM payroll_share_rules WHERE year_month = :ym",
                Map.of("ym", yearMonth), Long.class);
    }

    public void replaceShareRuleMembers(Long ruleId, List<Map<String, Object>> members) {
        jdbc.update("DELETE FROM payroll_share_rule_members WHERE rule_id = :id", Map.of("id", ruleId));
        for (var m : members) {
            jdbc.update("""
                INSERT INTO payroll_share_rule_members (rule_id, employee_id, percent)
                VALUES (:rule, :emp, :pct)
            """, Map.of("rule", ruleId,
                    "emp", ((Number) m.get("employee_id")).longValue(),
                    "pct", new BigDecimal(String.valueOf(m.get("percent")))));
        }
    }

    // ---------------- доли на ковре ----------------

    public List<Map<String, Object>> itemShares(Long orderItemId) {
        return jdbc.queryForList("""
            SELECT s.id, s.employee_id, e.name AS employee_name, s.percent, s.rule_mode, s.source
              FROM order_item_shares s JOIN employees e ON e.id = s.employee_id
             WHERE s.order_item_id = :id ORDER BY e.name
        """, Map.of("id", orderItemId));
    }

    public boolean hasManualShares(Long orderItemId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_item_shares WHERE order_item_id = :id AND source = 'MANUAL'",
                Map.of("id", orderItemId), Integer.class);
        return n != null && n > 0;
    }

    public void replaceItemShares(Long orderItemId, List<Map<String, Object>> shares,
                                  String ruleMode, String source) {
        jdbc.update("DELETE FROM order_item_shares WHERE order_item_id = :id", Map.of("id", orderItemId));
        for (var s : shares) {
            jdbc.update("""
                INSERT INTO order_item_shares (order_item_id, employee_id, percent, rule_mode, source)
                VALUES (:item, :emp, :pct, :mode, :src)
            """, Map.of("item", orderItemId,
                    "emp", ((Number) s.get("employee_id")).longValue(),
                    "pct", new BigDecimal(String.valueOf(s.get("percent"))),
                    "mode", ruleMode == null ? "EQUAL" : ruleMode,
                    "src", source));
        }
    }

    /** Завершённые ковры месяца: площадь, дата и участники (исполнители услуг). */
    public List<Map<String, Object>> completedItems(String yearMonth) {
        return jdbc.queryForList("""
            SELECT oi.id, oi.order_id, oi.area, oi.completed_at::date AS completed_on,
                   COALESCE(NULLIF(oi.description, ''), it.name) AS item_name,
                   ARRAY(
                       SELECT DISTINCT sa.employee_id
                         FROM order_item_services ois
                         JOIN service_assignees sa ON sa.order_item_service_id = ois.id
                        WHERE ois.order_item_id = oi.id AND ois.status <> 'CANCELLED'
                   ) AS employee_ids
              FROM order_items oi
              LEFT JOIN item_types it ON it.id = oi.item_type_id
             WHERE oi.status = 'DONE' AND oi.completed_at IS NOT NULL
               AND oi.area IS NOT NULL
               AND to_char(oi.completed_at, 'YYYY-MM') = :ym
             ORDER BY oi.completed_at, oi.id
        """, Map.of("ym", yearMonth));
    }

    // ---------------- смены ----------------

    public List<Map<String, Object>> shifts(String yearMonth, Long employeeId) {
        var params = new MapSqlParameterSource().addValue("ym", yearMonth).addValue("emp", employeeId);
        String where = employeeId == null ? "" : " AND w.employee_id = :emp ";
        return jdbc.queryForList("""
            SELECT w.id, w.employee_id, e.name AS employee_name, w.shift_date, w.source, w.reason, w.created_by
              FROM work_shifts w JOIN employees e ON e.id = w.employee_id
             WHERE to_char(w.shift_date, 'YYYY-MM') = :ym
        """ + where + " ORDER BY w.shift_date, e.name", params);
    }

    /** Одна смена в день: повторное основание не создаёт вторую. */
    public void ensureShift(Long employeeId, LocalDate date, String source, String reason, String createdBy) {
        jdbc.update("""
            INSERT INTO work_shifts (employee_id, shift_date, source, reason, created_by)
            VALUES (:emp, :d, :src, :reason, :by)
            ON CONFLICT (employee_id, shift_date) DO NOTHING
        """, new MapSqlParameterSource()
                .addValue("emp", employeeId).addValue("d", date)
                .addValue("src", source).addValue("reason", reason).addValue("by", createdBy));
    }

    public void deleteShift(Long id) {
        jdbc.update("DELETE FROM work_shifts WHERE id = :id", Map.of("id", id));
    }

    public int countShifts(Long employeeId, String yearMonth) {
        Integer n = jdbc.queryForObject("""
            SELECT COUNT(*) FROM work_shifts
             WHERE employee_id = :emp AND to_char(shift_date, 'YYYY-MM') = :ym
        """, Map.of("emp", employeeId, "ym", yearMonth), Integer.class);
        return n == null ? 0 : n;
    }

    // ---------------- точки водителей ----------------

    public void upsertDriverPoint(Long orderId, String leg, Long employeeId, LocalDate date, String createdBy) {
        jdbc.update("""
            INSERT INTO driver_points (employee_id, point_date, order_id, leg, source, created_by)
            VALUES (:emp, :d, :order, :leg, 'AUTO', :by)
            ON CONFLICT (order_id, leg) DO UPDATE
               SET employee_id = :emp, point_date = :d
        """, new MapSqlParameterSource()
                .addValue("emp", employeeId).addValue("d", date)
                .addValue("order", orderId).addValue("leg", leg).addValue("by", createdBy));
    }

    /** Точка исчезла (сняли дату или водителя) — убираем, чтобы не платить за неё. */
    public void deleteDriverPoint(Long orderId, String leg) {
        jdbc.update("DELETE FROM driver_points WHERE order_id = :order AND leg = :leg",
                Map.of("order", orderId, "leg", leg));
    }

    /** Данные заказа, из которых получаются точки водителя. */
    public Optional<Map<String, Object>> orderLegs(Long orderId) {
        return jdbc.queryForList("""
            SELECT id, assigned_driver_id, actual_pickup_date, actual_delivery_date, status
              FROM orders WHERE id = :id
        """, Map.of("id", orderId)).stream().findFirst();
    }

    public List<Map<String, Object>> driverPoints(String yearMonth, Long employeeId) {
        var params = new MapSqlParameterSource().addValue("ym", yearMonth).addValue("emp", employeeId);
        String where = employeeId == null ? "" : " AND p.employee_id = :emp ";
        return jdbc.queryForList("""
            SELECT p.id, p.employee_id, e.name AS employee_name, p.point_date, p.order_id, p.leg, p.source
              FROM driver_points p JOIN employees e ON e.id = p.employee_id
             WHERE to_char(p.point_date, 'YYYY-MM') = :ym
        """ + where + " ORDER BY p.point_date, p.id", params);
    }

    /** Точки по дням: ключ — дата, значение — сколько точек в этот день. */
    public Map<LocalDate, Integer> pointsByDay(Long employeeId, String yearMonth) {
        var rows = jdbc.queryForList("""
            SELECT point_date, COUNT(*) AS cnt FROM driver_points
             WHERE employee_id = :emp AND to_char(point_date, 'YYYY-MM') = :ym
             GROUP BY point_date ORDER BY point_date
        """, Map.of("emp", employeeId, "ym", yearMonth));
        var out = new java.util.LinkedHashMap<LocalDate, Integer>();
        for (var r : rows) {
            out.put(((java.sql.Date) r.get("point_date")).toLocalDate(), ((Number) r.get("cnt")).intValue());
        }
        return out;
    }

    // ---------------- строки ведомости ----------------

    /**
     * Пишет автоматическое начисление. Если строку уже правили руками, сумму
     * не трогаем — сохраняем только пересчитанное авто-значение, чтобы в
     * ведомости было видно расхождение.
     */
    public void upsertAutoEntry(Long employeeId, String yearMonth, LocalDate date, String kind,
                                String sourceType, Long sourceId, BigDecimal amount, String details) {
        jdbc.update("""
            INSERT INTO payroll_entries
                (employee_id, year_month, entry_date, kind, source_type, source_id,
                 amount, auto_amount, details)
            VALUES (:emp, :ym, :d, :kind, :stype, :sid, :amount, :amount, :details)
            ON CONFLICT (employee_id, year_month, source_type, source_id)
              WHERE source_id IS NOT NULL
            DO UPDATE SET
                auto_amount = EXCLUDED.auto_amount,
                amount = CASE WHEN payroll_entries.corrected_at IS NULL
                              THEN EXCLUDED.amount ELSE payroll_entries.amount END,
                entry_date = EXCLUDED.entry_date,
                details = EXCLUDED.details,
                updated_at = NOW()
        """, new MapSqlParameterSource()
                .addValue("emp", employeeId).addValue("ym", yearMonth).addValue("d", date)
                .addValue("kind", kind).addValue("stype", sourceType).addValue("sid", sourceId)
                .addValue("amount", amount).addValue("details", details));
    }

    /** Ручная добавка оператора — со своим основанием. */
    public Long addManualEntry(Long employeeId, String yearMonth, LocalDate date,
                               BigDecimal amount, String details, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO payroll_entries
                (employee_id, year_month, entry_date, kind, source_type, source_id,
                 amount, auto_amount, details, corrected_by, corrected_at, correction_reason)
            VALUES (:emp, :ym, :d, 'MANUAL', 'MANUAL', NULL, :amount, NULL, :details, :by, NOW(), :details)
        """, new MapSqlParameterSource()
                .addValue("emp", employeeId).addValue("ym", yearMonth).addValue("d", date)
                .addValue("amount", amount).addValue("details", details).addValue("by", createdBy),
                keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    /** Ручная правка суммы: авто-значение остаётся для сравнения. */
    public void correctEntry(Long id, BigDecimal amount, String reason, String by) {
        jdbc.update("""
            UPDATE payroll_entries
               SET amount = :amount, correction_reason = :reason,
                   corrected_by = :by, corrected_at = NOW(), updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("id", id).addValue("amount", amount)
                .addValue("reason", reason).addValue("by", by));
    }

    /** Вернуть строку к автоматическому расчёту. */
    public void resetEntry(Long id) {
        jdbc.update("""
            UPDATE payroll_entries
               SET amount = COALESCE(auto_amount, amount), correction_reason = NULL,
                   corrected_by = NULL, corrected_at = NULL, updated_at = NOW()
             WHERE id = :id
        """, Map.of("id", id));
    }

    public void deleteEntry(Long id) {
        jdbc.update("DELETE FROM payroll_entries WHERE id = :id", Map.of("id", id));
    }

    /**
     * Убирает авто-строки, источников которых больше нет (ковёр откатили,
     * точку сняли). Правленные руками не трогаем — оператор решал сам.
     */
    public void deleteOrphanAutoEntries(String yearMonth, String sourceType, List<Long> aliveIds) {
        var params = new MapSqlParameterSource()
                .addValue("ym", yearMonth)
                .addValue("stype", sourceType)
                .addValue("ids", aliveIds.isEmpty() ? List.of(-1L) : aliveIds);
        jdbc.update("""
            DELETE FROM payroll_entries
             WHERE year_month = :ym AND source_type = :stype
               AND corrected_at IS NULL
               AND (source_id IS NULL OR source_id NOT IN (:ids))
        """, params);
    }

    public List<Map<String, Object>> entries(String yearMonth, Long employeeId) {
        var params = new MapSqlParameterSource().addValue("ym", yearMonth).addValue("emp", employeeId);
        String where = employeeId == null ? "" : " AND p.employee_id = :emp ";
        return jdbc.queryForList("""
            SELECT p.id, p.employee_id, e.name AS employee_name, p.year_month, p.entry_date,
                   p.kind, p.source_type, p.source_id, p.amount, p.auto_amount, p.details,
                   p.corrected_by, p.corrected_at, p.correction_reason
              FROM payroll_entries p JOIN employees e ON e.id = p.employee_id
             WHERE p.year_month = :ym
        """ + where + " ORDER BY e.name, p.entry_date, p.id", params);
    }

    // ---------------- месяц ведомости ----------------

    public Map<String, Object> month(String yearMonth) {
        var rows = jdbc.queryForList("SELECT * FROM payroll_months WHERE year_month = :ym",
                Map.of("ym", yearMonth));
        return rows.isEmpty() ? Map.of("year_month", yearMonth, "closed", false) : rows.get(0);
    }

    public void upsertMonth(String yearMonth, Integer normDays) {
        jdbc.update("""
            INSERT INTO payroll_months (year_month, norm_days)
            VALUES (:ym, :norm)
            ON CONFLICT (year_month) DO UPDATE SET norm_days = :norm, updated_at = NOW()
        """, new MapSqlParameterSource().addValue("ym", yearMonth).addValue("norm", normDays));
    }

    public void setClosed(String yearMonth, boolean closed, String by) {
        jdbc.update("""
            INSERT INTO payroll_months (year_month, closed, closed_by, closed_at)
            VALUES (:ym, :closed, :by, CASE WHEN :closed THEN NOW() ELSE NULL END)
            ON CONFLICT (year_month) DO UPDATE
               SET closed = :closed,
                   closed_by = CASE WHEN :closed THEN :by ELSE NULL END,
                   closed_at = CASE WHEN :closed THEN NOW() ELSE NULL END,
                   updated_at = NOW()
        """, new MapSqlParameterSource().addValue("ym", yearMonth)
                .addValue("closed", closed).addValue("by", by));
    }

    /** Сотрудники, у которых в месяце есть схема оплаты. */
    public List<Map<String, Object>> employeesWithSchemes(String yearMonth) {
        return jdbc.queryForList("""
            SELECT DISTINCT e.id, e.name
              FROM employees e
              JOIN employee_pay_schemes s ON s.employee_id = e.id
             WHERE s.valid_from <= (to_date(:ym, 'YYYY-MM') + INTERVAL '1 month - 1 day')::date
               AND (s.valid_to IS NULL OR s.valid_to >= to_date(:ym, 'YYYY-MM'))
             ORDER BY e.name
        """, Map.of("ym", yearMonth));
    }
}
