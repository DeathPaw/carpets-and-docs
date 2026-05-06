package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.ServiceDefinition;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ServiceDefinitionRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<ServiceDefinition> ROW_MAPPER = (rs, rowNum) -> new ServiceDefinition(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getBigDecimal("base_price"),
            ru.carpet.model.PricingType.valueOf(rs.getString("pricing_type")),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ServiceDefinitionRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ServiceDefinition> findAll() {
        return jdbc.query(
                "SELECT id, name, base_price, pricing_type, created_at, updated_at FROM service_definitions " +
                "WHERE is_deleted = FALSE ORDER BY id",
                Map.of(),
                ROW_MAPPER
        );
    }

    /** findById не фильтрует по is_deleted — нужно для отображения исторических услуг в старых заказах. */
    public Optional<ServiceDefinition> findById(Long id) {
        List<ServiceDefinition> result = jdbc.query(
                "SELECT id, name, base_price, pricing_type, created_at, updated_at FROM service_definitions WHERE id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public ServiceDefinition save(String name, java.math.BigDecimal basePrice, ru.carpet.model.PricingType pricingType) {
        var params = new MapSqlParameterSource()
                .addValue("name", name)
                .addValue("basePrice", basePrice)
                .addValue("pricingType", pricingType.name());
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO service_definitions (name, base_price, pricing_type) VALUES (:name, :basePrice, :pricingType)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public ServiceDefinition update(Long id, String name, java.math.BigDecimal basePrice, ru.carpet.model.PricingType pricingType) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("name", name)
                .addValue("basePrice", basePrice)
                .addValue("pricingType", pricingType.name());
        jdbc.update(
                "UPDATE service_definitions SET name = :name, base_price = :basePrice, pricing_type = :pricingType, updated_at = NOW() WHERE id = :id",
                params
        );
        return findById(id).orElseThrow();
    }

    /** Soft-delete: помечаем услугу удалённой, исторические записи order_item_services сохраняются. */
    public void delete(Long id) {
        jdbc.update("UPDATE service_definitions SET is_deleted = TRUE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id));
    }

    /** Сколько услуг в реальных заказах используют это определение. */
    public long countServicesUsing(Long id) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_item_services WHERE service_def_id = :id",
                Map.of("id", id), Long.class);
        return n == null ? 0 : n;
    }
}
