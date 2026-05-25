package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.model.OrderItemServiceInstance;
import ru.carpet.model.ServiceStatus;

import java.util.List;
import java.util.Map;

/**
 * Репозиторий услуг на позициях заказа (V10).
 *
 * <p>Связь с SKU: новые записи ссылаются на конкретный {@code sku_id} и
 * {@code sku_version_id}. Колонка {@code service_def_id} осталась без FK
 * как legacy для исторических заказов до V10 — там она просто игнорируется.
 *
 * <p>Имя услуги и группа берутся snapshot'ом из версии SKU — заказ показывает
 * «как было на момент покупки», даже если позже SKU переименовали или удалили.
 */
@Repository
public class OrderItemServiceInstanceRepository {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * SELECT'ы используют LEFT JOIN на sku_versions (snapshot имени/группы)
     * с fallback на текущий мастер SKU, если version_id NULL (исторические записи).
     */
    private static final String SELECT_COLS = """
        ois.id, ois.order_item_id, ois.sku_id, ois.sku_version_id,
        COALESCE(sv.name, s.name)              AS sku_name,
        COALESCE(g_v.name, g.name)             AS sku_group_name,
        COALESCE(sv.pricing_type, s.pricing_type) AS pricing_type,
        COALESCE(sv.price, s.price)            AS sku_unit_price,
        ois.status, ois.price, ois.is_manual_price, ois.cancellation_reason,
        ois.created_at, ois.updated_at
        """;

    private static final String FROM_JOINS = """
        FROM order_item_services ois
        LEFT JOIN skus           s    ON s.id    = ois.sku_id
        LEFT JOIN sku_groups     g    ON g.id    = s.group_id
        LEFT JOIN sku_versions   sv   ON sv.id   = ois.sku_version_id
        LEFT JOIN sku_groups     g_v  ON g_v.id  = sv.group_id
        """;

    private static final RowMapper<OrderItemServiceInstance> ROW_MAPPER = (rs, rowNum) -> new OrderItemServiceInstance(
            rs.getLong("id"),
            rs.getLong("order_item_id"),
            rs.getObject("sku_id", Long.class),
            rs.getObject("sku_version_id", Long.class),
            rs.getString("sku_name"),
            rs.getString("sku_group_name"),
            rs.getString("pricing_type"),
            rs.getBigDecimal("sku_unit_price"),
            ServiceStatus.valueOf(rs.getString("status")),
            rs.getBigDecimal("price"),
            rs.getBoolean("is_manual_price"),
            rs.getString("cancellation_reason"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public OrderItemServiceInstanceRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Добавляет услуги по списку SKU. Цена и текущая версия подтягиваются
     * подзапросом из таблицы skus.
     */
    public void saveAll(Long orderItemId, List<Long> skuIds) {
        if (skuIds == null || skuIds.isEmpty()) return;
        for (Long skuId : skuIds) {
            jdbc.update("""
                INSERT INTO order_item_services
                  (order_item_id, sku_id, sku_version_id, status, price, is_manual_price)
                VALUES (
                  :oid, :sku,
                  (SELECT current_version_id FROM skus WHERE id = :sku),
                  'CREATED', COALESCE((SELECT price FROM skus WHERE id = :sku), 0), FALSE)
            """, Map.of("oid", orderItemId, "sku", skuId));
        }
    }

    /**
     * Записать одну новую услугу с указанной ценой (для auto-add при создании
     * заказа — там цена уже может быть посчитана с учётом free_threshold).
     */
    public Long saveOne(Long orderItemId, Long skuId, java.math.BigDecimal price) {
        return jdbc.queryForObject("""
            INSERT INTO order_item_services
              (order_item_id, sku_id, sku_version_id, status, price, is_manual_price)
            VALUES (:oid, :sku,
                    (SELECT current_version_id FROM skus WHERE id = :sku),
                    'CREATED', :p, FALSE)
            RETURNING id
        """, Map.of("oid", orderItemId, "sku", skuId, "p", price), Long.class);
    }

    /** V11: назначить исполнителя на услугу (для auto-add lifecycle). */
    public void assignEmployee(Long serviceId, Long employeeId) {
        jdbc.update("INSERT INTO service_assignees (order_item_service_id, employee_id) VALUES (:s, :e) ON CONFLICT DO NOTHING",
                Map.of("s", serviceId, "e", employeeId));
    }

    public List<OrderItemServiceInstance> findByOrderItemId(Long orderItemId) {
        return jdbc.query(
                "SELECT " + SELECT_COLS + FROM_JOINS +
                "WHERE ois.order_item_id = :orderItemId ORDER BY ois.id",
                Map.of("orderItemId", orderItemId),
                ROW_MAPPER
        );
    }

    public List<OrderItemServiceInstance> findByOrderItemIds(java.util.Collection<Long> orderItemIds) {
        if (orderItemIds == null || orderItemIds.isEmpty()) return List.of();
        return jdbc.query(
                "SELECT " + SELECT_COLS + FROM_JOINS +
                "WHERE ois.order_item_id IN (:ids) ORDER BY ois.order_item_id, ois.id",
                new MapSqlParameterSource("ids", orderItemIds),
                ROW_MAPPER
        );
    }

    public void updateStatus(Long id, ServiceStatus status) {
        jdbc.update(
                "UPDATE order_item_services SET status = :status, updated_at = NOW() WHERE id = :id",
                Map.of("status", status.name(), "id", id)
        );
    }

    public void updateStatusWithReason(Long id, ServiceStatus status, String reason) {
        jdbc.update(
                "UPDATE order_item_services SET status = :status, cancellation_reason = :reason, " +
                "updated_at = NOW() WHERE id = :id",
                Map.of("id", id, "status", status.name(), "reason", reason)
        );
    }

    public void updatePrice(Long id, java.math.BigDecimal price) {
        jdbc.update(
                "UPDATE order_item_services SET price = :price, is_manual_price = TRUE, updated_at = NOW() WHERE id = :id",
                Map.of("price", price, "id", id)
        );
    }

    /** V11+: сбросить флаг ручной цены, чтобы пересчёт снова работал автоматически. */
    public void clearManualPriceFlag(Long id) {
        jdbc.update(
                "UPDATE order_item_services SET is_manual_price = FALSE, updated_at = NOW() WHERE id = :id",
                Map.of("id", id)
        );
    }

    /**
     * Массовый сброс ручного флага у всех услуг позиции. Вызывается при изменении размеров
     * позиции: старая ручная цена услуги уже неактуальна для новых размеров, надо считать заново.
     */
    public void clearAllManualPriceFlagsForItem(Long orderItemId) {
        jdbc.update(
                "UPDATE order_item_services SET is_manual_price = FALSE, updated_at = NOW() " +
                "WHERE order_item_id = :oid AND is_manual_price = TRUE",
                Map.of("oid", orderItemId)
        );
    }

    public void updateCalculatedPrice(Long id, java.math.BigDecimal price) {
        jdbc.update(
                "UPDATE order_item_services SET price = :price, updated_at = NOW() WHERE id = :id AND is_manual_price = FALSE",
                Map.of("price", price, "id", id)
        );
    }

    /** V11: подменить SKU на услуге (auto-switch при смене размеров). */
    public void switchSku(Long serviceId, Long newSkuId) {
        jdbc.update("""
            UPDATE order_item_services
               SET sku_id = :sku,
                   sku_version_id = (SELECT current_version_id FROM skus WHERE id = :sku),
                   updated_at = NOW()
             WHERE id = :id
        """, Map.of("id", serviceId, "sku", newSkuId));
    }

    public java.math.BigDecimal sumPriceByOrderItemId(Long orderItemId) {
        List<java.math.BigDecimal> r = jdbc.query(
                "SELECT COALESCE(SUM(price), 0) AS total FROM order_item_services " +
                "WHERE order_item_id = :oid AND status != 'CANCELLED'",
                Map.of("oid", orderItemId),
                (rs, rn) -> rs.getBigDecimal("total")
        );
        return r.isEmpty() ? java.math.BigDecimal.ZERO : r.get(0);
    }

    public java.util.Optional<OrderItemServiceInstance> findById(Long id) {
        var list = jdbc.query(
                "SELECT " + SELECT_COLS + FROM_JOINS + "WHERE ois.id = :id",
                Map.of("id", id), ROW_MAPPER
        );
        return list.stream().findFirst();
    }

    public List<OrderItemServiceInstance> findByEmployeeId(Long employeeId, String status) {
        StringBuilder sql = new StringBuilder("SELECT " + SELECT_COLS + FROM_JOINS +
                "JOIN service_assignees sa ON ois.id = sa.order_item_service_id " +
                "WHERE sa.employee_id = :employeeId");
        java.util.Map<String, Object> params = new java.util.HashMap<>();
        params.put("employeeId", employeeId);
        if (status != null && !status.isEmpty()) {
            sql.append(" AND ois.status = :status");
            params.put("status", status);
        }
        sql.append(" ORDER BY ois.id DESC");
        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }

    public java.math.BigDecimal sumPriceByEmployeeId(Long employeeId, String status, String dateFrom, String dateTo) {
        StringBuilder sql = new StringBuilder("""
            SELECT COALESCE(SUM(ois.price), 0) as total
            FROM order_item_services ois
            JOIN service_assignees sa ON ois.id = sa.order_item_service_id
            WHERE sa.employee_id = :employeeId
            """);
        java.util.Map<String, Object> params = new java.util.HashMap<>();
        params.put("employeeId", employeeId);
        if (status != null && !status.isEmpty()) {
            sql.append(" AND ois.status = :status");
            params.put("status", status);
        }
        if (dateFrom != null && !dateFrom.isEmpty()) {
            sql.append(" AND ois.updated_at >= :dateFrom");
            params.put("dateFrom", dateFrom);
        }
        if (dateTo != null && !dateTo.isEmpty()) {
            sql.append(" AND ois.updated_at <= :dateTo");
            params.put("dateTo", dateTo);
        }
        var r = jdbc.query(sql.toString(), params, (rs, rn) -> rs.getBigDecimal("total"));
        return r.isEmpty() ? java.math.BigDecimal.ZERO : r.get(0);
    }
}
