package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.ClientEvent;

import java.util.List;
import java.util.Map;

@Repository
public class ClientEventRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<ClientEvent> ROW_MAPPER = (rs, rowNum) -> new ClientEvent(
            rs.getLong("id"),
            rs.getLong("client_id"),
            rs.getString("event_type"),
            rs.getString("description"),
            rs.getTimestamp("created_at").toLocalDateTime()
    );

    public ClientEventRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ClientEvent> findByClientId(Long clientId) {
        return jdbc.query(
                "SELECT id, client_id, event_type, description, created_at FROM client_events WHERE client_id = :clientId ORDER BY created_at DESC LIMIT 50",
                Map.of("clientId", clientId),
                ROW_MAPPER
        );
    }

    public ClientEvent save(Long clientId, String eventType, String description) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        var params = new MapSqlParameterSource()
                .addValue("clientId", clientId)
                .addValue("eventType", eventType)
                .addValue("description", description);
        jdbc.update(
                "INSERT INTO client_events (client_id, event_type, description) VALUES (:clientId, :eventType, :description)",
                params, keyHolder, new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return jdbc.queryForObject(
                "SELECT id, client_id, event_type, description, created_at FROM client_events WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
    }
}
