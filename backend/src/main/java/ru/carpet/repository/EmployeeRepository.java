package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Employee;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Repository
public class EmployeeRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final String COLS = "id, name, contact, active, role_id, created_at, updated_at";

    private static final RowMapper<Employee> ROW_MAPPER = (rs, rowNum) -> {
        Long roleId = rs.getObject("role_id", Long.class);
        return new Employee(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("contact"),
                rs.getBoolean("active"),
                roleId,
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime()
        );
    };

    public EmployeeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Employee> findAllActive() {
        return jdbc.query(
                "SELECT " + COLS + " FROM employees WHERE active = true ORDER BY id",
                Map.of(), ROW_MAPPER);
    }

    public List<Employee> findAll() {
        return jdbc.query(
                "SELECT " + COLS + " FROM employees ORDER BY id",
                Map.of(), ROW_MAPPER);
    }

    public Map<Long, Employee> findByIds(List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        var params = new MapSqlParameterSource("ids", ids);
        List<Employee> employees = jdbc.query(
            "SELECT " + COLS + " FROM employees WHERE id IN (:ids)",
            params, ROW_MAPPER);
        return employees.stream().collect(Collectors.toMap(Employee::id, e -> e));
    }

    public Optional<Employee> findById(Long id) {
        List<Employee> result = jdbc.query(
                "SELECT " + COLS + " FROM employees WHERE id = :id",
                Map.of("id", id), ROW_MAPPER);
        return result.stream().findFirst();
    }

    public Employee save(String name, String contact, Long roleId) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("contact", contact)
                .addValue("roleId", roleId);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO employees (name, contact, active, role_id) VALUES (:name, :contact, true, :roleId)",
                params, keyHolder, new String[]{"id"});
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public Employee update(Long id, String name, String contact, Long roleId) {
        jdbc.update(
                "UPDATE employees SET name = :name, contact = :contact, role_id = :roleId, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource()
                        .addValue("id", id).addValue("name", name)
                        .addValue("contact", contact).addValue("roleId", roleId));
        return findById(id).orElseThrow();
    }

    public void deactivate(Long id) {
        jdbc.update(
                "UPDATE employees SET active = false, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    public void activate(Long id) {
        jdbc.update(
                "UPDATE employees SET active = true, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    /**
     * Сотрудники, чья роль включает указанный тип позиции.
     * Сотрудники без роли (role_id IS NULL) считаются «универсалами» и тоже возвращаются —
     * иначе при добавлении нового типа позиции у них нельзя было бы делать услуги.
     */
    public List<Employee> findActiveSuitableForItemType(Long itemTypeId) {
        return jdbc.query(
                "SELECT " + COLS + " FROM employees e " +
                "WHERE e.active = TRUE AND (" +
                "  e.role_id IS NULL OR " +
                "  EXISTS (SELECT 1 FROM employee_role_item_types rt " +
                "          WHERE rt.role_id = e.role_id AND rt.item_type_id = :tid)" +
                ") ORDER BY e.id",
                Map.of("tid", itemTypeId), ROW_MAPPER);
    }
}
