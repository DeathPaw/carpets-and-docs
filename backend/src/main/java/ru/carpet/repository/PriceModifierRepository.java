package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.PriceModifier;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class PriceModifierRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<PriceModifier> ROW_MAPPER = (rs, rowNum) -> new PriceModifier(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getBigDecimal("percent"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public PriceModifierRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PriceModifier> findAll() {
        return jdbc.query("SELECT * FROM price_modifiers ORDER BY id", ROW_MAPPER);
    }

    public Optional<PriceModifier> findById(Long id) {
        List<PriceModifier> result = jdbc.query(
                "SELECT * FROM price_modifiers WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public PriceModifier save(String name, BigDecimal percent) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("percent", percent);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO price_modifiers (name, percent) VALUES (:name, :percent)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public PriceModifier update(Long id, String name, BigDecimal percent) {
        jdbc.update(
                "UPDATE price_modifiers SET name = :name, percent = :percent, updated_at = NOW() WHERE id = :id",
                Map.of("id", id, "name", name, "percent", percent)
        );
        return findById(id).orElseThrow();
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM price_modifiers WHERE id = :id", Map.of("id", id));
    }

    /** Сколько раз модификатор используется в заказах и у клиентов. */
    public long countUsages(Long id) {
        Long inOrders = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_modifiers WHERE modifier_id = :id",
                Map.of("id", id), Long.class);
        Long inClients = jdbc.queryForObject(
                "SELECT COUNT(*) FROM client_modifiers WHERE modifier_id = :id",
                Map.of("id", id), Long.class);
        return (inOrders == null ? 0 : inOrders) + (inClients == null ? 0 : inClients);
    }
}
