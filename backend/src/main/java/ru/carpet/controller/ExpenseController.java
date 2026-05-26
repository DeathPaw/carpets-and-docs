package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * V11: Ежемесячные расходы + P&L.
 * Категории расходов (аренда, ФОТ, электричество…) и суммы по месяцам.
 */
@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

    private final NamedParameterJdbcTemplate jdbc;

    public ExpenseController(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---- Категории ----

    @GetMapping("/categories")
    public List<Map<String, Object>> listCategories() {
        return jdbc.queryForList(
                "SELECT * FROM expense_categories ORDER BY sort_order, id", Map.of());
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createCategory(@RequestBody Map<String, Object> body) {
        var kh = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO expense_categories (name, is_fixed, default_amount, sort_order)
            VALUES (:n, :f, :d, :s)
        """, new MapSqlParameterSource()
                .addValue("n", body.get("name"))
                .addValue("f", body.getOrDefault("is_fixed", false))
                .addValue("d", body.get("default_amount"))
                .addValue("s", body.getOrDefault("sort_order", 100)),
            kh, new String[]{"id"});
        return jdbc.queryForMap("SELECT * FROM expense_categories WHERE id = :id",
                Map.of("id", kh.getKey().longValue()));
    }

    @DeleteMapping("/categories/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCategory(@PathVariable Long id) {
        jdbc.update("DELETE FROM monthly_expenses WHERE category_id = :id", Map.of("id", id));
        jdbc.update("DELETE FROM expense_categories WHERE id = :id", Map.of("id", id));
    }

    /** Переименование/правка категории (name, is_fixed, default_amount). */
    @PutMapping("/categories/{id}")
    public Map<String, Object> updateCategory(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        jdbc.update("""
            UPDATE expense_categories
               SET name = :n,
                   is_fixed = :f,
                   default_amount = :d
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("n", body.get("name"))
                .addValue("f", body.getOrDefault("is_fixed", false))
                .addValue("d", body.get("default_amount"))
                .addValue("id", id));
        return jdbc.queryForMap("SELECT * FROM expense_categories WHERE id = :id", Map.of("id", id));
    }

    // ---- Месячные суммы ----

    @GetMapping
    public List<Map<String, Object>> listExpenses(@RequestParam(required = false) String yearMonth) {
        if (yearMonth != null) {
            return jdbc.queryForList(
                    "SELECT me.*, ec.name AS category_name, ec.is_fixed " +
                    "FROM monthly_expenses me JOIN expense_categories ec ON ec.id = me.category_id " +
                    "WHERE me.year_month = :ym ORDER BY ec.sort_order",
                    Map.of("ym", yearMonth));
        }
        return jdbc.queryForList(
                "SELECT me.*, ec.name AS category_name, ec.is_fixed " +
                "FROM monthly_expenses me JOIN expense_categories ec ON ec.id = me.category_id " +
                "ORDER BY me.year_month DESC, ec.sort_order", Map.of());
    }

    @PostMapping
    public Map<String, Object> upsertExpense(@RequestBody Map<String, Object> body) {
        Long categoryId = ((Number) body.get("category_id")).longValue();
        String yearMonth = (String) body.get("year_month");
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        String comment = (String) body.get("comment");

        jdbc.update("""
            INSERT INTO monthly_expenses (category_id, year_month, amount, comment)
            VALUES (:c, :ym, :a, :cm)
            ON CONFLICT (category_id, year_month) DO UPDATE SET amount = :a, comment = :cm
        """, Map.of("c", categoryId, "ym", yearMonth, "a", amount, "cm", comment != null ? comment : ""));

        return jdbc.queryForMap(
                "SELECT me.*, ec.name AS category_name FROM monthly_expenses me " +
                "JOIN expense_categories ec ON ec.id = me.category_id " +
                "WHERE me.category_id = :c AND me.year_month = :ym",
                Map.of("c", categoryId, "ym", yearMonth));
    }

    // ---- P&L ----

    @GetMapping("/pnl")
    public Map<String, Object> pnl(@RequestParam String yearMonth) {
        // Revenue = SUM(total_amount) for orders in this month
        BigDecimal revenue = jdbc.queryForObject(
                "SELECT COALESCE(SUM(total_amount), 0) FROM orders " +
                "WHERE TO_CHAR(created_at, 'YYYY-MM') = :ym AND status NOT IN ('CANCELLED', 'LEAD')",
                Map.of("ym", yearMonth), BigDecimal.class);

        // COGS = SUM(cost_price × factor) for DONE services
        BigDecimal cogs = jdbc.queryForObject("""
            SELECT COALESCE(SUM(s.cost_price * CASE
                WHEN s.pricing_type = 'FIXED'             THEN 1
                WHEN s.pricing_type = 'BY_WEIGHT'         THEN COALESCE(oi.weight, 0)
                WHEN s.pricing_type = 'BY_AREA'           THEN COALESCE(oi.area, 0)
                WHEN s.pricing_type = 'BY_PERIMETER'      THEN COALESCE(oi.perimeter, 0)
                WHEN s.pricing_type = 'BY_LENGTH'         THEN COALESCE(oi.length, 0)
                WHEN s.pricing_type = 'BY_WIDTH'          THEN COALESCE(oi.width, 0)
                WHEN s.pricing_type = 'BY_RUNNING_METERS' THEN COALESCE(oi.running_meters, 0)
                ELSE 1 END), 0)
              FROM order_item_services ois
              JOIN order_items oi ON oi.id = ois.order_item_id
              JOIN orders o ON o.id = oi.order_id
              JOIN skus s ON s.id = ois.sku_id
             WHERE ois.status = 'DONE'
               AND TO_CHAR(o.created_at, 'YYYY-MM') = :ym
        """, Map.of("ym", yearMonth), BigDecimal.class);

        // Expenses
        BigDecimal expenses = jdbc.queryForObject(
                "SELECT COALESCE(SUM(amount), 0) FROM monthly_expenses WHERE year_month = :ym",
                Map.of("ym", yearMonth), BigDecimal.class);

        BigDecimal grossProfit = revenue.subtract(cogs != null ? cogs : BigDecimal.ZERO);
        BigDecimal netProfit = grossProfit.subtract(expenses != null ? expenses : BigDecimal.ZERO);

        return Map.of(
                "year_month", yearMonth,
                "revenue", revenue,
                "cogs", cogs != null ? cogs : BigDecimal.ZERO,
                "gross_profit", grossProfit,
                "expenses", expenses != null ? expenses : BigDecimal.ZERO,
                "net_profit", netProfit
        );
    }
}
