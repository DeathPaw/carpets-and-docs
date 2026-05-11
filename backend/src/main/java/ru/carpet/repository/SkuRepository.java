package ru.carpet.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Sku;

import java.math.BigDecimal;
import java.util.*;

/**
 * Репозиторий SKU + sku_attributes + sku_versions (V10).
 *
 * <p>SKU состоит из «мастера» (skus), карты атрибутов (sku_attributes, EAV) и
 * истории версий (sku_versions). Каждое сохранение через {@link #update}
 * создаёт новую версию: старая получает valid_to, новая становится текущей.
 * Атрибуты в версии хранятся как JSONB snapshot — отдельная _attribute_versions
 * не делается, потому что версионировать M:N полноценно тяжело, а JSONB даёт
 * целостный снимок в одной строке.
 *
 * <p>Имя группы возвращаем JOIN'ом — фронт сразу видит «Чистка» вместо id=2.
 */
@Repository
public class SkuRepository {

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();

    private static final String COLS_BASE = """
        s.id, s.group_id, g.name AS group_name, s.name, s.pricing_type,
        s.price, s.cost_price, s.is_auto_add, s.free_threshold,
        s.is_active, s.is_deleted, s.current_version_id,
        s.created_at, s.updated_at
        """;

    public SkuRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<Sku> ROW_MAPPER = (rs, rn) -> new Sku(
            rs.getLong("id"),
            rs.getLong("group_id"),
            rs.getString("group_name"),
            rs.getString("name"),
            rs.getString("pricing_type"),
            rs.getBigDecimal("price"),
            rs.getBigDecimal("cost_price"),
            rs.getBoolean("is_auto_add"),
            rs.getBigDecimal("free_threshold"),
            rs.getBoolean("is_active"),
            rs.getBoolean("is_deleted"),
            rs.getObject("current_version_id", Long.class),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime(),
            // Атрибуты грузим отдельным запросом для каждого id (batchByIds ниже).
            Map.of()
    );

    public List<Sku> findAll(boolean includeDeleted) {
        String where = includeDeleted ? "" : "WHERE s.is_deleted = FALSE";
        List<Sku> list = jdbc.query(
                "SELECT " + COLS_BASE + " FROM skus s " +
                "LEFT JOIN sku_groups g ON g.id = s.group_id " + where + " " +
                "ORDER BY g.sort_order, s.id",
                Map.of(), ROW_MAPPER);
        return enrichWithAttributes(list);
    }

    public Optional<Sku> findById(Long id) {
        var list = jdbc.query(
                "SELECT " + COLS_BASE + " FROM skus s " +
                "LEFT JOIN sku_groups g ON g.id = s.group_id WHERE s.id = :id",
                Map.of("id", id), ROW_MAPPER);
        return list.isEmpty() ? Optional.empty() : Optional.of(enrichWithAttributes(list).get(0));
    }

    /** SKU с флагом is_auto_add=true. Используется при создании заказа. */
    public List<Sku> findAutoAdd() {
        List<Sku> list = jdbc.query(
                "SELECT " + COLS_BASE + " FROM skus s " +
                "LEFT JOIN sku_groups g ON g.id = s.group_id " +
                "WHERE s.is_deleted = FALSE AND s.is_active = TRUE AND s.is_auto_add = TRUE",
                Map.of(), ROW_MAPPER);
        return enrichWithAttributes(list);
    }

    /** Один запрос на все атрибуты — экономим N+1. */
    private List<Sku> enrichWithAttributes(List<Sku> skus) {
        if (skus.isEmpty()) return skus;
        var ids = skus.stream().map(Sku::id).toList();
        var rows = jdbc.queryForList(
                "SELECT sku_id, attr_key, attr_value FROM sku_attributes WHERE sku_id IN (:ids)",
                new MapSqlParameterSource("ids", ids));
        Map<Long, Map<String, List<String>>> byId = new HashMap<>();
        for (var r : rows) {
            Long sid = ((Number) r.get("sku_id")).longValue();
            String k = (String) r.get("attr_key");
            String v = (String) r.get("attr_value");
            byId.computeIfAbsent(sid, x -> new HashMap<>())
                .computeIfAbsent(k, x -> new ArrayList<>())
                .add(v);
        }
        List<Sku> out = new ArrayList<>(skus.size());
        for (var s : skus) {
            out.add(new Sku(s.id(), s.groupId(), s.groupName(), s.name(), s.pricingType(),
                    s.price(), s.costPrice(), s.isAutoAdd(), s.freeThreshold(),
                    s.isActive(), s.isDeleted(), s.currentVersionId(),
                    s.createdAt(), s.updatedAt(),
                    byId.getOrDefault(s.id(), Map.of())));
        }
        return out;
    }

    // ---------- запись ----------

    public Sku create(Long groupId, String name, String pricingType, BigDecimal price,
                      BigDecimal costPrice, boolean isAutoAdd, BigDecimal freeThreshold,
                      Map<String, List<String>> attributes, String changedBy) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO skus (group_id, name, pricing_type, price, cost_price, is_auto_add, free_threshold)
            VALUES (:g, :n, :pt, :p, :cp, :aa, :ft)
        """, new MapSqlParameterSource()
                .addValue("g",  groupId)
                .addValue("n",  name)
                .addValue("pt", pricingType)
                .addValue("p",  price)
                .addValue("cp", costPrice)
                .addValue("aa", isAutoAdd)
                .addValue("ft", freeThreshold),
            keyHolder, new String[]{"id"});
        Long skuId = keyHolder.getKey().longValue();
        saveAttributes(skuId, attributes);
        Long versionId = insertVersion(skuId, 1, groupId, name, pricingType, price, costPrice, isAutoAdd, freeThreshold, attributes, changedBy);
        jdbc.update("UPDATE skus SET current_version_id = :v WHERE id = :id",
                Map.of("v", versionId, "id", skuId));
        return findById(skuId).orElseThrow();
    }

    public Sku update(Long id, Long groupId, String name, String pricingType, BigDecimal price,
                      BigDecimal costPrice, boolean isAutoAdd, BigDecimal freeThreshold,
                      Map<String, List<String>> attributes, String changedBy) {
        // 1. Закрываем текущую версию
        jdbc.update("UPDATE sku_versions SET valid_to = NOW() WHERE master_id = :id AND valid_to IS NULL",
                Map.of("id", id));
        // 2. Новая версия
        Integer next = jdbc.queryForObject(
                "SELECT COALESCE(MAX(version_num), 0) + 1 FROM sku_versions WHERE master_id = :id",
                Map.of("id", id), Integer.class);
        Long versionId = insertVersion(id, next == null ? 1 : next, groupId, name, pricingType, price, costPrice, isAutoAdd, freeThreshold, attributes, changedBy);
        // 3. Обновляем мастер
        jdbc.update("""
            UPDATE skus SET group_id = :g, name = :n, pricing_type = :pt, price = :p,
                            cost_price = :cp, is_auto_add = :aa, free_threshold = :ft,
                            current_version_id = :v, updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("g",  groupId)
                .addValue("n",  name)
                .addValue("pt", pricingType)
                .addValue("p",  price)
                .addValue("cp", costPrice)
                .addValue("aa", isAutoAdd)
                .addValue("ft", freeThreshold)
                .addValue("v",  versionId));
        // 4. Перезаписываем атрибуты целиком (проще, чем diff)
        jdbc.update("DELETE FROM sku_attributes WHERE sku_id = :id", Map.of("id", id));
        saveAttributes(id, attributes);
        return findById(id).orElseThrow();
    }

    public void softDelete(Long id) {
        jdbc.update("UPDATE skus SET is_deleted = TRUE, is_active = FALSE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    private void saveAttributes(Long skuId, Map<String, List<String>> attributes) {
        if (attributes == null) return;
        for (var e : attributes.entrySet()) {
            for (String v : e.getValue()) {
                if (v == null || v.isBlank()) continue;
                jdbc.update(
                    "INSERT INTO sku_attributes(sku_id, attr_key, attr_value) VALUES (:s, :k, :v) ON CONFLICT DO NOTHING",
                    Map.of("s", skuId, "k", e.getKey(), "v", v.trim()));
            }
        }
    }

    private Long insertVersion(Long skuId, int versionNum, Long groupId, String name, String pricingType,
                               BigDecimal price, BigDecimal costPrice, boolean isAutoAdd,
                               BigDecimal freeThreshold, Map<String, List<String>> attributes, String changedBy) {
        // JSONB snapshot — передаём строкой с явным `::jsonb` cast, чтобы не
        // тянуть зависимость на postgres-driver PGobject в compile classpath
        // (он только runtime). Postgres сам приведёт.
        String snapJson;
        try {
            snapJson = json.writeValueAsString(attributes == null ? Map.of() : attributes);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO sku_versions(master_id, version_num, name, group_id, pricing_type,
                                     price, cost_price, is_auto_add, free_threshold,
                                     attributes_snapshot, changed_by)
            VALUES (:m, :v, :n, :g, :pt, :p, :cp, :aa, :ft, CAST(:snap AS jsonb), :cb)
        """, new MapSqlParameterSource()
                .addValue("m",  skuId)
                .addValue("v",  versionNum)
                .addValue("n",  name)
                .addValue("g",  groupId)
                .addValue("pt", pricingType)
                .addValue("p",  price)
                .addValue("cp", costPrice)
                .addValue("aa", isAutoAdd)
                .addValue("ft", freeThreshold)
                .addValue("snap", snapJson)
                .addValue("cb", changedBy),
            keyHolder, new String[]{"id"});
        return keyHolder.getKey().longValue();
    }

    /** История версий — для popover'а в UI. */
    public List<Map<String, Object>> versions(Long skuId) {
        return jdbc.queryForList("""
            SELECT id, version_num, name, group_id, pricing_type, price, cost_price,
                   is_auto_add, free_threshold, attributes_snapshot,
                   valid_from, valid_to, changed_by
              FROM sku_versions WHERE master_id = :id ORDER BY version_num DESC
        """, Map.of("id", skuId));
    }
}
