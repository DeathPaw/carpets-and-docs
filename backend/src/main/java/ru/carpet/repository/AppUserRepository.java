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

    /** Активные пользователи, отвечающие за заказы — кому слать уведомления о смене статусов, новых заказах и т.п. */
    public List<AppUser> findActiveOperatorsAndAdmins() {
        return jdbc.query(
                "SELECT * FROM users WHERE is_active = TRUE AND role IN ('OPERATOR','ADMIN','SUPERVISOR') ORDER BY id",
                ROW_MAPPER);
    }

    /** Пользователь, привязанный к конкретному сотруднику — для адресных уведомлений «вам назначена услуга». */
    public Optional<AppUser> findByEmployeeId(Long employeeId) {
        if (employeeId == null) return Optional.empty();
        List<AppUser> result = jdbc.query(
                "SELECT * FROM users WHERE employee_id = :e AND is_active = TRUE LIMIT 1",
                Map.of("e", employeeId), ROW_MAPPER);
        return result.stream().findFirst();
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

    /**
     * V24: если у employee ещё нет роли, проставляем «Оператор»/«Админ» по user.role.
     * Нужно, чтобы оператор/админ появлялся в селекторе исполнителей услуги
     * «Оформление» (фильтр идёт через employee_role_item_types).
     *
     * Не затираем уже назначенную роль (например «Водитель»): если человек явно
     * назначен водителем — оператор он или нет, его роль водителя важнее.
     * Для unknown user.role или null employeeId — no-op.
     */
    public void syncEmployeeRoleFromUserRole(Long employeeId, String userRole) {
        if (employeeId == null || userRole == null) return;
        String empRoleName = switch (userRole) {
            case "OPERATOR" -> "Оператор";
            case "ADMIN", "SUPERVISOR" -> "Админ";
            default -> null;
        };
        if (empRoleName == null) return;
        jdbc.update(
                "UPDATE employees SET role_id = (SELECT id FROM employee_roles WHERE name = :rn), " +
                "updated_at = NOW() WHERE id = :id AND role_id IS NULL",
                Map.of("rn", empRoleName, "id", employeeId));
    }

    public long count() {
        Long c = jdbc.queryForObject("SELECT COUNT(*) FROM users", Map.of(), Long.class);
        return c != null ? c : 0;
    }
}
