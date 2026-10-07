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
 * Доступ к данным для Excel-обмена (ТЗ v2, блок 8).
 *
 * <p>Запись идентифицируется только по внешнему ID — по названию ничего не
 * подбирается. Ничего не удаляем: отсутствие строки в файле означает «не
 * трогать», а не «удалить».
 */
@Repository
public class ImportRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ImportRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------- поиск по внешним ID ----------------

    public Map<String, Long> clientIdsByExternal(List<String> externalIds) {
        if (externalIds.isEmpty()) return new java.util.LinkedHashMap<>();
        var rows = jdbc.queryForList(
                "SELECT external_id, id FROM clients WHERE external_id IN (:ids)",
                Map.of("ids", externalIds));
        var out = new java.util.LinkedHashMap<String, Long>();
        rows.forEach(r -> out.put(String.valueOf(r.get("external_id")), ((Number) r.get("id")).longValue()));
        return out;
    }

    public Map<String, Long> contractIdsByExternal(List<String> externalIds) {
        if (externalIds.isEmpty()) return new java.util.LinkedHashMap<>();
        var rows = jdbc.queryForList(
                "SELECT external_id, id FROM contracts WHERE external_id IN (:ids)",
                Map.of("ids", externalIds));
        var out = new java.util.LinkedHashMap<String, Long>();
        rows.forEach(r -> out.put(String.valueOf(r.get("external_id")), ((Number) r.get("id")).longValue()));
        return out;
    }

    public Map<String, Long> orderIdsByExternal(List<String> externalIds) {
        if (externalIds.isEmpty()) return new java.util.LinkedHashMap<>();
        var rows = jdbc.queryForList(
                "SELECT external_id, id FROM orders WHERE external_id IN (:ids)",
                Map.of("ids", externalIds));
        var out = new java.util.LinkedHashMap<String, Long>();
        rows.forEach(r -> out.put(String.valueOf(r.get("external_id")), ((Number) r.get("id")).longValue()));
        return out;
    }

    /** Типы изделий по точному названию — подбор «похожего» запрещён. */
    public Map<String, Long> itemTypeIdsByName() {
        var rows = jdbc.queryForList("SELECT id, name FROM item_types", Map.of());
        var out = new java.util.LinkedHashMap<String, Long>();
        rows.forEach(r -> out.put(String.valueOf(r.get("name")), ((Number) r.get("id")).longValue()));
        return out;
    }

    /** Действующие услуги каталога по названию последней версии. */
    public Map<String, Long> skuIdsByName() {
        var rows = jdbc.queryForList("""
            SELECT s.id, v.name
              FROM skus s
              JOIN sku_versions v ON v.master_id = s.id AND v.valid_to IS NULL
             WHERE s.is_active
        """, Map.of());
        var out = new java.util.LinkedHashMap<String, Long>();
        rows.forEach(r -> out.put(String.valueOf(r.get("name")), ((Number) r.get("id")).longValue()));
        return out;
    }

    // ---------------- юрлица ----------------

    public Long insertLegalEntity(Map<String, Object> d) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO clients (client_type, name, inn, kpp, address, phone, email,
                                 contact_person, contact_person_phone, comment, external_id)
            VALUES ('LEGAL_ENTITY', :name, :inn, :kpp, :address, :phone, :email,
                    :contact, :contactPhone, :comment, :ext)
        """, legalParams(d), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void updateLegalEntity(Long id, Map<String, Object> d) {
        jdbc.update("""
            UPDATE clients
               SET name = :name, inn = :inn, kpp = :kpp, address = :address, phone = :phone,
                   email = :email, contact_person = :contact, contact_person_phone = :contactPhone,
                   comment = COALESCE(:comment, comment), updated_at = NOW()
             WHERE id = :id
        """, legalParams(d).addValue("id", id));
    }

    private MapSqlParameterSource legalParams(Map<String, Object> d) {
        return new MapSqlParameterSource()
                .addValue("name", str(d.get("name")))
                .addValue("inn", str(d.get("inn")))
                .addValue("kpp", str(d.get("kpp")))
                .addValue("address", str(d.get("address")))
                .addValue("phone", str(d.get("phone")))
                .addValue("email", str(d.get("email")))
                .addValue("contact", str(d.get("contact_person")))
                .addValue("contactPhone", str(d.get("contact_person_phone")))
                .addValue("comment", str(d.get("comment")))
                .addValue("ext", str(d.get("external_id")));
    }

    // ---------------- контракты ----------------

    public Long insertContract(Map<String, Object> d, Long clientId, String createdBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO contracts (client_id, number, kind, signed_on, expires_on, planned_sqm,
                                   price_per_sqm, comment, external_id, created_by)
            VALUES (:client, :number, :kind, :signed, :expires, :planned, :price, :comment, :ext, :by)
        """, contractParams(d).addValue("client", clientId).addValue("by", createdBy),
                keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void updateContract(Long id, Map<String, Object> d, Long clientId) {
        jdbc.update("""
            UPDATE contracts
               SET client_id = :client, number = :number, kind = :kind, signed_on = :signed,
                   expires_on = :expires, planned_sqm = :planned, price_per_sqm = :price,
                   comment = COALESCE(:comment, comment), updated_at = NOW()
             WHERE id = :id
        """, contractParams(d).addValue("client", clientId).addValue("id", id));
    }

    private MapSqlParameterSource contractParams(Map<String, Object> d) {
        return new MapSqlParameterSource()
                .addValue("number", str(d.get("number")))
                .addValue("kind", str(d.get("kind")))
                .addValue("signed", date(d.get("signed_on")))
                .addValue("expires", date(d.get("expires_on")))
                .addValue("planned", decimal(d.get("planned_sqm")))
                .addValue("price", decimal(d.get("price_per_sqm")))
                .addValue("comment", str(d.get("comment")))
                .addValue("ext", str(d.get("external_id")));
    }

    // ---------------- заказы ----------------

    public Long insertPrivateClient(Map<String, Object> d) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO clients (client_type, name, phone, address, external_id)
            VALUES ('INDIVIDUAL', :name, :phone, :address, :ext)
        """, new MapSqlParameterSource()
                .addValue("name", str(d.get("client_name")))
                .addValue("phone", str(d.get("client_phone")))
                .addValue("address", str(d.get("client_address")))
                .addValue("ext", str(d.get("client_external_id"))),
                keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public void setOrderExternalId(Long orderId, String externalId) {
        jdbc.update("UPDATE orders SET external_id = :ext, updated_at = NOW() WHERE id = :id",
                Map.of("ext", externalId, "id", orderId));
    }

    /** Дата оформления из файла: заказ переносится вместе со своей датой. */
    public void setOrderDate(Long orderId, LocalDate date) {
        jdbc.update("""
            UPDATE orders
               SET created_at = :ts, price_date = :date, updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("ts", java.sql.Timestamp.valueOf(date.atStartOfDay()))
                .addValue("date", date).addValue("id", orderId));
    }

    public void updateOrderHeader(Long orderId, Map<String, Object> d) {
        jdbc.update("""
            UPDATE orders
               SET comment = COALESCE(:comment, comment),
                   pickup_address = COALESCE(:pickup, pickup_address),
                   updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("comment", str(d.get("comment")))
                .addValue("pickup", str(d.get("pickup_address")))
                .addValue("id", orderId));
    }

    // ---------------- журнал загрузок ----------------

    public Long logBatch(String kind, String version, String filename, String updateMode,
                         int created, int updated, int skipped, String by) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO import_batches (kind, template_version, filename, update_mode,
                                        created_count, updated_count, skipped_count, created_by)
            VALUES (:kind, :version, :filename, :mode, :created, :updated, :skipped, :by)
        """, new MapSqlParameterSource()
                .addValue("kind", kind).addValue("version", version).addValue("filename", filename)
                .addValue("mode", updateMode).addValue("created", created).addValue("updated", updated)
                .addValue("skipped", skipped).addValue("by", by), keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    public List<Map<String, Object>> batches(int limit) {
        return jdbc.queryForList("""
            SELECT id, kind, template_version, filename, update_mode,
                   created_count, updated_count, skipped_count, created_by, created_at
              FROM import_batches ORDER BY created_at DESC, id DESC LIMIT :limit
        """, Map.of("limit", limit));
    }

    public Optional<Map<String, Object>> clientById(Long id) {
        return jdbc.queryForList("SELECT id, name, client_type FROM clients WHERE id = :id",
                Map.of("id", id)).stream().findFirst();
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static LocalDate date(Object v) {
        String s = str(v);
        return s == null ? null : LocalDate.parse(s);
    }

    private static BigDecimal decimal(Object v) {
        String s = str(v);
        return s == null ? null : new BigDecimal(s.replace(',', '.').replace(" ", ""));
    }
}
