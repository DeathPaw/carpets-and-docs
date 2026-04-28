package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.ErrorLogEntry;

import java.util.List;
import java.util.Map;

@Repository
public class ErrorLogRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<ErrorLogEntry> ROW_MAPPER = (rs, rowNum) -> new ErrorLogEntry(
            rs.getLong("id"),
            rs.getString("error_type"),
            rs.getString("message"),
            rs.getString("request_path"),
            rs.getTimestamp("occurred_at").toLocalDateTime()
    );

    public ErrorLogRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void save(String errorType, String message, String requestPath) {
        var params = new MapSqlParameterSource()
                .addValue("errorType", errorType)
                .addValue("message", message)
                .addValue("requestPath", requestPath);
        jdbc.update(
                "INSERT INTO error_log (error_type, message, request_path) VALUES (:errorType, :message, :requestPath)",
                params
        );
    }

    public List<ErrorLogEntry> findAll(int page, int size) {
        return jdbc.query(
                "SELECT id, error_type, message, request_path, occurred_at FROM error_log ORDER BY occurred_at DESC LIMIT :limit OFFSET :offset",
                Map.of("limit", size, "offset", (long) page * size),
                ROW_MAPPER
        );
    }
}
