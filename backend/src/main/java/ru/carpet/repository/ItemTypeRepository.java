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

@Repository
public class ItemTypeRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<ItemType> ROW_MAPPER = (rs, rowNum) -> new ItemType(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getBoolean("is_default"),
            rs.getBigDecimal("default_price"),
            rs.getBigDecimal("free_threshold"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ItemTypeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ItemType> findAll() {
        return jdbc.query("SELECT id, name, is_default, default_price, free_threshold, created_at, updated_at FROM item_types WHERE is_deleted = FALSE ORDER BY id", Map.of(), ROW_MAPPER);
    }

    public Optional<ItemType> findById(Long id) {
        // findById намеренно не фильтрует по is_deleted: исторические заказы должны
        // отображать имя типа даже после soft-delete. Для форм создания используется findAll().
        List<ItemType> result = jdbc.query(
                "SELECT id, name, is_default, default_price, free_threshold, created_at, updated_at FROM item_types WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public ItemType save(String name, boolean isDefault, java.math.BigDecimal defaultPrice, java.math.BigDecimal freeThreshold) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("isDefault", isDefault)
                .addValue("defaultPrice", defaultPrice)
                .addValue("freeThreshold", freeThreshold);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO item_types (name, is_default, default_price, free_threshold) VALUES (:name, :isDefault, :defaultPrice, :freeThreshold)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public ItemType update(Long id, String name, boolean isDefault, java.math.BigDecimal defaultPrice, java.math.BigDecimal freeThreshold) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("name", name)
                .addValue("isDefault", isDefault)
                .addValue("defaultPrice", defaultPrice)
                .addValue("freeThreshold", freeThreshold);
        jdbc.update(
                "UPDATE item_types SET name = :name, is_default = :isDefault, default_price = :defaultPrice, free_threshold = :freeThreshold, updated_at = NOW() WHERE id = :id",
                params
        );
        return findById(id).orElseThrow();
    }

    /**
     * Soft-delete: помечаем тип как удалённый. Жёсткое удаление невозможно из-за FK
     * на order_items. Тип исчезает из форм создания, но остаётся виден в исторических
     * заказах через findById().
     */
    public void delete(Long id) {
        jdbc.update("UPDATE item_types SET is_deleted = TRUE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    /** Количество позиций заказов, использующих этот тип. Для проверки перед удалением. */
    public long countItemsUsing(Long id) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_items WHERE item_type_id = :id",
                Map.of("id", id), Long.class);
        return n == null ? 0 : n;
    }

    public List<ItemType> findDefaults() {
        return jdbc.query(
                "SELECT id, name, is_default, default_price, free_threshold, created_at, updated_at FROM item_types WHERE is_deleted = FALSE AND is_default = TRUE ORDER BY id",
                Map.of(),
                ROW_MAPPER
        );
    }
}
