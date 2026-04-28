package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.PriceModifier;

import java.util.List;
import java.util.Map;

@Repository
public class ClientModifierRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<PriceModifier> ROW_MAPPER = (rs, rowNum) -> new PriceModifier(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getBigDecimal("percent"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ClientModifierRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PriceModifier> findByClientId(Long clientId) {
        return jdbc.query(
                "SELECT pm.* FROM client_modifiers cm JOIN price_modifiers pm ON pm.id = cm.modifier_id WHERE cm.client_id = :clientId",
                Map.of("clientId", clientId),
                ROW_MAPPER
        );
    }

    public void add(Long clientId, Long modifierId) {
        jdbc.update(
                "INSERT INTO client_modifiers (client_id, modifier_id) VALUES (:clientId, :modifierId) ON CONFLICT DO NOTHING",
                Map.of("clientId", clientId, "modifierId", modifierId)
        );
    }

    public void remove(Long clientId, Long modifierId) {
        jdbc.update(
                "DELETE FROM client_modifiers WHERE client_id = :clientId AND modifier_id = :modifierId",
                Map.of("clientId", clientId, "modifierId", modifierId)
        );
    }

    public void removeAll(Long clientId) {
        jdbc.update(
                "DELETE FROM client_modifiers WHERE client_id = :clientId",
                Map.of("clientId", clientId)
        );
    }
}
