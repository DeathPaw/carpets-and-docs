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
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getString("kind"),
            rs.getBigDecimal("amount"),
            rs.getString("promo_code"),
            rs.getBigDecimal("discount_amount")
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

    /** Применить скидку к заказу — снимком её текущих настроек (V60). */
    public OrderModifier add(Long orderId, ru.carpet.model.PriceModifier pm) {
        return add(orderId, pm.id(), pm.name(), pm.percent(), pm.kind(), pm.amount(), pm.promoCode());
    }

    public OrderModifier add(Long orderId, Long modifierId, String modifierName, BigDecimal percent,
                             String kind, BigDecimal amount, String promoCode) {
        var params = new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("modifierId", modifierId)
                .addValue("modifierName", modifierName)
                .addValue("percent", percent == null ? BigDecimal.ZERO : percent)
                .addValue("kind", kind == null ? "PERCENT" : kind)
                .addValue("amount", amount)
                .addValue("promoCode", promoCode);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent, kind, amount, promo_code) " +
                "VALUES (:orderId, :modifierId, :modifierName, :percent, :kind, :amount, :promoCode)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return jdbc.query("SELECT * FROM order_modifiers WHERE id = :id", Map.of("id", id), ROW_MAPPER)
                .stream().findFirst().orElseThrow();
    }

    /** V60: фактический эффект скидки в рублях — пишется при пересчёте итога. */
    public void updateDiscountAmount(Long id, BigDecimal amount) {
        jdbc.update("UPDATE order_modifiers SET discount_amount = :a WHERE id = :id",
                new MapSqlParameterSource().addValue("a", amount).addValue("id", id));
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
                "INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent, kind, amount, promo_code) " +
                "SELECT :orderId, pm.id, pm.name, pm.percent, pm.kind, pm.amount, pm.promo_code FROM client_modifiers cm " +
                "JOIN price_modifiers pm ON pm.id = cm.modifier_id WHERE cm.client_id = :clientId AND pm.is_active",
                Map.of("clientId", clientId, "orderId", orderId)
        );
    }
}
