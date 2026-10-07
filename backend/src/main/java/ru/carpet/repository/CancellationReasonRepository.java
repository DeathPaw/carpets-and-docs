package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.CancellationReason;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Справочник причин отмены заказа (V46, правка №3 от 13.09). */
@Repository
public class CancellationReasonRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public CancellationReasonRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final RowMapper<CancellationReason> ROW_MAPPER = (rs, rn) -> new CancellationReason(
            rs.getLong("id"),
            rs.getString("code"),
            rs.getString("name"),
            rs.getBoolean("requires_note"),
            rs.getInt("sort_order"),
            rs.getBoolean("is_active"));

    public List<CancellationReason> findAll(boolean activeOnly) {
        String where = activeOnly ? "WHERE is_active = TRUE " : "";
        return jdbc.query("SELECT id, code, name, requires_note, sort_order, is_active "
                + "FROM cancellation_reasons " + where + "ORDER BY sort_order, name", Map.of(), ROW_MAPPER);
    }

    public Optional<CancellationReason> findByCode(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        return jdbc.query("SELECT id, code, name, requires_note, sort_order, is_active "
                        + "FROM cancellation_reasons WHERE code = :code",
                Map.of("code", code), ROW_MAPPER).stream().findFirst();
    }

    public CancellationReason save(String code, String name, boolean requiresNote, int sortOrder, boolean isActive) {
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update("""
            INSERT INTO cancellation_reasons (code, name, requires_note, sort_order, is_active)
            VALUES (:code, :name, :note, :sort, :active)
        """, new MapSqlParameterSource()
                .addValue("code", code)
                .addValue("name", name)
                .addValue("note", requiresNote)
                .addValue("sort", sortOrder)
                .addValue("active", isActive), keyHolder, new String[]{"id"});
        return findById(keyHolder.getKey().longValue()).orElseThrow();
    }

    public Optional<CancellationReason> findById(Long id) {
        return jdbc.query("SELECT id, code, name, requires_note, sort_order, is_active "
                        + "FROM cancellation_reasons WHERE id = :id",
                Map.of("id", id), ROW_MAPPER).stream().findFirst();
    }

    public CancellationReason update(Long id, String name, boolean requiresNote, int sortOrder, boolean isActive) {
        jdbc.update("""
            UPDATE cancellation_reasons
               SET name = :name, requires_note = :note, sort_order = :sort,
                   is_active = :active, updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("name", name)
                .addValue("note", requiresNote)
                .addValue("sort", sortOrder)
                .addValue("active", isActive));
        return findById(id).orElseThrow();
    }

    /**
     * Причину не удаляем, а гасим: на неё уже могут ссылаться отменённые
     * заказы, и статистика прошлых периодов не должна «терять» строки.
     */
    public void deactivate(Long id) {
        jdbc.update("UPDATE cancellation_reasons SET is_active = FALSE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }
}
