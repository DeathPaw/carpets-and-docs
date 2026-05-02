package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.PriceListEntry;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class PriceListRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<PriceListEntry> ROW_MAPPER = (rs, rowNum) -> new PriceListEntry(
            rs.getLong("id"),
            rs.getLong("item_type_id"),
            rs.getLong("service_def_id"),
            rs.getBigDecimal("price"),
            rs.getBigDecimal("cost_price"),
            rs.getBoolean("is_active"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public PriceListRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<PriceListEntry> findAll() {
        return jdbc.query(
                "SELECT id, item_type_id, service_def_id, price, cost_price, is_active, created_at, updated_at FROM price_list ORDER BY item_type_id, service_def_id",
                Map.of(),
                ROW_MAPPER
        );
    }

    public List<PriceListEntry> findByItemTypeId(Long itemTypeId) {
        return jdbc.query(
                "SELECT id, item_type_id, service_def_id, price, cost_price, is_active, created_at, updated_at FROM price_list WHERE item_type_id = :itemTypeId ORDER BY service_def_id",
                Map.of("itemTypeId", itemTypeId),
                ROW_MAPPER
        );
    }

    public List<PriceListEntry> findActiveByItemTypeId(Long itemTypeId) {
        return jdbc.query(
                "SELECT id, item_type_id, service_def_id, price, cost_price, is_active, created_at, updated_at FROM price_list WHERE item_type_id = :itemTypeId AND is_active = TRUE ORDER BY service_def_id",
                Map.of("itemTypeId", itemTypeId),
                ROW_MAPPER
        );
    }

    public Optional<PriceListEntry> findByItemTypeIdAndServiceDefId(Long itemTypeId, Long serviceDefId) {
        List<PriceListEntry> result = jdbc.query(
                "SELECT id, item_type_id, service_def_id, price, cost_price, is_active, created_at, updated_at FROM price_list WHERE item_type_id = :itemTypeId AND service_def_id = :serviceDefId",
                Map.of("itemTypeId", itemTypeId, "serviceDefId", serviceDefId),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public void updatePrice(Long id, BigDecimal price, BigDecimal costPrice) {
        boolean isActive = price != null;
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("price", price)
                .addValue("costPrice", costPrice)
                .addValue("isActive", isActive);
        jdbc.update(
                "UPDATE price_list SET price = :price, cost_price = :costPrice, is_active = :isActive, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public void seedForItemType(Long itemTypeId) {
        jdbc.update(
                "INSERT INTO price_list (item_type_id, service_def_id) SELECT :itemTypeId, sd.id FROM service_definitions sd ON CONFLICT DO NOTHING",
                Map.of("itemTypeId", itemTypeId)
        );
    }

    public void seedForServiceDef(Long serviceDefId) {
        jdbc.update(
                "INSERT INTO price_list (item_type_id, service_def_id) SELECT it.id, :serviceDefId FROM item_types it ON CONFLICT DO NOTHING",
                Map.of("serviceDefId", serviceDefId)
        );
    }
}
