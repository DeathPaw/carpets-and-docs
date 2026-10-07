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
        // Телефон клиента — для маршрутного листа и режима «День» в логистике,
        // чтобы водителю не приходилось открывать карточку клиента.
        String clientPhone = null;
        try { clientPhone = rs.getString("client_phone"); } catch (Exception ignored) {}
        // V30: предварительный тип оплаты. try/catch — колонки может не быть в
        // выборках, которые тянут не весь o.*.
        String preliminaryPaymentType = null;
        try { preliminaryPaymentType = rs.getString("preliminary_payment_type"); } catch (Exception ignored) {}

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

        // V17: оператор-оформитель + проблемность. Те же try/catch на случай legacy-запросов.
        Long assignedOperatorId = null;
        String assignedOperatorName = null;
        boolean isProblem = false;
        String problemReason = null;
        try { assignedOperatorId   = rs.getObject("assigned_operator_id", Long.class); } catch (Exception ignored) {}
        try { assignedOperatorName = rs.getString("assigned_operator_name"); } catch (Exception ignored) {}
        try { isProblem            = rs.getBoolean("is_problem"); } catch (Exception ignored) {}
        try { problemReason        = rs.getString("problem_reason"); } catch (Exception ignored) {}

        // V42: дата прайса. try/catch — как и у остальных поздних колонок:
        // часть выборок тянет не весь o.*.
        java.time.LocalDate priceDate = null;
        try {
            Date priceDateSql = rs.getDate("price_date");
            priceDate = priceDateSql != null ? priceDateSql.toLocalDate() : null;
        } catch (Exception ignored) {}

        // V43: подтверждение клиента по дню выезда.
        boolean clientConfirmed = false;
        String clientConfirmedBy = null;
        java.time.LocalDateTime clientConfirmedAt = null;
        try { clientConfirmed   = rs.getBoolean("client_confirmed"); } catch (Exception ignored) {}
        try { clientConfirmedBy = rs.getString("client_confirmed_by"); } catch (Exception ignored) {}

        // V46: маркетинговые поля заказа.
        String orderReason = null, orderReasonNote = null, cancelReasonCode = null;
        try { orderReason      = rs.getString("order_reason"); } catch (Exception ignored) {}
        try { orderReasonNote  = rs.getString("order_reason_note"); } catch (Exception ignored) {}
        try { cancelReasonCode = rs.getString("cancel_reason_code"); } catch (Exception ignored) {}
        Long contractId = null;
        java.math.BigDecimal contractPricePerSqm = null;
        java.time.LocalDateTime contractDeliveredAt = null;
        try {
            long v = rs.getLong("contract_id");
            if (!rs.wasNull()) contractId = v;
            contractPricePerSqm = rs.getBigDecimal("contract_price_per_sqm");
            Timestamp deliveredTs = rs.getTimestamp("contract_delivered_at");
            contractDeliveredAt = deliveredTs != null ? deliveredTs.toLocalDateTime() : null;
        } catch (Exception ignored) {}
        try {
            Timestamp confirmedTs = rs.getTimestamp("client_confirmed_at");
            clientConfirmedAt = confirmedTs != null ? confirmedTs.toLocalDateTime() : null;
        } catch (Exception ignored) {}

        return new Order(
                rs.getLong("id"),
                clientId,
                rs.getString("client_name"),
                clientAddress,
                clientPhone,
                rs.getString("comment"),
                OrderStatus.valueOf(rs.getString("status")),
                rs.getBoolean("is_warranty"),
                parentOrderId,
                rs.getBigDecimal("total_amount"),
                rs.getBoolean("paid"),
                paymentType,
                paymentDate,
                preliminaryPaymentType,
                rs.getString("pickup_address"),
                rs.getString("delivery_address"),
                rs.getString("pickup_apartment"),
                rs.getString("delivery_apartment"),
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
                assignedOperatorId,
                assignedOperatorName,
                isProblem,
                problemReason,
                version,
                rs.getTimestamp("created_at").toLocalDateTime(),
                rs.getTimestamp("updated_at").toLocalDateTime(),
                priceDate,
                clientConfirmed,
                clientConfirmedBy,
                clientConfirmedAt,
                orderReason,
                orderReasonNote,
                cancelReasonCode,
                contractId,
                contractPricePerSqm,
                contractDeliveredAt
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
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id WHERE 1=1 ");

        appendWhereClause(sql, params, query);

        sql.append("ORDER BY ").append(buildOrderBy(query.sortBy(), query.sortDir()))
                .append(" LIMIT :limit OFFSET :offset");

        return jdbc.query(sql.toString(), params, ROW_MAPPER);
    }

    /**
     * V46 (правка №3 от 13.09): плоские строки для выгрузки заказов в Excel.
     *
     * <p>Собираем на стороне базы: скидки, надбавки, стоимость доставки и
     * признак «повторный клиент» живут в разных таблицах, и на фронте это
     * означало бы запрос на каждый заказ. Каждое значение — в своей колонке,
     * чтобы в Excel по ним можно было фильтровать и сортировать.
     */
    public List<Map<String, Object>> exportRows(OrderQuery query, int limit) {
        Map<String, Object> params = new HashMap<>();
        params.put("limit", limit);

        StringBuilder sql = new StringBuilder("""
            SELECT o.id,
                   o.created_at,
                   o.client_id,
                   o.client_name,
                   o.status,
                   o.base_amount,
                   o.total_amount,
                   o.paid,
                   o.payment_type,
                   o.is_warranty,
                   COALESCE(NULLIF(o.pickup_address, ''), NULLIF(o.delivery_address, ''), c.address) AS address,
                   COALESCE(NULLIF(o.pickup_district, ''), NULLIF(o.delivery_district, ''), c.district) AS district,
                   c.restart_status,
                   c.source,
                   c.source_note,
                   o.order_reason,
                   o.order_reason_note,
                   o.cancel_reason_code,
                   cr.name AS cancel_reason_name,
                   o.cancellation_reason,
                   -- «Повторный» = у клиента был заказ раньше этого (отменённые не в счёт).
                   EXISTS (SELECT 1 FROM orders prev
                            WHERE prev.client_id = o.client_id AND prev.id < o.id
                              AND prev.status <> 'CANCELLED') AS is_repeat_client,
                   -- Стоимость доставки: позиция с авто-услугой отвоза.
                   COALESCE((SELECT SUM(oi.price) FROM order_items oi
                              WHERE oi.order_id = o.id AND oi.status <> 'CANCELLED'
                                AND EXISTS (SELECT 1 FROM order_item_services ois
                                              JOIN skus s ON s.id = ois.sku_id
                                             WHERE ois.order_item_id = oi.id
                                               AND s.is_auto_add = TRUE
                                               AND s.triggers_order_status = 'DELIVERED'
                                               AND ois.status <> 'CANCELLED')), 0) AS delivery_price,
                   (SELECT string_agg(om.modifier_name || ' (' || trim(trailing '.' from trim(to_char(om.percent, 'FM990.99'))) || '%)', ', ')
                      FROM order_modifiers om WHERE om.order_id = o.id AND om.percent < 0) AS discounts,
                   COALESCE((SELECT SUM(o.base_amount * om.percent / 100)
                               FROM order_modifiers om WHERE om.order_id = o.id AND om.percent < 0), 0) AS discount_sum,
                   (SELECT string_agg(om.modifier_name || ' (' || trim(trailing '.' from trim(to_char(om.percent, 'FM990.99'))) || '%)', ', ')
                      FROM order_modifiers om WHERE om.order_id = o.id AND om.percent > 0) AS surcharges,
                   COALESCE((SELECT SUM(o.base_amount * om.percent / 100)
                               FROM order_modifiers om WHERE om.order_id = o.id AND om.percent > 0), 0) AS surcharge_sum
              FROM orders o
              LEFT JOIN clients c ON c.id = o.client_id
              LEFT JOIN cancellation_reasons cr ON cr.code = o.cancel_reason_code
             WHERE 1=1
            """);

        appendWhereClause(sql, params, query);
        sql.append(" ORDER BY o.id LIMIT :limit");
        return jdbc.queryForList(sql.toString(), params);
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
        // Единый поиск: одно поле вместо трёх (имя / телефон / legacy ID).
        // Условия объединены через OR — оператор вводит что знает, не выбирая колонку.
        // Цифры сравниваем с телефоном и legacy_id, текст — с именем и контактным лицом.
        if (q.search() != null && !q.search().isBlank()) {
            String raw = q.search().trim();
            String digits = raw.replaceAll("\\D", "");
            sql.append("AND (LOWER(o.client_name) LIKE :searchLike ")
               .append("  OR LOWER(COALESCE(c.contact_person,'')) LIKE :searchLike ");
            if (!digits.isEmpty()) {
                sql.append("  OR REGEXP_REPLACE(COALESCE(c.phone,''), '\\D', '', 'g') LIKE :searchDigits ")
                   .append("  OR REGEXP_REPLACE(COALESCE(c.extra_phone,''), '\\D', '', 'g') LIKE :searchDigits ")
                   .append("  OR CAST(o.legacy_id AS text) LIKE :searchDigits ")
                   .append("  OR CAST(o.id AS text) LIKE :searchDigits ");
                params.put("searchDigits", "%" + digits + "%");
            }
            sql.append(") ");
            params.put("searchLike", "%" + raw.toLowerCase() + "%");
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
        // V19: только гарантийные заказы (для аналитики).
        if (Boolean.TRUE.equals(q.onlyWarranty())) {
            sql.append("AND o.is_warranty = TRUE ");
        }
        // V44: заказы, где производство поправило размеры или материал ковра —
        // по ним менялась цена, и оператору стоит их просмотреть отдельно.
        if (Boolean.TRUE.equals(q.adjustedByProduction())) {
            sql.append("AND EXISTS (SELECT 1 FROM order_item_adjustments a " +
                       "             JOIN order_items oi ON oi.id = a.order_item_id " +
                       "            WHERE oi.order_id = o.id AND a.source = 'PRODUCTION') ");
        }
        // Район: заказ подходит, если совпал район забора ИЛИ доставки —
        // оператор ищет «что у нас в Красносельском», не разделяя направления.
        if (q.districts() != null && !q.districts().isEmpty()) {
            sql.append("AND (o.pickup_district IN (:districts) OR o.delivery_district IN (:districts)) ");
            params.put("districts", q.districts());
        }
        // «Висящие» — лид/созданный старше 7 дней, которому так и не назначили забор.
        // Условие ДОЛЖНО совпадать с counter'ом stuck в DashboardRepository, иначе
        // на плитке одно число, а после клика в списке другое.
        if (Boolean.TRUE.equals(q.stuck())) {
            sql.append("AND o.status IN ('LEAD','CREATED','FOR_PICKUP') " +
                       "AND o.actual_pickup_date IS NULL AND o.pickup_date IS NULL " +
                       "AND o.created_at < NOW() - INTERVAL '7 days' ");
        }
    }

    public Optional<Order> findById(Long id) {
        List<Order> result = jdbc.query(
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id " +
                "WHERE o.id = :id",
                Map.of("id", id),
                ROW_MAPPER
        );
        return result.stream().findFirst();
    }

    public Optional<Order> findByLegacyId(Long legacyId) {
        List<Order> result = jdbc.query(
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id " +
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

    /**
     * V43: подтверждение клиента по дню выезда. {@code by} — оператор, который
     * дозвонился; при сбросе в «Уточнить» подпись и время затираем, чтобы в
     * карточке не висело имя от старого подтверждения.
     */
    public void updateClientConfirmed(Long id, boolean confirmed, String by) {
        jdbc.update("""
            UPDATE orders
               SET client_confirmed = :c,
                   client_confirmed_by = CASE WHEN :c THEN :by ELSE NULL END,
                   client_confirmed_at = CASE WHEN :c THEN NOW() ELSE NULL END,
                   updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("c", confirmed)
                .addValue("by", by)
                .addValue("id", id));
    }

    /**
     * V46: повод обращения по заказу (правка №3 от 13.09). Уточнение имеет
     * смысл только у повода «Другой» — остальные говорят сами за себя.
     */
    public void updateOrderReason(Long id, String reason, String note) {
        jdbc.update("""
            UPDATE orders
               SET order_reason = :reason,
                   order_reason_note = CASE WHEN :reason = 'OTHER' THEN :note ELSE NULL END,
                   updated_at = NOW()
             WHERE id = :id
        """, new MapSqlParameterSource()
                .addValue("reason", reason)
                .addValue("note", note)
                .addValue("id", id));
    }

    /**
     * ТЗ v2 (блок 6): договорная цена за м², зафиксированная на заказе при
     * привязке к контракту. null — обычный заказ по прайсу.
     */
    public java.math.BigDecimal contractPricePerSqm(Long orderId) {
        var rows = jdbc.queryForList(
                "SELECT contract_price_per_sqm FROM orders WHERE id = :id", Map.of("id", orderId));
        if (rows.isEmpty()) return null;
        Object v = rows.get(0).get("contract_price_per_sqm");
        return v == null ? null : new java.math.BigDecimal(String.valueOf(v));
    }

    /** V46: код причины отмены из справочника — пишется вместе со статусом CANCELLED. */
    public void updateCancelReasonCode(Long id, String code) {
        jdbc.update("UPDATE orders SET cancel_reason_code = :code, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource().addValue("code", code).addValue("id", id));
    }

    /** V42: перевести заказ на прайс другой даты (кнопка «Пересчитать по текущему прайсу»). */
    public void updatePriceDate(Long id, java.time.LocalDate priceDate) {
        jdbc.update(
                "UPDATE orders SET price_date = :d, version = version + 1, updated_at = NOW() WHERE id = :id",
                Map.of("d", priceDate, "id", id)
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

    /** V30: предварительный тип оплаты. value = null сбрасывает значение. */
    public void updatePreliminaryPaymentType(Long id, String value) {
        var params = new MapSqlParameterSource()
                .addValue("v", value)   // null → SQL NULL
                .addValue("id", id);
        jdbc.update(
                "UPDATE orders SET preliminary_payment_type = :v, version = version + 1, updated_at = NOW() WHERE id = :id",
                params
        );
    }

    public void updateDetails(Long id, String pickupAddress, String deliveryAddress,
                              String pickupApartment, String deliveryApartment, Long legacyId,
                              java.time.LocalDate pickupDate, String pickupTimeSlot,
                              java.time.LocalDate deliveryDate, String deliveryTimeSlot,
                              String pickupDistrict, String deliveryDistrict,
                              BigDecimal pickupLat, BigDecimal pickupLon,
                              BigDecimal deliveryLat, BigDecimal deliveryLon) {
        var params = new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("pickupAddress", pickupAddress)
                .addValue("deliveryAddress", deliveryAddress)
                .addValue("pickupApartment", pickupApartment)
                .addValue("deliveryApartment", deliveryApartment)
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
                "pickup_apartment = :pickupApartment, delivery_apartment = :deliveryApartment, " +
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

    /**
     * V19 (#7): после переименования клиента — пробрасываем новое имя в денормализованную
     * колонку orders.client_name. Иначе старое имя останется в карточках всех его заказов.
     */
    public int updateClientNameInOrders(Long clientId, String newName) {
        return jdbc.update(
            "UPDATE orders SET client_name = :nm, updated_at = NOW() WHERE client_id = :id",
            new MapSqlParameterSource().addValue("nm", newName).addValue("id", clientId));
    }

    /** V17: пометить/снять флаг проблемного заказа. reason обязателен при TRUE. */
    public void setProblem(Long orderId, boolean isProblem, String reason) {
        jdbc.update(
                "UPDATE orders SET is_problem = :p, problem_reason = :r, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource().addValue("p", isProblem)
                        .addValue("r", isProblem ? reason : null).addValue("id", orderId));
    }

    /** V17: назначить (или снять) оператора-оформителя на заказ. */
    public void setAssignedOperator(Long orderId, Long employeeId) {
        jdbc.update(
                "UPDATE orders SET assigned_operator_id = :e, updated_at = NOW() WHERE id = :id",
                new MapSqlParameterSource().addValue("e", employeeId).addValue("id", orderId));
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
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id " +
                "WHERE o.parent_order_id = :parentOrderId AND o.is_warranty = true ORDER BY o.id",
                Map.of("parentOrderId", parentOrderId),
                ROW_MAPPER
        );
    }

    public List<Order> findByClientName(String clientName) {
        return jdbc.query(
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id " +
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
                "SELECT o.*, c.address as client_address, c.phone as client_phone, drv.name AS assigned_driver_name, op.name AS assigned_operator_name FROM orders o LEFT JOIN clients c ON c.id = o.client_id LEFT JOIN employees drv ON drv.id = o.assigned_driver_id LEFT JOIN employees op ON op.id = o.assigned_operator_id " +
                "WHERE o.client_id = :clientId ORDER BY o.id DESC",
                Map.of("clientId", clientId),
                ROW_MAPPER
        );
    }
}
