package ru.carpet.service;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import ru.carpet.dto.OrderItemWithPosition;
import ru.carpet.model.OrderItemStatus;

import java.util.List;

@Service
public class ItemFilterService {

    private final NamedParameterJdbcTemplate jdbc;

    /**
     * Маппер с дополнительной колонкой position_in_order — порядковый номер позиции
     * внутри заказа (row_number() OVER PARTITION BY order_id ORDER BY id).
     */
    private static final RowMapper<OrderItemWithPosition> ROW_MAPPER = (rs, rowNum) -> new OrderItemWithPosition(
            rs.getLong("id"),
            rs.getLong("order_id"),
            rs.getLong("item_type_id"),
            rs.getString("item_type_name"),
            rs.getString("description"),
            rs.getString("defects"),
            OrderItemStatus.valueOf(rs.getString("status")),
            rs.getBigDecimal("price"),
            rs.getBigDecimal("length"),
            rs.getBigDecimal("width"),
            rs.getBigDecimal("weight"),
            rs.getBigDecimal("area"),
            rs.getBigDecimal("running_meters"),
            rs.getString("cancellation_reason"),
            rs.getInt("position_in_order"),
            rs.getTimestamp("created_at").toLocalDateTime(),
            rs.getTimestamp("updated_at").toLocalDateTime()
    );

    public ItemFilterService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Поиск позиций с поддержкой множественных значений статуса/типа.
     * Параметры передаются как List, пустые списки = «без фильтра».
     */
    public List<OrderItemWithPosition> findItems(
            List<OrderItemStatus> statuses, List<Long> itemTypeIds,
            Long orderId, Integer positionInOrder,
            Long employeeId, int page, int size
    ) {
        return findItems(statuses, itemTypeIds, orderId, positionInOrder, employeeId,
                null, null, null, page, size);
    }

    /**
     * V13: расширенные фильтры — поиск по имени/телефону клиента и legacy ID заказа.
     * Старая перегрузка делегирует сюда с null'ами.
     */
    public List<OrderItemWithPosition> findItems(
            List<OrderItemStatus> statuses, List<Long> itemTypeIds,
            Long orderId, Integer positionInOrder,
            Long employeeId,
            String clientName, String clientPhone, Long legacyId,
            int page, int size
    ) {
        var params = new MapSqlParameterSource();
        boolean needOrders = (clientName != null && !clientName.isBlank())
                || (clientPhone != null && !clientPhone.isBlank())
                || legacyId != null;
        boolean needClients = (clientName != null && !clientName.isBlank())
                || (clientPhone != null && !clientPhone.isBlank());

        // Подзапрос с window-функцией позиции в заказе.
        var sql = new StringBuilder(
                "SELECT * FROM (" +
                "  SELECT DISTINCT oi.id, oi.order_id, oi.item_type_id, it.name as item_type_name, " +
                "  oi.description, oi.defects, oi.status, oi.price, oi.length, oi.width, oi.weight, " +
                "  oi.area, oi.running_meters, oi.cancellation_reason, oi.created_at, oi.updated_at, " +
                "  ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.id) AS position_in_order " +
                "  FROM order_items oi JOIN item_types it ON it.id = oi.item_type_id "
        );
        if (employeeId != null) {
            sql.append("  JOIN order_item_services ois ON ois.order_item_id = oi.id ");
            sql.append("  JOIN service_assignees sa ON sa.order_item_service_id = ois.id ");
        }
        if (needOrders) {
            sql.append("  JOIN orders o ON o.id = oi.order_id ");
        }
        if (needClients) {
            sql.append("  LEFT JOIN clients c ON c.id = o.client_id ");
        }
        sql.append("  WHERE 1=1 ");
        if (employeeId != null) {
            sql.append("  AND sa.employee_id = :employeeId ");
            params.addValue("employeeId", employeeId);
        }
        if (legacyId != null) {
            sql.append("  AND o.legacy_id = :legacyId ");
            params.addValue("legacyId", legacyId);
        }
        if (clientName != null && !clientName.isBlank()) {
            sql.append("  AND (LOWER(c.name) LIKE :clientName OR LOWER(o.client_name) LIKE :clientName) ");
            params.addValue("clientName", "%" + clientName.toLowerCase() + "%");
        }
        if (clientPhone != null && !clientPhone.isBlank()) {
            // Фильтруем по последним 10 цифрам — независимо от форматирования (+7 (...), 8-..., и т.д.).
            String digits = clientPhone.replaceAll("\\D", "");
            String suffix = digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
            sql.append("  AND (REGEXP_REPLACE(COALESCE(c.phone,''),'\\D','','g') LIKE :clientPhone " +
                    "OR REGEXP_REPLACE(COALESCE(c.extra_phone,''),'\\D','','g') LIKE :clientPhone) ");
            params.addValue("clientPhone", "%" + suffix);
        }
        sql.append(") sub WHERE 1=1 ");

        if (statuses != null && !statuses.isEmpty()) {
            sql.append("AND status IN (:statuses) ");
            params.addValue("statuses", statuses.stream().map(OrderItemStatus::name).toList());
        }
        if (itemTypeIds != null && !itemTypeIds.isEmpty()) {
            sql.append("AND item_type_id IN (:itemTypeIds) ");
            params.addValue("itemTypeIds", itemTypeIds);
        }
        if (orderId != null) {
            sql.append("AND order_id = :orderId ");
            params.addValue("orderId", orderId);
        }
        if (positionInOrder != null) {
            sql.append("AND position_in_order = :positionInOrder ");
            params.addValue("positionInOrder", positionInOrder);
        }

        sql.append("ORDER BY id LIMIT :limit OFFSET :offset");
        params.addValue("limit", size);
        params.addValue("offset", (long) page * size);

        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }
}
