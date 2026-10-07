package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Выездные чистки (ТЗ v2, блок 5).
 *
 * <p>Возвращаем плоские Map: у сущности немного полей, а фронт и отчёты всё
 * равно читают их как таблицу. Исполнители подтягиваются подзапросом, чтобы
 * список выездов не порождал запрос на каждую строку.
 */
@Repository
public class OnsiteCleaningRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OnsiteCleaningRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT_COLS = """
        c.id, c.client_id, c.client_name, c.address, c.district, c.cleaning_date::text AS cleaning_date,
        c.area, c.price, c.status, c.comment, c.completed_at, c.created_by, c.created_at,
        c.contract_id, (SELECT k.number FROM contracts k WHERE k.id = c.contract_id) AS contract_number,
        (SELECT string_agg(e.name, ', ' ORDER BY e.name)
           FROM onsite_cleaning_workers w JOIN employees e ON e.id = w.employee_id
          WHERE w.cleaning_id = c.id) AS workers
        """;

    public List<Map<String, Object>> findAll(LocalDate from, LocalDate to, String status) {
        var params = new MapSqlParameterSource().addValue("from", from).addValue("to", to).addValue("status", status);
        StringBuilder sql = new StringBuilder("SELECT " + SELECT_COLS + " FROM onsite_cleanings c WHERE 1=1 ");
        if (from != null) sql.append(" AND c.cleaning_date >= :from ");
        if (to != null) sql.append(" AND c.cleaning_date <= :to ");
        if (status != null && !status.isBlank()) sql.append(" AND c.status = :status ");
        sql.append(" ORDER BY c.cleaning_date DESC, c.id DESC");
        return jdbc.queryForList(sql.toString(), params);
    }

    public Optional<Map<String, Object>> findById(Long id) {
        return jdbc.queryForList("SELECT " + SELECT_COLS + " FROM onsite_cleanings c WHERE c.id = :id",
                Map.of("id", id)).stream().findFirst();
    }

    public Long save(Map<String, Object> data, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO onsite_cleanings
                (client_id, client_name, address, district, cleaning_date, area, price, comment,
                 contract_id, created_by)
            VALUES (:client, :name, :address, :district, :date, :area, :price, :comment, :contract, :by)
        """, params(data).addValue("by", createdBy), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void update(Long id, Map<String, Object> data) {
        jdbc.update("""
            UPDATE onsite_cleanings
               SET client_id = :client, client_name = :name, address = :address, district = :district,
                   cleaning_date = :date, area = :area, price = :price, comment = :comment,
                   contract_id = :contract, updated_at = NOW()
             WHERE id = :id
        """, params(data).addValue("id", id));
    }

    /** Завершение фиксируем датой: по ней идут метры месяца и контрактный факт. */
    public void setStatus(Long id, String status) {
        jdbc.update("""
            UPDATE onsite_cleanings
               SET status = :status,
                   completed_at = CASE WHEN :status = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END,
                   updated_at = NOW()
             WHERE id = :id
        """, Map.of("id", id, "status", status));
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM onsite_cleanings WHERE id = :id", Map.of("id", id));
    }

    public List<Map<String, Object>> workers(Long cleaningId) {
        return jdbc.queryForList("""
            SELECT w.employee_id, e.name AS employee_name, w.percent
              FROM onsite_cleaning_workers w JOIN employees e ON e.id = w.employee_id
             WHERE w.cleaning_id = :id ORDER BY e.name
        """, Map.of("id", cleaningId));
    }

    public void replaceWorkers(Long cleaningId, List<Map<String, Object>> workers) {
        jdbc.update("DELETE FROM onsite_cleaning_workers WHERE cleaning_id = :id", Map.of("id", cleaningId));
        for (var w : workers) {
            jdbc.update("""
                INSERT INTO onsite_cleaning_workers (cleaning_id, employee_id, percent)
                VALUES (:c, :e, :p)
            """, Map.of("c", cleaningId,
                    "e", ((Number) w.get("employee_id")).longValue(),
                    "p", w.get("percent") == null ? BigDecimal.ZERO : new BigDecimal(String.valueOf(w.get("percent")))));
        }
    }

    /** Завершённые выезды месяца — для базы метров и сдельных начислений. */
    public List<Map<String, Object>> completed(String yearMonth) {
        return jdbc.queryForList("""
            SELECT c.id, c.area, c.completed_at::date AS completed_on, c.client_name, c.address,
                   ARRAY(SELECT w.employee_id FROM onsite_cleaning_workers w WHERE w.cleaning_id = c.id) AS employee_ids
              FROM onsite_cleanings c
             WHERE c.status = 'DONE' AND c.completed_at IS NOT NULL AND c.area IS NOT NULL
               AND to_char(c.completed_at, 'YYYY-MM') = :ym
             ORDER BY c.completed_at, c.id
        """, Map.of("ym", yearMonth));
    }

    /** Метры завершённых выездов по месяцам — часть общей базы распределения затрат. */
    public Map<String, BigDecimal> metersByMonth() {
        var rows = jdbc.queryForList("""
            SELECT to_char(completed_at, 'YYYY-MM') AS ym, SUM(area) AS total
              FROM onsite_cleanings
             WHERE status = 'DONE' AND completed_at IS NOT NULL AND area IS NOT NULL
             GROUP BY 1
        """, Map.of());
        var out = new java.util.LinkedHashMap<String, BigDecimal>();
        for (var r : rows) {
            out.put(String.valueOf(r.get("ym")), new BigDecimal(String.valueOf(r.get("total"))));
        }
        return out;
    }

    private MapSqlParameterSource params(Map<String, Object> d) {
        return new MapSqlParameterSource()
                .addValue("client", d.get("client_id") == null ? null : ((Number) d.get("client_id")).longValue())
                .addValue("name", d.get("client_name"))
                .addValue("address", d.get("address"))
                .addValue("district", d.get("district"))
                .addValue("date", d.get("cleaning_date") == null ? null : LocalDate.parse(String.valueOf(d.get("cleaning_date"))))
                .addValue("area", d.get("area") == null ? null : new BigDecimal(String.valueOf(d.get("area"))))
                .addValue("price", d.get("price") == null ? BigDecimal.ZERO : new BigDecimal(String.valueOf(d.get("price"))))
                .addValue("comment", d.get("comment"))
                // V54: выезд может идти по контракту юрлица — его метры засчитываются
                // в план-факт по завершении работ.
                .addValue("contract", d.get("contract_id") == null
                        ? null : ((Number) d.get("contract_id")).longValue());
    }
}
