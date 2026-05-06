package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.EmployeeRole;

import java.util.*;

@Repository
public class EmployeeRoleRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public EmployeeRoleRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<RawRole> RAW_MAPPER = (rs, n) -> new RawRole(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("description"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    /** Промежуточный record — без itemTypeIds, чтобы упростить чтение. */
    private record RawRole(Long id, String name, String description,
                           java.time.LocalDateTime createdAt, java.time.LocalDateTime updatedAt) {}

    public List<EmployeeRole> findAll() {
        List<RawRole> raw = jdbc.query(
                "SELECT id, name, description, created_at, updated_at FROM employee_roles ORDER BY name",
                Map.of(), RAW_MAPPER);
        if (raw.isEmpty()) return List.of();
        // Подгружаем привязки одним запросом, раскладываем в Map<roleId, List<itemTypeId>>.
        Map<Long, List<Long>> typesByRole = loadItemTypeIdsForRoles(raw.stream().map(RawRole::id).toList());
        return raw.stream().map(r -> new EmployeeRole(
                r.id(), r.name(), r.description(),
                typesByRole.getOrDefault(r.id(), List.of()),
                r.createdAt(), r.updatedAt()
        )).toList();
    }

    public Optional<EmployeeRole> findById(Long id) {
        List<RawRole> raw = jdbc.query(
                "SELECT id, name, description, created_at, updated_at FROM employee_roles WHERE id = :id",
                Map.of("id", id), RAW_MAPPER);
        if (raw.isEmpty()) return Optional.empty();
        RawRole r = raw.get(0);
        List<Long> typeIds = loadItemTypeIdsForRoles(List.of(id)).getOrDefault(id, List.of());
        return Optional.of(new EmployeeRole(r.id(), r.name(), r.description(), typeIds, r.createdAt(), r.updatedAt()));
    }

    private Map<Long, List<Long>> loadItemTypeIdsForRoles(Collection<Long> roleIds) {
        if (roleIds.isEmpty()) return Map.of();
        Map<Long, List<Long>> result = new HashMap<>();
        jdbc.query(
                "SELECT role_id, item_type_id FROM employee_role_item_types WHERE role_id IN (:ids)",
                new MapSqlParameterSource("ids", roleIds),
                rs -> {
                    long rId = rs.getLong("role_id");
                    long tId = rs.getLong("item_type_id");
                    result.computeIfAbsent(rId, k -> new ArrayList<>()).add(tId);
                });
        return result;
    }

    public EmployeeRole save(String name, String description, List<Long> itemTypeIds) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO employee_roles (name, description) VALUES (:name, :description)",
                new MapSqlParameterSource()
                        .addValue("name", name)
                        .addValue("description", description),
                keyHolder, new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        replaceItemTypes(id, itemTypeIds);
        return findById(id).orElseThrow();
    }

    public EmployeeRole update(Long id, String name, String description, List<Long> itemTypeIds) {
        jdbc.update(
                "UPDATE employee_roles SET name = :name, description = :description, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource()
                        .addValue("id", id).addValue("name", name).addValue("description", description));
        replaceItemTypes(id, itemTypeIds);
        return findById(id).orElseThrow();
    }

    public void delete(Long id) {
        // FK на employees: ON DELETE SET NULL — сотрудники просто потеряют роль.
        jdbc.update("DELETE FROM employee_roles WHERE id = :id", Map.of("id", id));
    }

    /** Полностью переписывает список типов для роли: удаляем старые, вставляем новые. */
    private void replaceItemTypes(Long roleId, List<Long> itemTypeIds) {
        jdbc.update("DELETE FROM employee_role_item_types WHERE role_id = :id",
                Map.of("id", roleId));
        if (itemTypeIds == null || itemTypeIds.isEmpty()) return;
        for (Long typeId : itemTypeIds) {
            jdbc.update(
                    "INSERT INTO employee_role_item_types (role_id, item_type_id) VALUES (:r, :t) ON CONFLICT DO NOTHING",
                    Map.of("r", roleId, "t", typeId));
        }
    }

    /**
     * Сколько сотрудников привязаны к роли (для UI «Используется в N сотрудниках»).
     */
    public long countEmployeesUsing(Long roleId) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM employees WHERE role_id = :id",
                Map.of("id", roleId), Long.class);
        return n == null ? 0 : n;
    }
}
