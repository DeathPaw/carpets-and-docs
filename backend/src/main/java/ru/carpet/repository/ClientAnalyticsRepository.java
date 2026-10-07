package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

/**
 * Портрет клиентской базы (V47, правка №1 от 13.09).
 *
 * <p>Одна строка на клиента: контакты, маркетинговые поля, скидки и
 * агрегаты по заказам — сколько их, на какую сумму, первый и последний.
 * Из этих же строк делается выгрузка в Excel (правка №2 от 13.09), поэтому
 * фильтры и сортировка живут здесь, а не на фронте.
 */
@Repository
public class ClientAnalyticsRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ClientAnalyticsRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Разрешённые поля сортировки — параметр приходит из URL, подстановка в SQL только из белого списка. */
    private static final Map<String, String> SORT_FIELDS = Map.of(
            "name", "c.name",
            "orders_count", "orders_count",
            "total_spent", "total_spent",
            "last_order", "last_order",
            "age", "c.age"
    );

    public record Filters(
            String search,
            List<String> districts,
            String source,
            String restartStatus,
            String gender,
            String clientType,
            /** true — только клиенты с больше чем одним заказом («постоянные»). */
            Boolean onlyRegular,
            /** true — только клиенты со скидкой (модификатор или признак пенсионера). */
            Boolean withDiscount,
            Integer minOrders,
            String sortBy,
            String sortDir
    ) {}

    public List<Map<String, Object>> rows(Filters f, int limit) {
        var params = new MapSqlParameterSource().addValue("limit", limit);
        StringBuilder sql = new StringBuilder("""
            SELECT c.id, c.client_type, c.name, c.first_name, c.last_name,
                   c.phone, c.extra_phone, c.address, c.apartment, c.district,
                   c.comment, c.is_pensioner, c.is_regular, c.is_problem,
                   c.gender, c.age, c.restart_status, c.source, c.source_note,
                   c.created_at,
                   COALESCE(o.orders_count, 0) AS orders_count,
                   COALESCE(o.total_spent, 0)  AS total_spent,
                   o.first_order, o.last_order,
                   m.discounts, COALESCE(m.discount_percent, 0) AS discount_percent
              FROM clients c
              -- Отменённые заказы в портрет не идут: денег по ним не было.
              LEFT JOIN LATERAL (
                   SELECT COUNT(*) AS orders_count,
                          SUM(total_amount) AS total_spent,
                          MIN(created_at)::date AS first_order,
                          MAX(created_at)::date AS last_order
                     FROM orders WHERE client_id = c.id AND status <> 'CANCELLED'
              ) o ON TRUE
              LEFT JOIN LATERAL (
                   SELECT string_agg(pm.name || ' ('
                                     || trim(trailing '.' from trim(to_char(pm.percent, 'FM990.99')))
                                     || '%)', ', ') AS discounts,
                          SUM(pm.percent) AS discount_percent
                     FROM client_modifiers cm
                     JOIN price_modifiers pm ON pm.id = cm.modifier_id
                    WHERE cm.client_id = c.id
              ) m ON TRUE
             WHERE 1=1
            """);

        if (f.search() != null && !f.search().isBlank()) {
            sql.append(" AND (LOWER(c.name) LIKE :q OR COALESCE(c.phone,'') LIKE :q"
                    + " OR COALESCE(c.extra_phone,'') LIKE :q OR LOWER(COALESCE(c.address,'')) LIKE :q) ");
            params.addValue("q", "%" + f.search().toLowerCase().trim() + "%");
        }
        if (f.districts() != null && !f.districts().isEmpty()) {
            sql.append(" AND c.district IN (:districts) ");
            params.addValue("districts", f.districts());
        }
        if (notBlank(f.source()))        { sql.append(" AND c.source = :source ");          params.addValue("source", f.source()); }
        if (notBlank(f.restartStatus())) { sql.append(" AND c.restart_status = :restart "); params.addValue("restart", f.restartStatus()); }
        if (notBlank(f.gender()))        { sql.append(" AND c.gender = :gender ");          params.addValue("gender", f.gender()); }
        if (notBlank(f.clientType()))    { sql.append(" AND c.client_type = :ctype ");      params.addValue("ctype", f.clientType()); }
        if (Boolean.TRUE.equals(f.onlyRegular())) {
            sql.append(" AND COALESCE(o.orders_count, 0) > 1 ");
        }
        if (f.minOrders() != null && f.minOrders() > 0) {
            sql.append(" AND COALESCE(o.orders_count, 0) >= :minOrders ");
            params.addValue("minOrders", f.minOrders());
        }
        if (Boolean.TRUE.equals(f.withDiscount())) {
            // Скидка — это либо персональный модификатор, либо признак пенсионера.
            sql.append(" AND (m.discounts IS NOT NULL OR c.is_pensioner = TRUE) ");
        }

        // Map.of() кидает NPE на getOrDefault(null) — сортировку могут не передать вовсе.
        String sortField = f.sortBy() == null ? "c.name" : SORT_FIELDS.getOrDefault(f.sortBy(), "c.name");
        String dir = "desc".equalsIgnoreCase(f.sortDir()) ? "DESC" : "ASC";
        sql.append(" ORDER BY ").append(sortField).append(' ').append(dir)
           .append(" NULLS LAST, c.id LIMIT :limit");

        return jdbc.queryForList(sql.toString(), params);
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    /** Сводка для шапки портрета: сколько клиентов, постоянных, со скидками, средний чек. */
    public Map<String, Object> summary(Filters f) {
        List<Map<String, Object>> rows = rows(f, 100000);
        long total = rows.size();
        long regular = rows.stream().filter(r -> num(r.get("orders_count")) > 1).count();
        long withDiscount = rows.stream()
                .filter(r -> r.get("discounts") != null || Boolean.TRUE.equals(r.get("is_pensioner"))).count();
        double revenue = rows.stream().mapToDouble(r -> num(r.get("total_spent"))).sum();
        long orders = rows.stream().mapToLong(r -> (long) num(r.get("orders_count"))).sum();
        return Map.of(
                "clients", total,
                "regular", regular,
                "with_discount", withDiscount,
                "orders", orders,
                "revenue", revenue,
                "avg_order", orders > 0 ? revenue / orders : 0.0
        );
    }

    private static double num(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0d;
    }
}
