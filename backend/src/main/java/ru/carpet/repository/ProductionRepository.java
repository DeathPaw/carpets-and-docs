package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import ru.carpet.dto.AnalyticsDto;

import java.util.List;
import java.util.Map;

import static ru.carpet.repository.AnalyticsHelpers.longOrZero;
import static ru.carpet.repository.AnalyticsHelpers.nz;

/**
 * Производственная очередь — три представления: по заказам, по позициям, по услугам.
 * Все три страницы Производство переключаются между этими SQL'ами.
 *
 * Раньше жили в общем {@code AnalyticsRepository} — вынесено для разделения
 * аналитики (что было) и операционной очереди (что делать сейчас).
 */
@Repository
public class ProductionRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ProductionRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AnalyticsDto.ProductionQueueOrder> productionQueue() {
        return jdbc.query(
            "SELECT o.id as order_id, o.client_name, o.status, o.created_at, o.total_amount, " +
            "o.pickup_district, o.delivery_district, " +
            "COUNT(DISTINCT oi.id) as items_count, " +
            "COUNT(DISTINCT ois.id) as services_count, " +
            "COUNT(DISTINCT CASE WHEN ois.status = 'DONE' THEN ois.id END) as services_done " +
            "FROM orders o " +
            "LEFT JOIN order_items oi ON oi.order_id = o.id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id " +
            "WHERE o.status IN ('FOR_PICKUP','IN_PROGRESS','PARTIALLY_DONE') " +
            "GROUP BY o.id ORDER BY o.created_at ASC",
            (RowMapper<AnalyticsDto.ProductionQueueOrder>) (rs, n) -> new AnalyticsDto.ProductionQueueOrder(
                rs.getLong("order_id"), rs.getString("client_name"), rs.getString("status"),
                rs.getTimestamp("created_at").toLocalDateTime(), nz(rs.getBigDecimal("total_amount")),
                rs.getString("pickup_district"), rs.getString("delivery_district"),
                longOrZero(rs, "items_count"), longOrZero(rs, "services_count"), longOrZero(rs, "services_done")
            )
        );
    }

    /** Очередь в разрезе позиций — каждая позиция отдельной карточкой. */
    public List<AnalyticsDto.ProductionQueueItem> productionQueueItems() {
        return jdbc.query(
            "SELECT oi.id as item_id, oi.order_id, oi.status, oi.description, " +
            "oi.length, oi.width, oi.weight, oi.area, " +
            "it.name as item_type_name, " +
            "o.client_name, o.created_at as order_created_at, " +
            "o.pickup_district, " +
            "COUNT(DISTINCT ois.id) as services_count, " +
            "COUNT(DISTINCT CASE WHEN ois.status = 'DONE' THEN ois.id END) as services_done " +
            "FROM order_items oi " +
            "JOIN orders o ON o.id = oi.order_id " +
            "LEFT JOIN item_types it ON it.id = oi.item_type_id " +
            "LEFT JOIN order_item_services ois ON ois.order_item_id = oi.id " +
            "WHERE oi.status IN ('CREATED','IN_PROGRESS','PARTIALLY_DONE') " +
            "AND o.status NOT IN ('CANCELLED','DELIVERED') " +
            "GROUP BY oi.id, oi.order_id, oi.status, oi.description, oi.length, oi.width, oi.weight, oi.area, " +
            "it.name, o.client_name, o.created_at, o.pickup_district " +
            "ORDER BY o.created_at ASC, oi.id ASC",
            (RowMapper<AnalyticsDto.ProductionQueueItem>) (rs, n) -> new AnalyticsDto.ProductionQueueItem(
                rs.getLong("item_id"), rs.getLong("order_id"), rs.getString("status"),
                rs.getString("description"),
                rs.getBigDecimal("length"), rs.getBigDecimal("width"),
                rs.getBigDecimal("weight"), rs.getBigDecimal("area"),
                rs.getString("item_type_name"), rs.getString("client_name"),
                rs.getTimestamp("order_created_at").toLocalDateTime(),
                rs.getString("pickup_district"),
                longOrZero(rs, "services_count"), longOrZero(rs, "services_done")
            )
        );
    }

    /**
     * Очередь в разрезе услуг — каждая услуга отдельной карточкой.
     * Возвращает услуги в активных статусах (CREATED/IN_PROGRESS/DONE — DONE тоже виден,
     * чтобы оператор мог убедиться что услуга реально готова, и при желании отменить).
     * Заказы только в производственных статусах: исключаем DELIVERED/COMPLETED/CANCELLED.
     */
    public List<AnalyticsDto.ProductionQueueService> productionQueueServices() {
        return jdbc.query(
            "SELECT ois.id as service_id, ois.status, ois.price, " +
            "sd.name as service_name, sd.pricing_type, " +
            "oi.id as item_id, oi.description as item_description, oi.status as item_status, " +
            "it.id as item_type_id, it.name as item_type_name, " +
            "o.id as order_id, o.client_name, o.created_at as order_created_at, " +
            "o.pickup_district, " +
            "ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.id) as position_in_order, " +
            "COALESCE(STRING_AGG(DISTINCT e.name, ', ' ORDER BY e.name), '') as employee_names, " +
            "COALESCE(ARRAY_AGG(DISTINCT e.id) FILTER (WHERE e.id IS NOT NULL), '{}') as employee_ids " +
            "FROM order_item_services ois " +
            "JOIN order_items oi ON oi.id = ois.order_item_id " +
            "JOIN orders o ON o.id = oi.order_id " +
            "JOIN service_definitions sd ON sd.id = ois.service_def_id " +
            "JOIN item_types it ON it.id = oi.item_type_id " +
            "LEFT JOIN service_assignees sa ON sa.order_item_service_id = ois.id " +
            "LEFT JOIN employees e ON e.id = sa.employee_id " +
            "WHERE ois.status IN ('CREATED','IN_PROGRESS','DONE') " +
            "AND o.status NOT IN ('CANCELLED','DELIVERED','COMPLETED') " +
            "GROUP BY ois.id, sd.name, sd.pricing_type, oi.id, oi.description, oi.status, " +
            "it.id, it.name, o.id, o.client_name, o.created_at, o.pickup_district " +
            "ORDER BY o.created_at ASC, oi.id ASC, ois.id ASC",
            (RowMapper<AnalyticsDto.ProductionQueueService>) (rs, n) -> {
                java.sql.Array empIdsArr = rs.getArray("employee_ids");
                List<Integer> employeeIds = new java.util.ArrayList<>();
                if (empIdsArr != null) {
                    Object[] arr = (Object[]) empIdsArr.getArray();
                    for (Object o : arr) if (o != null) employeeIds.add(((Number) o).intValue());
                }
                return new AnalyticsDto.ProductionQueueService(
                    rs.getLong("service_id"), rs.getString("status"), nz(rs.getBigDecimal("price")),
                    rs.getString("service_name"), rs.getString("pricing_type"),
                    rs.getLong("item_id"), rs.getString("item_description"), rs.getString("item_status"),
                    rs.getLong("item_type_id"), rs.getString("item_type_name"),
                    rs.getLong("order_id"), rs.getString("client_name"),
                    rs.getTimestamp("order_created_at").toLocalDateTime(),
                    rs.getString("pickup_district"), longOrZero(rs, "position_in_order"),
                    rs.getString("employee_names"), employeeIds
                );
            }
        );
    }
}
