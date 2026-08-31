package ru.carpet.controller;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.service.AuditLogService;

import java.util.List;
import java.util.Map;

/**
 * V33: заявки на закупку расходных материалов.
 *
 * <p>Производство создаёт заявку, оператор ведёт её по статусам
 * NEW → ORDERED → RECEIVED. Отмена возможна на любом шаге, но только
 * с причиной — иначе непонятно, почему материал так и не купили.
 * Статусов ровно четыре — по одному на столбец доски (V36).
 *
 * <p>Деньги: при RECEIVED оператор вносит дату закупки и фактическую сумму.
 * После каждого изменения пересчитывается месячный расход по категории
 * «Расходные материалы» — сумма всех полученных заявок этого месяца.
 * Пересчёт, а не инкремент: правка суммы, отмена уже полученной заявки или
 * смена даты сами себя чинят, дублей не возникает.
 */
@RestController
@RequestMapping("/api/supply-requests")
public class SupplyRequestController {

    /** Категория расходов, куда складываются закупки. Заводится миграцией V33. */
    private static final String MATERIALS_CATEGORY = "Расходные материалы";

    private static final String COLS = """
            id, title, quantity, unit,
            TO_CHAR(needed_by, 'YYYY-MM-DD')   AS needed_by,
            comment, status,
            created_by_employee_id, created_by_name,
            TO_CHAR(received_on, 'YYYY-MM-DD') AS received_on,
            actual_quantity, actual_amount, expected_amount, cancel_reason,
            created_at, updated_at
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final AuditLogService audit;

    public SupplyRequestController(NamedParameterJdbcTemplate jdbc, AuditLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /**
     * Список заявок. status — фильтр («NEW,ORDERED»), пусто = все.
     * openOnly=true — только незакрытые (для рабочего списка оператора).
     */
    @GetMapping
    public List<Map<String, Object>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Boolean openOnly
    ) {
        var sql = new StringBuilder("SELECT " + COLS + " FROM supply_requests WHERE 1=1 ");
        var p = new MapSqlParameterSource();
        if (status != null && !status.isBlank()) {
            sql.append("AND status IN (:statuses) ");
            p.addValue("statuses", List.of(status.split(",")));
        }
        if (Boolean.TRUE.equals(openOnly)) {
            sql.append("AND status IN ('NEW','ORDERED') ");
        }
        // Сначала срочные: у кого срок ближе. Без срока — в конец.
        sql.append("ORDER BY needed_by NULLS LAST, id DESC");
        return jdbc.queryForList(sql.toString(), p);
    }

    /**
     * Открытые заявки, которые нужны в ближайшие N дней (по умолчанию 7) —
     * блок на Главной. Просроченные тоже попадают: их нужно закрыть в первую очередь.
     */
    @GetMapping("/upcoming")
    public List<Map<String, Object>> upcoming(@RequestParam(defaultValue = "7") int days) {
        return jdbc.queryForList(
            "SELECT " + COLS + " FROM supply_requests " +
            "WHERE status IN ('NEW','ORDERED') " +
            "  AND needed_by IS NOT NULL " +
            "  AND needed_by <= CURRENT_DATE + make_interval(days => :days) " +
            "ORDER BY needed_by, id",
            Map.of("days", days));
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        String title = str(body.get("title"));
        if (title == null || title.isBlank()) {
            throw new BusinessRuleException("Укажите, что нужно закупить");
        }
        var p = base(body).addValue("title", title.trim());
        var kh = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO supply_requests
              (title, quantity, unit, needed_by, comment, expected_amount,
               created_by_employee_id, created_by_name)
            VALUES
              (:title, :qty, :unit, NULLIF(:neededBy,'')::date, :comment, :expected, :byId, :byName)
            """, p, kh, new String[]{"id"});
        Long id = kh.getKey().longValue();
        audit.log("SUPPLY_REQUEST", id, "CREATE", "Заявка на закупку: " + title);
        return byId(id);
    }

    /**
     * Правка полей заявки. Статус меняется отдельной ручкой.
     *
     * <p>У полученной заявки правятся и данные закупки — дата, количество, сумма:
     * оператор мог ошибиться при вводе, и без правки пришлось бы возвращать
     * заявку в работу и проводить её заново. Смена даты переносит расход в
     * другой месяц, поэтому пересчитываем оба месяца, как при смене статуса.
     */
    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> before = byId(id); // 404, если нет
        var p = base(body).addValue("id", id).addValue("title", str(body.get("title")));
        jdbc.update("""
            UPDATE supply_requests SET
              title = :title, quantity = :qty, unit = :unit,
              needed_by = NULLIF(:neededBy,'')::date, comment = :comment,
              expected_amount = :expected, updated_at = NOW()
            WHERE id = :id
            """, p);

        if ("RECEIVED".equals(str(before.get("status"))) && body.containsKey("received_on")) {
            String receivedOn = str(body.get("received_on"));
            Object amount = body.get("actual_amount");
            if (receivedOn == null || receivedOn.isBlank()) {
                throw new BusinessRuleException("Укажите дату закупки — по ней расход попадёт в нужный месяц.");
            }
            if (amount == null) {
                throw new BusinessRuleException("Укажите фактическую сумму закупки.");
            }
            jdbc.update("""
                UPDATE supply_requests SET
                  received_on = :receivedOn::date,
                  actual_quantity = :actQty,
                  actual_amount = :actAmount,
                  updated_at = NOW()
                WHERE id = :id
                """, new MapSqlParameterSource()
                    .addValue("id", id)
                    .addValue("receivedOn", receivedOn)
                    .addValue("actQty", body.get("actual_quantity"))
                    .addValue("actAmount", amount));
            recalcMaterialsExpense(str(before.get("received_on")));
            recalcMaterialsExpense(receivedOn);
        }

        audit.log("SUPPLY_REQUEST", id, "UPDATE", "Изменена заявка на закупку #" + id);
        return byId(id);
    }

    /**
     * Смена статуса.
     * body: {"status": "...", "cancel_reason": "...", "received_on": "YYYY-MM-DD",
     *        "actual_quantity": N, "actual_amount": N}
     */
    @PatchMapping("/{id}/status")
    @Transactional
    public Map<String, Object> changeStatus(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> before = byId(id);
        String status = str(body.get("status"));
        if (status == null || !List.of("NEW", "ORDERED", "RECEIVED", "CANCELLED").contains(status)) {
            throw new BusinessRuleException("Недопустимый статус заявки");
        }

        var p = new MapSqlParameterSource().addValue("id", id).addValue("status", status);

        if ("CANCELLED".equals(status)) {
            String reason = str(body.get("cancel_reason"));
            if (reason == null || reason.trim().length() < 10) {
                throw new BusinessRuleException("Для отмены заявки укажите причину (минимум 10 символов).");
            }
            p.addValue("reason", reason.trim());
            jdbc.update("UPDATE supply_requests SET status='CANCELLED', cancel_reason=:reason, " +
                        "updated_at=NOW() WHERE id=:id", p);
        } else if ("RECEIVED".equals(status)) {
            String receivedOn = str(body.get("received_on"));
            Object amount = body.get("actual_amount");
            if (receivedOn == null || receivedOn.isBlank()) {
                throw new BusinessRuleException("Укажите дату закупки — по ней расход попадёт в нужный месяц.");
            }
            if (amount == null) {
                throw new BusinessRuleException("Укажите фактическую сумму закупки.");
            }
            p.addValue("receivedOn", receivedOn)
             .addValue("actQty", body.get("actual_quantity"))
             .addValue("actAmount", amount);
            jdbc.update("""
                UPDATE supply_requests SET
                  status='RECEIVED', received_on = :receivedOn::date,
                  actual_quantity = :actQty, actual_amount = :actAmount,
                  cancel_reason = NULL, updated_at = NOW()
                WHERE id = :id
                """, p);
        } else {
            // Возврат в работу снимает и отмену, и данные закупки: иначе в расходах
            // остался бы «хвост» от прежнего получения.
            jdbc.update("UPDATE supply_requests SET status=:status, cancel_reason=NULL, " +
                        "received_on=NULL, actual_quantity=NULL, actual_amount=NULL, " +
                        "updated_at=NOW() WHERE id=:id", p);
        }

        // Пересчитываем оба месяца: прежний (если заявка «уехала» из него) и новый.
        recalcMaterialsExpense(str(before.get("received_on")));
        recalcMaterialsExpense(str(byId(id).get("received_on")));

        audit.log("SUPPLY_REQUEST", id, "STATUS_CHANGE",
                "Заявка #" + id + ": " + before.get("status") + " → " + status);
        return byId(id);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable Long id) {
        Map<String, Object> before = byId(id);
        jdbc.update("DELETE FROM supply_requests WHERE id = :id", Map.of("id", id));
        recalcMaterialsExpense(str(before.get("received_on")));
        audit.log("SUPPLY_REQUEST", id, "DELETE", "Удалена заявка на закупку #" + id);
    }

    /**
     * Пересчёт месячного расхода по материалам за месяц указанной даты.
     *
     * <p>Считаем сумму заново, а не прибавляем: так правка суммы, отмена уже
     * полученной заявки и смена даты закупки не оставляют расхождений.
     * Если за месяц не осталось закупок — строку расхода удаляем, чтобы в
     * отчёте не висел ноль.
     */
    private void recalcMaterialsExpense(String isoDate) {
        if (isoDate == null || isoDate.isBlank()) return;
        String yearMonth = isoDate.substring(0, 7);   // YYYY-MM

        Long categoryId = jdbc.queryForList(
                "SELECT id FROM expense_categories WHERE name = :n",
                Map.of("n", MATERIALS_CATEGORY), Long.class).stream().findFirst().orElse(null);
        if (categoryId == null) return;   // категорию удалили — молча выходим

        java.math.BigDecimal total = jdbc.queryForObject("""
            SELECT COALESCE(SUM(actual_amount), 0) FROM supply_requests
             WHERE status = 'RECEIVED' AND TO_CHAR(received_on, 'YYYY-MM') = :ym
            """, Map.of("ym", yearMonth), java.math.BigDecimal.class);

        if (total == null || total.signum() == 0) {
            jdbc.update("DELETE FROM monthly_expenses WHERE category_id = :c AND year_month = :ym",
                    Map.of("c", categoryId, "ym", yearMonth));
            return;
        }
        jdbc.update("""
            INSERT INTO monthly_expenses (category_id, year_month, amount, comment)
            VALUES (:c, :ym, :a, 'Автоматически из заявок на закупку')
            ON CONFLICT (category_id, year_month)
            DO UPDATE SET amount = :a, comment = 'Автоматически из заявок на закупку'
            """, Map.of("c", categoryId, "ym", yearMonth, "a", total));
    }

    private MapSqlParameterSource base(Map<String, Object> body) {
        return new MapSqlParameterSource()
                .addValue("qty", body.get("quantity"))
                .addValue("unit", str(body.get("unit")))
                .addValue("neededBy", str(body.get("needed_by")))
                .addValue("comment", str(body.get("comment")))
                .addValue("byId", body.get("created_by_employee_id"))
                .addValue("expected", body.get("expected_amount"))
                .addValue("byName", str(body.get("created_by_name")));
    }

    private Map<String, Object> byId(Long id) {
        var rows = jdbc.queryForList("SELECT " + COLS + " FROM supply_requests WHERE id = :id",
                Map.of("id", id));
        if (rows.isEmpty()) throw new EntityNotFoundException("Заявка не найдена: " + id);
        return rows.get(0);
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
}
