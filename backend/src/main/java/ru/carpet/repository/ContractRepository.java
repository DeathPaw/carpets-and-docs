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
 * Контракты юрлиц и их план-факт (ТЗ v2, блок 6).
 *
 * <p>Факт считается по сдаче: пока ковёр не сдан заказчику, его метры в
 * контрактный объём не идут, даже если работа уже сделана.
 */
@Repository
public class ContractRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ContractRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT_COLS = """
        c.id, c.client_id, cl.name AS client_name, cl.inn AS client_inn,
        c.number, c.kind, c.signed_on::text AS signed_on, c.expires_on::text AS expires_on,
        c.planned_sqm, c.price_per_sqm,
        c.comment, c.is_active, c.created_by, c.created_at,
        (SELECT COUNT(*) FROM contract_files f WHERE f.contract_id = c.id) AS files_count
        """;

    public List<Map<String, Object>> findAll(Long clientId, Boolean activeOnly) {
        var params = new MapSqlParameterSource().addValue("client", clientId);
        StringBuilder sql = new StringBuilder("SELECT " + SELECT_COLS
                + " FROM contracts c JOIN clients cl ON cl.id = c.client_id WHERE 1=1 ");
        if (clientId != null) sql.append(" AND c.client_id = :client ");
        if (Boolean.TRUE.equals(activeOnly)) sql.append(" AND c.is_active = TRUE ");
        sql.append(" ORDER BY c.signed_on DESC, c.id DESC");
        return jdbc.queryForList(sql.toString(), params);
    }

    public Optional<Map<String, Object>> findById(Long id) {
        return jdbc.queryForList("SELECT " + SELECT_COLS
                        + " FROM contracts c JOIN clients cl ON cl.id = c.client_id WHERE c.id = :id",
                Map.of("id", id)).stream().findFirst();
    }

    public Long save(Map<String, Object> d, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO contracts
                (client_id, number, kind, signed_on, expires_on, planned_sqm, price_per_sqm, comment, created_by)
            VALUES (:client, :number, :kind, :signed, :expires, :planned, :price, :comment, :by)
        """, params(d).addValue("by", createdBy), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void update(Long id, Map<String, Object> d) {
        jdbc.update("""
            UPDATE contracts
               SET client_id = :client, number = :number, kind = :kind, signed_on = :signed,
                   expires_on = :expires, planned_sqm = :planned, price_per_sqm = :price,
                   comment = :comment, is_active = COALESCE(:active, is_active), updated_at = NOW()
             WHERE id = :id
        """, params(d).addValue("id", id)
                .addValue("active", d.get("is_active") == null ? null : Boolean.valueOf(String.valueOf(d.get("is_active")))));
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM contracts WHERE id = :id", Map.of("id", id));
    }

    private MapSqlParameterSource params(Map<String, Object> d) {
        return new MapSqlParameterSource()
                .addValue("client", ((Number) d.get("client_id")).longValue())
                .addValue("number", d.get("number"))
                .addValue("kind", d.getOrDefault("kind", "COMMERCIAL"))
                .addValue("signed", LocalDate.parse(String.valueOf(d.get("signed_on"))))
                .addValue("expires", d.get("expires_on") == null
                        ? null : LocalDate.parse(String.valueOf(d.get("expires_on"))))
                .addValue("planned", d.get("planned_sqm") == null
                        ? null : new BigDecimal(String.valueOf(d.get("planned_sqm"))))
                .addValue("price", new BigDecimal(String.valueOf(d.get("price_per_sqm"))))
                .addValue("comment", d.get("comment"));
    }

    // ---------------- файлы ----------------

    public Long addFile(Long contractId, String filename, String contentType, String data) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO contract_files (contract_id, filename, content_type, data)
            VALUES (:c, :f, :ct, :d)
        """, new MapSqlParameterSource().addValue("c", contractId).addValue("f", filename)
                .addValue("ct", contentType).addValue("d", data), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public List<Map<String, Object>> files(Long contractId) {
        return jdbc.queryForList(
                "SELECT id, filename, content_type, created_at FROM contract_files "
                        + "WHERE contract_id = :id ORDER BY id", Map.of("id", contractId));
    }

    public Optional<Map<String, Object>> file(Long contractId, Long fileId) {
        return jdbc.queryForList("SELECT filename, content_type, data FROM contract_files "
                        + "WHERE id = :f AND contract_id = :c",
                Map.of("f", fileId, "c", contractId)).stream().findFirst();
    }

    public void deleteFile(Long contractId, Long fileId) {
        jdbc.update("DELETE FROM contract_files WHERE id = :f AND contract_id = :c",
                Map.of("f", fileId, "c", contractId));
    }

    // ---------------- связь с работой ----------------

    /** Привязка заказа к контракту с фиксацией договорной цены за метр. */
    public void linkOrder(Long orderId, Long contractId, BigDecimal pricePerSqm) {
        jdbc.update("""
            UPDATE orders SET contract_id = :contract, contract_price_per_sqm = :price, updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("contract", contractId).addValue("price", pricePerSqm).addValue("id", orderId));
    }

    public void setOrderDelivered(Long orderId, boolean delivered) {
        jdbc.update("""
            UPDATE orders
               SET contract_delivered_at = CASE WHEN :delivered THEN COALESCE(contract_delivered_at, NOW()) ELSE NULL END,
                   updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource().addValue("delivered", delivered).addValue("id", orderId));
    }

    public void logDelivery(Long contractId, Long orderId, Long cleaningId, BigDecimal sqm,
                            String action, String reason, String by) {
        jdbc.update("""
            INSERT INTO contract_deliveries (contract_id, order_id, cleaning_id, sqm, action, reason, created_by)
            VALUES (:contract, :order, :cleaning, :sqm, :action, :reason, :by)
        """, new MapSqlParameterSource()
                .addValue("contract", contractId).addValue("order", orderId).addValue("cleaning", cleaningId)
                .addValue("sqm", sqm).addValue("action", action).addValue("reason", reason).addValue("by", by));
    }

    public List<Map<String, Object>> deliveries(Long contractId) {
        return jdbc.queryForList("""
            SELECT d.id, d.order_id, d.cleaning_id, d.sqm, d.action, d.reason, d.created_by, d.created_at
              FROM contract_deliveries d WHERE d.contract_id = :id
             ORDER BY d.created_at DESC, d.id DESC
        """, Map.of("id", contractId));
    }

    /** Метры заказа — сумма площадей его непогашенных позиций. */
    public BigDecimal orderSqm(Long orderId) {
        BigDecimal v = jdbc.queryForObject("""
            SELECT COALESCE(SUM(area), 0) FROM order_items
             WHERE order_id = :id AND status <> 'CANCELLED' AND area IS NOT NULL
        """, Map.of("id", orderId), BigDecimal.class);
        return v == null ? BigDecimal.ZERO : v;
    }

    /**
     * План-факт по контракту. Факт — только сданное: заказы с отметкой сдачи и
     * завершённые выездные чистки.
     */
    public Map<String, Object> planFact(Long contractId) {
        return jdbc.queryForMap("""
            SELECT
                c.planned_sqm,
                c.price_per_sqm,
                COALESCE((SELECT SUM(oi.area) FROM orders o
                            JOIN order_items oi ON oi.order_id = o.id
                           WHERE o.contract_id = c.id AND o.contract_delivered_at IS NOT NULL
                             AND oi.status <> 'CANCELLED' AND oi.area IS NOT NULL), 0) AS orders_sqm,
                COALESCE((SELECT SUM(cl.area) FROM onsite_cleanings cl
                           WHERE cl.contract_id = c.id AND cl.status = 'DONE' AND cl.area IS NOT NULL), 0) AS onsite_sqm
              FROM contracts c WHERE c.id = :id
        """, Map.of("id", contractId));
    }

    /** Заказы и выезды контракта — из плана-факта можно открыть исходные работы. */
    public List<Map<String, Object>> works(Long contractId) {
        return jdbc.queryForList("""
            SELECT 'ORDER' AS kind, o.id, o.client_name, o.created_at::date::text AS work_date,
                   o.contract_delivered_at IS NOT NULL AS counted,
                   COALESCE((SELECT SUM(oi.area) FROM order_items oi
                              WHERE oi.order_id = o.id AND oi.status <> 'CANCELLED' AND oi.area IS NOT NULL), 0) AS sqm
              FROM orders o WHERE o.contract_id = :id
             UNION ALL
            SELECT 'ONSITE', cl.id, cl.client_name, cl.cleaning_date::text,
                   cl.status = 'DONE' AS counted, COALESCE(cl.area, 0)
              FROM onsite_cleanings cl WHERE cl.contract_id = :id
             ORDER BY work_date DESC
        """, Map.of("id", contractId));
    }
}
