package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.AuditLogEntry;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class AuditLogRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<AuditLogEntry> ROW_MAPPER = (rs, rowNum) -> new AuditLogEntry(
            rs.getLong("id"),
            rs.getString("entity_type"),
            rs.getObject("entity_id", Long.class),
            rs.getString("action"),
            rs.getString("description"),
            rs.getTimestamp("occurred_at").toLocalDateTime()
    );

    public AuditLogRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void log(String entityType, Long entityId, String action, String description) {
        try {
            var params = new MapSqlParameterSource()
                    .addValue("entityType", entityType)
                    .addValue("entityId", entityId)
                    .addValue("action", action)
                    .addValue("description", description);
            jdbc.update(
                    "INSERT INTO audit_log (entity_type, entity_id, action, description) " +
                    "VALUES (:entityType, :entityId, :action, :description)",
                    params
            );
        } catch (Exception ignored) {
            // Логирование не должно прерывать основной поток
        }
    }

    public List<AuditLogEntry> findAll(String entityType, String action, Long entityId, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        params.put("limit", size);
        params.put("offset", (long) page * size);

        StringBuilder sql = new StringBuilder(
                "SELECT id, entity_type, entity_id, action, description, occurred_at FROM audit_log WHERE 1=1 ");

        if (entityType != null && !entityType.isEmpty()) {
            sql.append("AND entity_type = :entityType ");
            params.put("entityType", entityType);
        }
        if (action != null && !action.isEmpty()) {
            sql.append("AND action = :action ");
            params.put("action", action);
        }
        if (entityId != null) {
            sql.append("AND entity_id = :entityId ");
            params.put("entityId", entityId);
        }

        sql.append("ORDER BY id DESC LIMIT :limit OFFSET :offset");
        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }
}
