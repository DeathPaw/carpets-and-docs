package ru.carpet.repository;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;
import ru.carpet.model.Order;
import ru.carpet.model.OrderStatus;
import ru.carpet.model.PaymentType;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class OrderRepository {

    private final NamedParameterJdbcTemplate jdbc;

    private static final RowMapper<Order> ROW_MAPPER = (rs, rowNum) -> {
        String paymentTypeStr = rs.getString("payment_type");
        PaymentType paymentType = paymentTypeStr != null ? PaymentType.valueOf(paymentTypeStr) : null;

        Long parentOrderId = rs.getObject("parent_order_id", Long.class);
        Long clientId = rs.getObject("client_id", Long.class);

        Timestamp paymentDateTs = rs.getTimestamp("payment_date");
        var paymentDate = paymentDateTs != null ? paymentDateTs.toLocalDateTime() : null;

        // client_address может отсутствовать в некоторых запросах
        String clientAddress = null;
        try { clientAddress = rs.getString("client_address"); } catch (Exception ignored) {}

        Long legacyId = rs.getObject("legacy_id", Long.class);

        Date pickupDateSql = rs.getDate("pickup_date");
        var pickupDate = pickupDateSql != null ? pickupDateSql.toLocalDate() : null;

        Date deliveryDateSql = rs.getDate("delivery_date");
        var deliveryDate = deliveryDateSql != null ? deliveryDateSql.toLocalDate() : null;

        BigDecimal baseAmount = rs.getBigDecimal("base_amount");
        BigDecimal discountPercent = rs.getBigDecimal("discount_percent");

        Long version = rs.getObject("version", Long.class);

        Date actualPickupDateSql = rs.getDate("actual_pickup_date");
        var actualPickupDate = actualPickupDateSql != null ? actualPickupDateSql.toLocalDate() : null;

        Date actualDeliveryDateSql = rs.getDate("actual_delivery_date");
        var actualDeliveryDate = actualDeliveryDateSql != null ? actualDeliveryDateSql.toLocalDate() : null;

        // assigned_driver_id / driver_name могут не присутствовать в некоторых запросах
        // (старые подзапросы без JOIN). Делаем try/catch — иначе они падают по NPE.
        Long assignedDriverId = null;
        String assignedDriverName = null;
        try { assignedDriverId = rs.getObject("assigned_driver_id", Long.class); } catch (Exception ignored) {}
        try { assignedDriverName = rs.getString("assigned_driver_name"); } catch (Exception ignored) {}

        return new Order(
                rs.getLong("id"),
                clientId,
                rs.getString("client_name"),
                clientAddress,
                rs.getString("comment"),
                OrderStatus.valueOf(rs.getString("status")),
                rs.getBoolean("is_warranty"),
                parentOrderId,
                rs.getBigDecimal("total_amount"),
                rs.getBoolean("paid"),
                paymentType,
                paymentDate,
                rs.getString("pickup_address"),
                rs.getString("delivery_address"),
                legacyId,
                pickupDate,
                rs.getString("pickup_time_slot"),
                deliveryDate,
                rs.getString("delivery_time_slot"),
                rs.getString("pickup_district"),
                rs.getString("delivery_district"),
                rs.getBigDecimal("pickup_lat"),
                rs.getBigDecimal("pickup_lon"),
                rs.getBigDecimal("delivery_lat"),
                rs.getBigDecimal("delivery_lon"),
                actualPickupDate,
                rs.getString("actual_pickup_time_slot"),
                actualDeliveryDate,
                rs.getString("actual_delivery_time_slot"),
                baseAmount,
                discountPercent,
                rs.getString("cancellation_reason"),
                assignedDriverId,
                assignedDriverName,
                version,
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime()
        );
    };

    public OrderRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Универсальная выборка заказов через {@link OrderQuery}.
     * Все остальные перегрузки {@code findAll(...)} ниже — тонкие обёртки для обратной совместимости.
     */
    public List<Order> findAll(OrderQuery query, int page, int size) {
        Map<String, Object> params = new HashMap<>();
        params.put("limit", size);
        params.put("offset", (long) page * size);

        StringBuilder sql = new StringBuilder(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id WHERE 1=1 ");

        appendWhereClause(sql, params, query);

        sql.append("ORDER BY ").append(buildOrderBy(query.sortBy(), query.sortDir()))
                .append(" LIMIT :limit OFFSET :offset");

        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }

    public long countAll(OrderQuery query) {
        Map<String, Object> params = new HashMap<>();
        StringBuilder sql = new StringBuilder(
                "SELECT COUNT(*) FROM orders o LEFT JOIN clients c ON c.id = o.client_id WHERE 1=1 ");

        appendWhereClause(sql, params, query);

        Long count = jdbc.queryForObject(sql.toString(), params, Long.class);
        return count != null ? count : 0;
    }

    // ───────── обёртки для обратной совместимости ─────────

    public List<Order> findAll(OrderStatus status, int page, int size) {
        return findAll(OrderQuery.builder().status(status).build(), page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, int page, int size) {
        return findAll(OrderQuery.builder().status(status).dateFrom(dateFrom).dateTo(dateTo).build(), page, size);
    }

    public List<Order> findAll(OrderStatus status, String dateFrom, String dateTo, Long legacyId, int page, int size) {
        return findAll(OrderQuery.builder().status(status).dateFrom(dateFrom).dateTo(dateTo).legacyId(legacyId).build(),
                page, size);
    }

    public List<Order> findAll(List<OrderStatus> statuses, String dateFrom, String dateTo, String dateField,
                               Long legacyId, Long orderId, String paymentType,
                               String clientPhone, String clientName, Long clientId,
                               List<String> sortBy, List<String> sortDir, int page, int size) {
        return findAll(OrderQuery.builder()
                .statuses(statuses).dateFrom(dateFrom).dateTo(dateTo).dateField(dateField)
                .legacyId(legacyId).orderId(orderId).paymentType(paymentType)
                .clientPhone(clientPhone).clientName(clientName).clientId(clientId)
                .sortBy(sortBy).sortDir(sortDir).build(), page, size);
    }

    public long countAll(List<OrderStatus> statuses, String dateFrom, String dateTo, String dateField,
                         Long legacyId, Long orderId, String paymentType,
                         String clientPhone, String clientName, Long clientId) {
        return countAll(OrderQuery.builder()
                .statuses(statuses).dateFrom(dateFrom).dateTo(dateTo).dateField(dateField)
                .legacyId(legacyId).orderId(orderId).paymentType(paymentType)
                .clientPhone(clientPhone).clientName(clientName).clientId(clientId).build());
    }

    /** Сборка ORDER BY из списков полей и направлений. По умолчанию — id DESC. */
    private String buildOrderBy(List<String> sortBy, List<String> sortDir) {
        if (sortBy == null || sortBy.isEmpty()) return "o.id DESC";
        StringBuilder ob = new StringBuilder();
        for (int i = 0; i < sortBy.size(); i++) {
            String field = sortBy.get(i);
            String col = switch (field) {
                case "total_amount" -> "o.total_amount";
                case "created_at" -> "o.created_at";
                case "status" -> "o.status";
                case "client_name" -> "o.client_name";
                default -> "o.id";
            };
            String dir = (sortDir != null && i < sortDir.size() && "asc".equalsIgnoreCase(sortDir.get(i))) ? "ASC" : "DESC";
            if (ob.length() > 0) ob.append(", ");
            ob.append(col).append(" ").append(dir);
        }
        return ob.toString();
    }

    /** Допустимые поля дат для фильтрации, во избежание SQL-инъекции через имя колонки. */
    private static final java.util.Set<String> ALLOWED_DATE_FIELDS = java.util.Set.of(
            "created_at", "pickup_date", "delivery_date",
            "actual_pickup_date", "actual_delivery_date");

    private void appendWhereClause(StringBuilder sql, Map<String, Object> params, OrderQuery q) {
        if (q.statuses() != null && !q.statuses().isEmpty()) {
            sql.append("AND o.status IN (:statuses) ");
            params.put("statuses", q.statuses().stream().map(OrderStatus::name).toList());
        }
        if (q.clientId() != null) {
            sql.append("AND o.client_id = :clientId ");
            params.put("clientId", q.clientId());
        }
        // Имя колонки для фильтрации по диапазону дат — белый список, dot-prefix `o.` фиксирован.
        // created_at имеет тип timestamp, остальные — date; используем единый формат сравнения.
        String df = q.dateField() != null && ALLOWED_DATE_FIELDS.contains(q.dateField()) ? q.dateField() : "created_at";
        boolean isTimestamp = "created_at".equals(df);
        if (q.dateFrom() != null && !q.dateFrom().isEmpty()) {
            sql.append("AND o.").append(df).append(" >= :dateFrom ");
            params.put("dateFrom", isTimestamp
                    ? java.time.LocalDate.parse(q.dateFrom()).atStartOfDay()
                    : java.time.LocalDate.parse(q.dateFrom()));
        }
        if (q.dateTo() != null && !q.dateTo().isEmpty()) {
            sql.append("AND o.").append(df).append(isTimestamp ? " < :dateTo " : " <= :dateTo ");
            params.put("dateTo", isTimestamp
                    ? java.time.LocalDate.parse(q.dateTo()).plusDays(1).atStartOfDay()
                    : java.time.LocalDate.parse(q.dateTo()));
        }
        if (q.legacyId() != null) {
            sql.append("AND o.legacy_id = :legacyId ");
            params.put("legacyId", q.legacyId());
        }
        if (q.orderId() != null) {
            sql.append("AND o.id = :orderId ");
            params.put("orderId", q.orderId());
        }
        // paymentType: либо одиночное, либо CSV "CARD,CASH" — поддерживаем оба варианта.
        String paymentType = q.paymentType();
        if (paymentType != null && !paymentType.isEmpty()) {
            if (paymentType.contains(",")) {
                List<String> types = java.util.Arrays.stream(paymentType.split(","))
                        .map(String::trim).filter(s -> !s.isEmpty()).toList();
                if (!types.isEmpty()) {
                    sql.append("AND o.payment_type IN (:paymentTypes) ");
                    params.put("paymentTypes", types);
                }
            } else {
                sql.append("AND o.payment_type = :paymentType ");
                params.put("paymentType", paymentType);
            }
        }
        if (q.clientPhone() != null && !q.clientPhone().isEmpty()) {
            sql.append("AND (c.phone LIKE :clientPhone OR c.extra_phone LIKE :clientPhone) ");
            params.put("clientPhone", "%" + q.clientPhone() + "%");
        }
        if (q.clientName() != null && !q.clientName().isEmpty()) {
            sql.append("AND (LOWER(o.client_name) LIKE :clientNameLike OR LOWER(COALESCE(c.contact_person,'')) LIKE :clientNameLike) ");
            params.put("clientNameLike", "%" + q.clientName().toLowerCase() + "%");
        }
        // Заказы с адресом, но без координат — «потерянные», оператор не видит на карте.
        if (Boolean.TRUE.equals(q.noCoords())) {
            sql.append("AND ((o.pickup_address IS NOT NULL AND o.pickup_address <> '' AND o.pickup_lat IS NULL) " +
                       "  OR (o.delivery_address IS NOT NULL AND o.delivery_address <> '' AND o.delivery_lat IS NULL)) ");
        }
        // Просроченная фактическая дата — повторяет логику counter'а на дашборде.
        if (Boolean.TRUE.equals(q.overdueActual())) {
            sql.append("AND ((o.actual_pickup_date IS NOT NULL AND o.actual_pickup_date < CURRENT_DATE) " +
                       "  OR (o.actual_delivery_date IS NOT NULL AND o.actual_delivery_date < CURRENT_DATE)) ");
        }
        // Некорректный адрес: пора забрать/доставить, но адрес пуст.
        if (Boolean.TRUE.equals(q.badAddress())) {
            sql.append("AND ((o.status = 'FOR_PICKUP' AND (o.pickup_address IS NULL OR o.pickup_address = '')) " +
                       "  OR (o.status = 'DONE' AND (o.delivery_address IS NULL OR o.delivery_address = ''))) ");
        }
    }

    public Optional<Order> findById(Long id) {
        List<Order> result = jdbc.query(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id " +
                "WHERE o.id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public Optional<Order> findByLegacyId(Long legacyId) {
        List<Order> result = jdbc.query(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id " +
                "WHERE o.legacy_id = :legacyId",
                Map.of("legacyId", legacyId),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public void updateStatus(Long id, OrderStatus status) {
        jdbc.update(
                "UPDATE orders SET status = :status, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("status", status.name(), "id", id)
        );
    }

    /** Обновление статуса вместе с причиной (для CANCELLED). Причину очистить — передать null. */
    public void updateStatusWithReason(Long id, OrderStatus status, String reason) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("status", status.name())
                .addValue("reason", reason);
        jdbc.update(
                "UPDATE orders SET status = :status, cancellation_reason = :reason, " +
                "version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public void updateBaseAmount(Long id, java.math.BigDecimal baseAmount) {
        jdbc.update(
                "UPDATE orders SET base_amount = :baseAmount, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("baseAmount", baseAmount, "id", id)
        );
    }

    public void updateTotalAmount(Long id, java.math.BigDecimal totalAmount) {
        jdbc.update(
                "UPDATE orders SET total_amount = :totalAmount, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("totalAmount", totalAmount, "id", id)
        );
    }

    public void updateComment(Long id, String comment) {
        jdbc.update(
                "UPDATE orders SET comment = :comment, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("comment", comment, "id", id)
        );
    }

    public void updateDetails(Long id, String pickupAddress, String deliveryAddress, Long legacyId,
                              java.time.LocalDate pickupDate, String pickupTimeSlot,
                              java.time.LocalDate deliveryDate, String deliveryTimeSlot,
                              String pickupDistrict, String deliveryDistrict,
                              BigDecimal pickupLat, BigDecimal pickupLon,
                              BigDecimal deliveryLat, BigDecimal deliveryLon) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("pickupAddress", pickupAddress)
                .addValue("deliveryAddress", deliveryAddress)
                .addValue("legacyId", legacyId)
                .addValue("pickupDate", pickupDate)
                .addValue("pickupTimeSlot", pickupTimeSlot)
                .addValue("deliveryDate", deliveryDate)
                .addValue("deliveryTimeSlot", deliveryTimeSlot)
                .addValue("pickupDistrict", pickupDistrict)
                .addValue("deliveryDistrict", deliveryDistrict)
                .addValue("pickupLat", pickupLat)
                .addValue("pickupLon", pickupLon)
                .addValue("deliveryLat", deliveryLat)
                .addValue("deliveryLon", deliveryLon);
        jdbc.update(
                "UPDATE orders SET pickup_address = :pickupAddress, delivery_address = :deliveryAddress, " +
                "legacy_id = :legacyId, pickup_date = :pickupDate, pickup_time_slot = :pickupTimeSlot, " +
                "delivery_date = :deliveryDate, delivery_time_slot = :deliveryTimeSlot, " +
                "pickup_district = :pickupDistrict, delivery_district = :deliveryDistrict, " +
                "pickup_lat = :pickupLat, pickup_lon = :pickupLon, " +
                "delivery_lat = :deliveryLat, delivery_lon = :deliveryLon, " +
                "actual_pickup_date = COALESCE(actual_pickup_date, :pickupDate), " +
                "actual_pickup_time_slot = COALESCE(actual_pickup_time_slot, :pickupTimeSlot), " +
                "actual_delivery_date = COALESCE(actual_delivery_date, :deliveryDate), " +
                "actual_delivery_time_slot = COALESCE(actual_delivery_time_slot, :deliveryTimeSlot), " +
                "version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public void pay(Long id, ru.carpet.model.PaymentType paymentType) {
        jdbc.update(
                "UPDATE orders SET paid = true, payment_type = :paymentType, payment_date = NOW(), version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("paymentType", paymentType.name(), "id", id)
        );
    }

    public Order save(Long clientId, String clientName, String comment, String pickupAddress, String deliveryAddress, Long legacyId) {
        var params = new MapSqlParameterSource()
                .addValue("clientId", clientId)
                .addValue("clientName", clientName)
                .addValue("comment", comment)
                .addValue("pickupAddress", pickupAddress)
                .addValue("deliveryAddress", deliveryAddress)
                .addValue("legacyId", legacyId);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO orders (client_id, client_name, comment, status, is_warranty, paid, total_amount, " +
                "pickup_address, delivery_address, legacy_id) " +
                "VALUES (:clientId, :clientName, :comment, 'LEAD', false, false, 0, " +
                ":pickupAddress, :deliveryAddress, :legacyId)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public Order saveWarranty(Long clientId, String clientName, String comment, Long parentOrderId) {
        var params = new MapSqlParameterSource()
                .addValue("clientId", clientId)
                .addValue("clientName", clientName)
                .addValue("comment", comment)
                .addValue("parentOrderId", parentOrderId);
        var keyHolder = new GeneratedKeyHolder();
        jdbc.update(
                "INSERT INTO orders (client_id, client_name, comment, status, is_warranty, paid, total_amount, parent_order_id) " +
                "VALUES (:clientId, :clientName, :comment, 'CREATED', true, false, 0, :parentOrderId)",
                params,
                keyHolder,
                new String[]{"id"}
        );
        Long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public List<Order> findWarrantyOrders(Long parentOrderId) {
        return jdbc.query(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id " +
                "WHERE o.parent_order_id = :parentOrderId AND o.is_warranty = true ORDER BY o.id",
                Map.of("parentOrderId", parentOrderId),
                ROW_MAPPER
        );
    }

    public List<Order> findByClientName(String clientName) {
        return jdbc.query(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id " +
                "WHERE o.client_name = :clientName ORDER BY o.id DESC",
                Map.of("clientName", clientName),
                ROW_MAPPER
        );
    }

    public void updateActualDates(Long id, java.time.LocalDate actualPickupDate, String actualPickupTimeSlot,
                                  java.time.LocalDate actualDeliveryDate, String actualDeliveryTimeSlot) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("actualPickupDate", actualPickupDate)
                .addValue("actualPickupTimeSlot", actualPickupTimeSlot)
                .addValue("actualDeliveryDate", actualDeliveryDate)
                .addValue("actualDeliveryTimeSlot", actualDeliveryTimeSlot);
        jdbc.update(
                "UPDATE orders SET actual_pickup_date = :actualPickupDate, actual_pickup_time_slot = :actualPickupTimeSlot, " +
                "actual_delivery_date = :actualDeliveryDate, actual_delivery_time_slot = :actualDeliveryTimeSlot, " +
                "version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public List<Order> findByClientId(Long clientId) {
        return jdbc.query(
                "SELECT o.*, c.address as client_address, drv.name AS assigned_driver_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id " +
                "WHERE o.client_id = :clientId ORDER BY o.id DESC",
                Map.of("clientId", clientId),
                ROW_MAPPER
        );
    }
}
