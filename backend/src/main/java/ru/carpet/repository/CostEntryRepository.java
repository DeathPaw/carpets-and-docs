package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.CostEntry;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Реестры затрат: материальные закупки и прочие расходы (ТЗ v2, блок 2).
 *
 * <p>Одна таблица на оба реестра — поля совпадают, различается {@code kind}.
 * Фильтры общие: период, категория, поставщик, способ учёта.
 */
@Repository
public class CostEntryRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public CostEntryRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Фильтры реестра. Все поля опциональные. */
    public record Filters(
            String kind,
            LocalDate from,
            LocalDate to,
            Long categoryId,
            String counterparty,
            String allocation,
            String search
    ) {}

    private static final String SELECT_COLS = """
        c.id, c.kind, c.entry_date, c.category_id, ec.name AS category_name,
        c.title, c.quantity, c.unit, c.amount, c.counterparty, c.comment,
        c.allocation, c.alloc_month, c.alloc_from, c.alloc_to, c.alloc_order_id,
        c.created_by, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM cost_entry_files f WHERE f.cost_entry_id = c.id) AS files_count
        """;

    private static final String FROM_JOINS = """
         FROM cost_entries c
         LEFT JOIN expense_categories ec ON ec.id = c.category_id
        """;

    private static final RowMapper<CostEntry> ROW_MAPPER = (rs, rn) -> new CostEntry(
            rs.getLong("id"),
            rs.getString("kind"),
            rs.getDate("entry_date").toLocalDate(),
            rs.getObject("category_id", Long.class),
            rs.getString("category_name"),
            rs.getString("title"),
            rs.getBigDecimal("quantity"),
            rs.getString("unit"),
            rs.getBigDecimal("amount"),
            rs.getString("counterparty"),
            rs.getString("comment"),
            rs.getString("allocation"),
            date(rs.getDate("alloc_month")),
            date(rs.getDate("alloc_from")),
            date(rs.getDate("alloc_to")),
            rs.getObject("alloc_order_id", Long.class),
            rs.getString("created_by"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime(),
            rs.getInt("files_count"));

    private static LocalDate date(java.sql.Date d) { return d == null ? null : d.toLocalDate(); }

    public List<CostEntry> findAll(Filters f) {
        var params = new MapSqlParameterSource();
        StringBuilder sql = new StringBuilder("SELECT " + SELECT_COLS + FROM_JOINS + " WHERE 1=1 ");
        appendFilters(sql, params, f);
        sql.append(" ORDER BY c.entry_date DESC, c.id DESC");
        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }

    /** Итоги по отобранному: сколько записей и на какую сумму. */
    public Map<String, Object> totals(Filters f) {
        var params = new MapSqlParameterSource();
        StringBuilder sql = new StringBuilder(
                "SELECT COUNT(*) AS entries, COALESCE(SUM(c.amount), 0) AS total " + FROM_JOINS + " WHERE 1=1 ");
        appendFilters(sql, params, f);
        return jdbc.queryForMap(sql.toString(), params);
    }

    private void appendFilters(StringBuilder sql, MapSqlParameterSource params, Filters f) {
        if (notBlank(f.kind()))         { sql.append(" AND c.kind = :kind ");            params.addValue("kind", f.kind()); }
        if (f.from() != null)           { sql.append(" AND c.entry_date >= :from ");     params.addValue("from", f.from()); }
        if (f.to() != null)             { sql.append(" AND c.entry_date <= :to ");       params.addValue("to", f.to()); }
        if (f.categoryId() != null)     { sql.append(" AND c.category_id = :cat ");      params.addValue("cat", f.categoryId()); }
        if (notBlank(f.allocation()))   { sql.append(" AND c.allocation = :alloc ");     params.addValue("alloc", f.allocation()); }
        if (notBlank(f.counterparty())) {
            sql.append(" AND LOWER(COALESCE(c.counterparty, '')) LIKE :cp ");
            params.addValue("cp", "%" + f.counterparty().toLowerCase().trim() + "%");
        }
        if (notBlank(f.search())) {
            sql.append(" AND (LOWER(c.title) LIKE :q OR LOWER(COALESCE(c.comment, '')) LIKE :q) ");
            params.addValue("q", "%" + f.search().toLowerCase().trim() + "%");
        }
    }

    private static boolean notBlank(String s) { return s != null && !s.isBlank(); }

    public Optional<CostEntry> findById(Long id) {
        return jdbc.query("SELECT " + SELECT_COLS + FROM_JOINS + " WHERE c.id = :id",
                Map.of("id", id), ROW_MAPPER).stream().findFirst();
    }

    public Long save(CostEntry e, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO cost_entries
                (kind, entry_date, category_id, title, quantity, unit, amount, counterparty, comment,
                 allocation, alloc_month, alloc_from, alloc_to, alloc_order_id, created_by)
            VALUES (:kind, :date, :cat, :title, :qty, :unit, :amount, :cp, :comment,
                    :alloc, :month, :from, :to, :order, :by)
        """, params(e).addValue("by", createdBy), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void update(Long id, CostEntry e) {
        jdbc.update("""
            UPDATE cost_entries
               SET kind = :kind, entry_date = :date, category_id = :cat, title = :title,
                   quantity = :qty, unit = :unit, amount = :amount, counterparty = :cp, comment = :comment,
                   allocation = :alloc, alloc_month = :month, alloc_from = :from, alloc_to = :to,
                   alloc_order_id = :order, updated_at = NOW()
             WHERE id = :id
        """, params(e).addValue("id", id));
    }

    /** Отдельно — кнопка «Учёт в себестоимости» в строке реестра. */
    public void updateAllocation(Long id, String allocation, LocalDate month,
                                 LocalDate from, LocalDate to, Long orderId) {
        jdbc.update("""
            UPDATE cost_entries
               SET allocation = :alloc, alloc_month = :month, alloc_from = :from,
                   alloc_to = :to, alloc_order_id = :order, updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("alloc", allocation)
                .addValue("month", month)
                .addValue("from", from)
                .addValue("to", to)
                .addValue("order", orderId)
                .addValue("id", id));
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM cost_entries WHERE id = :id", Map.of("id", id));
    }

    private MapSqlParameterSource params(CostEntry e) {
        return new MapSqlParameterSource()
                .addValue("kind", e.kind())
                .addValue("date", e.entryDate())
                .addValue("cat", e.categoryId())
                .addValue("title", e.title())
                .addValue("qty", e.quantity())
                .addValue("unit", e.unit())
                .addValue("amount", e.amount())
                .addValue("cp", e.counterparty())
                .addValue("comment", e.comment())
                .addValue("alloc", e.allocation())
                .addValue("month", e.allocMonth())
                .addValue("from", e.allocFrom())
                .addValue("to", e.allocTo())
                .addValue("order", e.allocOrderId());
    }

    // ---------- суммы для расчёта себестоимости ----------

    /** Суммы, отнесённые на конкретный месяц: ключ — 'YYYY-MM'. */
    public Map<String, BigDecimal> monthlyAmounts() {
        var rows = jdbc.queryForList("""
            SELECT to_char(alloc_month, 'YYYY-MM') AS ym, SUM(amount) AS total
              FROM cost_entries WHERE allocation = 'MONTH' AND alloc_month IS NOT NULL
             GROUP BY 1
        """, Map.of());
        return toMap(rows);
    }

    /** Затраты с периодом — распределяются по месяцам в сервисе. */
    public List<Map<String, Object>> periodEntries() {
        return jdbc.queryForList("""
            SELECT id, title, amount, alloc_from, alloc_to
              FROM cost_entries WHERE allocation = 'PERIOD'
               AND alloc_from IS NOT NULL AND alloc_to IS NOT NULL
             ORDER BY alloc_from
        """, Map.of());
    }

    /** Прямые расходы по заказу — в общую базу распределения они не входят. */
    public BigDecimal directAmountForOrder(Long orderId) {
        BigDecimal v = jdbc.queryForObject("""
            SELECT COALESCE(SUM(amount), 0) FROM cost_entries
             WHERE allocation = 'ORDER' AND alloc_order_id = :id
        """, Map.of("id", orderId), BigDecimal.class);
        return v == null ? BigDecimal.ZERO : v;
    }

    public List<CostEntry> findByOrderId(Long orderId) {
        return jdbc.query("SELECT " + SELECT_COLS + FROM_JOINS
                        + " WHERE c.alloc_order_id = :id ORDER BY c.entry_date DESC, c.id DESC",
                Map.of("id", orderId), ROW_MAPPER);
    }

    /**
     * Обработанные м² по месяцам — база распределения. Считаем по дате
     * завершения обработки позиции; у служебных позиций (приём, доставка,
     * оформление) площади нет, поэтому они сюда не попадают.
     */
    public Map<String, BigDecimal> metersByMonth() {
        var rows = jdbc.queryForList("""
            SELECT to_char(completed_at, 'YYYY-MM') AS ym, SUM(area) AS total
              FROM order_items
             WHERE status = 'DONE' AND completed_at IS NOT NULL AND area IS NOT NULL
             GROUP BY 1
        """, Map.of());
        return toMap(rows);
    }

    /** Метры заказа по месяцам завершения — чтобы разнести удельный расход. */
    public Map<String, BigDecimal> orderMetersByMonth(Long orderId) {
        var rows = jdbc.queryForList("""
            SELECT to_char(completed_at, 'YYYY-MM') AS ym, SUM(area) AS total
              FROM order_items
             WHERE order_id = :id AND status = 'DONE'
               AND completed_at IS NOT NULL AND area IS NOT NULL
             GROUP BY 1
        """, Map.of("id", orderId));
        return toMap(rows);
    }

    private static Map<String, BigDecimal> toMap(List<Map<String, Object>> rows) {
        var out = new java.util.LinkedHashMap<String, BigDecimal>();
        for (var r : rows) {
            Object ym = r.get("ym");
            Object total = r.get("total");
            if (ym == null) continue;
            out.put(ym.toString(), total instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(total)));
        }
        return out;
    }

    // ---------- вложения ----------

    public Long addFile(Long entryId, String filename, String contentType, String data) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO cost_entry_files (cost_entry_id, filename, content_type, data)
            VALUES (:e, :f, :ct, :d)
        """, new MapSqlParameterSource()
                .addValue("e", entryId).addValue("f", filename)
                .addValue("ct", contentType).addValue("d", data), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    /** Мета без самих файлов: они тяжёлые, в списке не нужны. */
    public List<Map<String, Object>> listFiles(Long entryId) {
        return jdbc.queryForList(
                "SELECT id, filename, content_type, created_at FROM cost_entry_files "
                        + "WHERE cost_entry_id = :id ORDER BY id",
                Map.of("id", entryId));
    }

    public Optional<Map<String, Object>> getFile(Long entryId, Long fileId) {
        var rows = jdbc.queryForList(
                "SELECT filename, content_type, data FROM cost_entry_files "
                        + "WHERE id = :f AND cost_entry_id = :e",
                Map.of("f", fileId, "e", entryId));
        return rows.stream().findFirst();
    }

    public void deleteFile(Long entryId, Long fileId) {
        jdbc.update("DELETE FROM cost_entry_files WHERE id = :f AND cost_entry_id = :e",
                Map.of("f", fileId, "e", entryId));
    }
}
