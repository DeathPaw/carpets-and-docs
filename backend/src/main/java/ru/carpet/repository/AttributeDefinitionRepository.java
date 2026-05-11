package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.AttributeDefinition;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AttributeDefinitionRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<AttributeDefinition> ROW_MAPPER = (rs, rn) -> new AttributeDefinition(
            rs.getString("key"),
            rs.getString("label"),
            rs.getString("value_type"),
            rs.getString("unit"),
            rs.getInt("sort_order"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    public AttributeDefinitionRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AttributeDefinition> findAll() {
        return jdbc.query("SELECT key, label, value_type, unit, sort_order, created_at FROM attribute_definitions ORDER BY sort_order, key",
                Map.of(), ROW_MAPPER);
    }

    public Optional<AttributeDefinition> findByKey(String key) {
        var list = jdbc.query("SELECT key, label, value_type, unit, sort_order, created_at FROM attribute_definitions WHERE key = :k",
                Map.of("k", key), ROW_MAPPER);
        return list.stream().findFirst();
    }

    public AttributeDefinition create(String key, String label, String valueType, String unit, int sortOrder) {
        jdbc.update("INSERT INTO attribute_definitions(key, label, value_type, unit, sort_order) " +
                "VALUES (:k, :l, :vt, :u, :s)",
                Map.of("k", key, "l", label, "vt", valueType, "u", unit == null ? "" : unit, "s", sortOrder));
        return findByKey(key).orElseThrow();
    }

    public void delete(String key) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM sku_attributes WHERE attr_key = :k",
                Map.of("k", key), Long.class);
        if (n != null && n > 0) {
            throw new IllegalStateException("Атрибут используется в " + n + " SKU — удалите ссылки сперва");
        }
        jdbc.update("DELETE FROM attribute_definitions WHERE key = :k", Map.of("k", key));
    }
}
