package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.ItemType;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Типы вещей клиента (V10) — теперь без default-логики, только name.
 */
@Repository
public class ItemTypeRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<ItemType> ROW_MAPPER = (rs, rn) -> new ItemType(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ItemTypeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ItemType> findAll() {
        return jdbc.query(
                "SELECT id, name, created_at, updated_at FROM item_types WHERE is_deleted = FALSE ORDER BY id",
                Map.of(), ROW_MAPPER);
    }

    public Optional<ItemType> findById(Long id) {
        var list = jdbc.query(
                "SELECT id, name, created_at, updated_at FROM item_types WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
        return list.stream().findFirst();
    }

    public ItemType save(String name) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("INSERT INTO item_types(name) VALUES (:n)",
                new MapSqlParameterSource("n", name), keyHolder, new String[]{"id"});
        return findById(keyHolder.getKey().longValue()).orElseThrow();
    }

    public ItemType update(Long id, String name) {
        jdbc.update("UPDATE item_types SET name = :n, updated_at = NOW() WHERE id = :id",
                Map.of("id", id, "n", name));
        return findById(id).orElseThrow();
    }

    public void delete(Long id) {
        jdbc.update("UPDATE item_types SET is_deleted = TRUE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    public long countItemsUsing(Long id) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_items WHERE item_type_id = :id",
                Map.of("id", id), Long.class);
        return n == null ? 0 : n;
    }
}
