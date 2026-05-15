package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.AppUser;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class AppUserRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<AppUser> ROW_MAPPER = (rs, n) -> new AppUser(
            rs.getLong("id"),
            rs.getString("username"),
            rs.getString("password_hash"),
            rs.getString("display_name"),
            rs.getString("role"),
            rs.getObject("employee_id", Long.class),
            rs.getBoolean("is_active"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public AppUserRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<AppUser> findByUsername(String username) {
        List<AppUser> result = jdbc.query(
                "SELECT * FROM users WHERE username = :u AND is_active = TRUE",
                Map.of("u", username), ROW_MAPPER);
        return result.stream().findFirst();
    }

    public Optional<AppUser> findById(Long id) {
        List<AppUser> result = jdbc.query(
                "SELECT * FROM users WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
        return result.stream().findFirst();
    }

    public List<AppUser> findAll() {
        return jdbc.query("SELECT * FROM users ORDER BY id", ROW_MAPPER);
    }

    public AppUser create(String username, String passwordHash, String displayName,
                          String role, Long employeeId) {
        var params = new MapSqlParameterSource()
                .addValue("u", username)
                .addValue("p", passwordHash)
                .addValue("d", displayName)
                .addValue("r", role)
                .addValue("e", employeeId);
        var kh = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO users (username, password_hash, display_name, role, employee_id) " +
                "VALUES (:u, :p, :d, :r, :e)",
                params, kh, new String[]{"id"});
        return findById(kh.getKey().longValue()).orElseThrow();
    }

    public AppUser update(Long id, String displayName, String role, Long employeeId, boolean isActive) {
        var params = new MapSqlParameterSource()
                .addValue("d", displayName)
                .addValue("r", role)
                .addValue("e", employeeId)  // null → SQL NULL
                .addValue("a", isActive)
                .addValue("id", id);
        jdbc.update(
                "UPDATE users SET display_name = :d, role = :r, employee_id = :e, " +
                "is_active = :a, updated_at = NOW() WHERE id = :id",
                params);
        return findById(id).orElseThrow();
    }

    public void updatePassword(Long id, String passwordHash) {
        jdbc.update("UPDATE users SET password_hash = :p, updated_at = NOW() WHERE id = :id",
                Map.of("p", passwordHash, "id", id));
    }

    public long count() {
        Long c = jdbc.queryForObject("SELECT COUNT(*) FROM users", Map.of(), Long.class);
        return c != null ? c : 0;
    }
}
