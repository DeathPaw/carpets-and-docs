package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderModifier;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Repository
public class OrderModifierRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<OrderModifier> ROW_MAPPER = (rs, rowNum) -> new OrderModifier(
            rs.getLong("id"),
            rs.getLong("order_id"),
            rs.getLong("modifier_id"),
            rs.getString("modifier_name"),
            rs.getBigDecimal("percent"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    public OrderModifierRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<OrderModifier> findByOrderId(Long orderId) {
        return jdbc.query(
                "SELECT * FROM order_modifiers WHERE order_id = :orderId ORDER BY id",
                Map.of("orderId", orderId),
                ROW_MAPPER
        );
    }

    public OrderModifier add(Long orderId, Long modifierId, String modifierName, BigDecimal percent) {
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("modifierId", modifierId)
                .addValue("modifierName", modifierName)
                .addValue("percent", percent);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent) VALUES (:orderId, :modifierId, :modifierName, :percent)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return jdbc.query("SELECT * FROM order_modifiers WHERE id = :id", Map.of("id", id), ROW_MAPPER)
                .stream().findFirst().orElseThrow();
    }

    public void remove(Long id) {
        jdbc.update("DELETE FROM order_modifiers WHERE id = :id", Map.of("id", id));
    }

    public void removeByOrderIdAndModifierId(Long orderId, Long modifierId) {
        jdbc.update(
                "DELETE FROM order_modifiers WHERE order_id = :orderId AND modifier_id = :modifierId",
                Map.of("orderId", orderId, "modifierId", modifierId)
        );
    }

    public void copyFromClient(Long clientId, Long orderId) {
        jdbc.update(
                "INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent) " +
                "SELECT :orderId, pm.id, pm.name, pm.percent FROM client_modifiers cm " +
                "JOIN price_modifiers pm ON pm.id = cm.modifier_id WHERE cm.client_id = :clientId",
                Map.of("clientId", clientId, "orderId", orderId)
        );
    }
}
