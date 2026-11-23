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
            rs.getTimestamp("updated_at").toLocalDateTime(),
            rs.getString("kind"),
            rs.getBigDecimal("amount"),
            rs.getString("promo_code"),
            rs.getBoolean("auto_assign_to_client"),
            rs.getObject("valid_from", java.time.LocalDate.class),
            rs.getObject("valid_to", java.time.LocalDate.class),
            rs.getObject("usage_limit", Integer.class),
            rs.getBoolean("is_active"),
            rs.getLong("used_count")
    );

    /** used_count — в скольких неотменённых заказах скидка уже применена. */
    private static final String SELECT = "SELECT pm.*, (SELECT COUNT(DISTINCT om.order_id) FROM order_modifiers om " +
            "JOIN orders o ON o.id = om.order_id AND o.status <> 'CANCELLED' WHERE om.modifier_id = pm.id) AS used_count " +
            "FROM price_modifiers pm ";

    /** Поля конструктора скидки (V60). */
    public record Input(String name, BigDecimal percent, String kind, BigDecimal amount, String promoCode,
                        boolean autoAssignToClient, java.time.LocalDate validFrom, java.time.LocalDate validTo,
                        Integer usageLimit, boolean active) {}

    private static MapSqlParameterSource params(Input in) {
        return new MapSqlParameterSource()
                .addValue("name", in.name())
                .addValue("percent", in.percent())
                .addValue("kind", in.kind())
                .addValue("amount", in.amount())
                .addValue("promoCode", in.promoCode())
                .addValue("autoAssign", in.autoAssignToClient())
                .addValue("validFrom", in.validFrom())
                .addValue("validTo", in.validTo())
                .addValue("usageLimit", in.usageLimit())
                .addValue("active", in.active());
    }

    public PriceModifierRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PriceModifier> findAll() {
        return jdbc.query(SELECT + "ORDER BY pm.id", ROW_MAPPER);
    }

    public Optional<PriceModifier> findById(Long id) {
        List<PriceModifier> result = jdbc.query(
                SELECT + "WHERE pm.id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    /** ПР-018: скидка по промокоду, без учёта регистра. */
    public Optional<PriceModifier> findByPromoCode(String code) {
        return jdbc.query(SELECT + "WHERE UPPER(pm.promo_code) = UPPER(:code)", Map.of("code", code), ROW_MAPPER)
                .stream().findFirst();
    }

    public PriceModifier save(Input in) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO price_modifiers (name, percent, kind, amount, promo_code, auto_assign_to_client, " +
                "valid_from, valid_to, usage_limit, is_active) VALUES (:name, :percent, :kind, :amount, :promoCode, " +
                ":autoAssign, :validFrom, :validTo, :usageLimit, :active)",
                params(in),
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public PriceModifier update(Long id, Input in) {
        jdbc.update(
                "UPDATE price_modifiers SET name = :name, percent = :percent, kind = :kind, amount = :amount, " +
                "promo_code = :promoCode, auto_assign_to_client = :autoAssign, valid_from = :validFrom, " +
                "valid_to = :validTo, usage_limit = :usageLimit, is_active = :active, updated_at = NOW() WHERE id = :id",
                params(in).addValue("id", id)
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
