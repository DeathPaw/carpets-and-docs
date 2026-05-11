package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.SkuGroup;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class SkuGroupRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<SkuGroup> ROW_MAPPER = (rs, rn) -> new SkuGroup(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getInt("sort_order"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public SkuGroupRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SkuGroup> findAll() {
        return jdbc.query("SELECT id, name, sort_order, created_at, updated_at FROM sku_groups ORDER BY sort_order, name",
                Map.of(), ROW_MAPPER);
    }

    public Optional<SkuGroup> findById(Long id) {
        var list = jdbc.query("SELECT id, name, sort_order, created_at, updated_at FROM sku_groups WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
        return list.stream().findFirst();
    }

    public SkuGroup create(String name, int sortOrder) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("INSERT INTO sku_groups(name, sort_order) VALUES (:n, :s)",
                new MapSqlParameterSource().addValue("n", name).addValue("s", sortOrder),
                keyHolder, new String[]{"id"});
        return findById(keyHolder.getKey().longValue()).orElseThrow();
    }

    public SkuGroup update(Long id, String name, int sortOrder) {
        jdbc.update("UPDATE sku_groups SET name = :n, sort_order = :s, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource().addValue("id", id).addValue("n", name).addValue("s", sortOrder));
        return findById(id).orElseThrow();
    }

    public void delete(Long id) {
        // Удаление запрещено, если есть SKU в этой группе — фронт получит 409.
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM skus WHERE group_id = :id AND is_deleted = FALSE",
                Map.of("id", id), Long.class);
        if (n != null && n > 0) {
            throw new IllegalStateException("В группе есть " + n + " SKU — удалите или перенесите их");
        }
        jdbc.update("DELETE FROM sku_groups WHERE id = :id", Map.of("id", id));
    }
}
