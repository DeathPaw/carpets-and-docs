package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.District;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class DistrictRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<District> ROW_MAPPER = (rs, rowNum) -> new District(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getInt("sort_order"),
            rs.getBoolean("is_active"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public DistrictRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<District> findAll(boolean activeOnly) {
        String sql = activeOnly
                ? "SELECT * FROM districts WHERE is_active = TRUE ORDER BY sort_order, name"
                : "SELECT * FROM districts ORDER BY sort_order, name";
        return jdbc.query(sql, ROW_MAPPER);
    }

    public Optional<District> findById(Long id) {
        return jdbc.query("SELECT * FROM districts WHERE id = :id", Map.of("id", id), ROW_MAPPER)
                .stream().findFirst();
    }

    public Optional<District> findByName(String name) {
        return jdbc.query("SELECT * FROM districts WHERE LOWER(name) = LOWER(:name)",
                Map.of("name", name), ROW_MAPPER)
                .stream().findFirst();
    }

    public District save(String name, int sortOrder, boolean isActive) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("sortOrder", sortOrder)
                .addValue("isActive", isActive);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO districts (name, sort_order, is_active) VALUES (:name, :sortOrder, :isActive)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public District update(Long id, String name, int sortOrder, boolean isActive) {
        jdbc.update(
                "UPDATE districts SET name = :name, sort_order = :sortOrder, is_active = :isActive, updated_at = NOW() WHERE id = :id",
                Map.of("id", id, "name", name, "sortOrder", sortOrder, "isActive", isActive)
        );
        return findById(id).orElseThrow();
    }

    public void delete(Long id) {
        jdbc.update("DELETE FROM districts WHERE id = :id", Map.of("id", id));
    }
}
