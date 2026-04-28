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

@Repository
public class EmployeeRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<Employee> ROW_MAPPER = (rs, rowNum) -> new Employee(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("contact"),
            rs.getBoolean("active"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public EmployeeRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Employee> findAllActive() {
        return jdbc.query(
                "SELECT id, name, contact, active, created_at, updated_at FROM employees WHERE active = true ORDER BY id",
                Map.of(),
                ROW_MAPPER
        );
    }

    public List<Employee> findAll() {
        return jdbc.query(
                "SELECT id, name, contact, active, created_at, updated_at FROM employees ORDER BY id",
                Map.of(),
                ROW_MAPPER
        );
    }

    public Optional<Employee> findById(Long id) {
        List<Employee> result = jdbc.query(
                "SELECT id, name, contact, active, created_at, updated_at FROM employees WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public Employee save(String name, String contact) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("contact", contact);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO employees (name, contact, active) VALUES (:name, :contact, true)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public Employee update(Long id, String name, String contact) {
        jdbc.update(
                "UPDATE employees SET name = :name, contact = :contact, updated_at = NOW() WHERE id = :id",
                Map.of("name", name, "contact", contact, "id", id)
        );
        return findById(id).orElseThrow();
    }

    public void deactivate(Long id) {
        jdbc.update(
                "UPDATE employees SET active = false, updated_at = NOW() WHERE id = :id",
                Map.of("id", id)
        );
    }

    public void activate(Long id) {
        jdbc.update(
                "UPDATE employees SET active = true, updated_at = NOW() WHERE id = :id",
                Map.of("id", id)
        );
    }
}
