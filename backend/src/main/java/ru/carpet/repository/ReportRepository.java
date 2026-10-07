package ru.carpet.repository;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Отчёты по работам, затратам и ФОТ (ТЗ v2, блок 7).
 *
 * <p>Одна выборка на два вида работы: заказы в цеху и выездные чистки. Строки
 * отдаём как есть — агрегаты считаются поверх них, поэтому любая сумма в отчёте
 * раскрывается в исходные записи без второго, «параллельного» запроса, который
 * мог бы разойтись с первым.
 *
 * <p>Основание периода выбирает оператор: дата создания или дата выполнения.
 * Смешивать их в одном показателе нельзя — это прямое требование ТЗ, поэтому
 * фильтр по дате всегда идёт по одному полю.
 */
@Repository
public class ReportRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ReportRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Фильтры отчёта. Все независимы: пустое поле — «не фильтруем».
     *
     * @param dateBasis  CREATED — по дате оформления, COMPLETED — по дате выполнения
     * @param workKind   ORDER | ONSITE | null (оба)
     * @param handover   DELIVERY | SELF_PICKUP | ONSITE | null
     * @param clientKind INDIVIDUAL | LEGAL_ENTITY | null
     * @param contractMode WITH | WITHOUT | null
     */
    public record Filters(
            LocalDate from,
            LocalDate to,
            String dateBasis,
            String workKind,
            String handover,
            String clientKind,
            Long clientId,
            String contractMode,
            String contractKind,
            Long contractId,
            List<String> statuses
    ) {}

    /**
     * Заказы и выезды одной таблицей.
     *
     * <p>Самовывоз опознаём по услуге «Самовывоз …» на позициях заказа: отдельного
     * поля способа передачи в заказе нет, а услуга — то, чем оператор этот случай
     * и оформляет.
     */
    private static final String WORKS_SQL = """
        WITH work AS (
            SELECT 'ORDER'::text AS kind,
                   o.id,
                   o.client_id,
                   o.client_name,
                   COALESCE(cl.client_type, 'INDIVIDUAL') AS client_kind,
                   o.created_at::date AS created_on,
                   COALESCE(o.contract_delivered_at::date, o.actual_delivery_date,
                            (SELECT MAX(i.completed_at)::date FROM order_items i
                              WHERE i.order_id = o.id)) AS completed_on,
                   o.status::text AS status,
                   CASE WHEN EXISTS (
                       SELECT 1 FROM order_items i
                         JOIN order_item_services s ON s.order_item_id = i.id
                         JOIN sku_versions v ON v.id = s.sku_version_id
                        WHERE i.order_id = o.id AND s.status <> 'CANCELLED'
                          AND v.name ILIKE 'Самовывоз%'
                   ) THEN 'SELF_PICKUP' ELSE 'DELIVERY' END AS handover,
                   COALESCE((SELECT SUM(i.area) FROM order_items i
                              WHERE i.order_id = o.id AND i.status <> 'CANCELLED'), 0) AS area,
                   COALESCE(o.total_amount, 0) AS amount,
                   o.contract_id,
                   k.number AS contract_number,
                   k.kind AS contract_kind,
                   o.contract_delivered_at IS NOT NULL AS counted_in_contract
              FROM orders o
              LEFT JOIN clients cl ON cl.id = o.client_id
              LEFT JOIN contracts k ON k.id = o.contract_id
             UNION ALL
            SELECT 'ONSITE', c.id, c.client_id, c.client_name,
                   COALESCE(cl.client_type, 'INDIVIDUAL'),
                   c.cleaning_date,
                   c.completed_at::date,
                   c.status,
                   'ONSITE',
                   COALESCE(c.area, 0),
                   COALESCE(c.price, 0),
                   c.contract_id, k.number, k.kind,
                   c.status = 'DONE'
              FROM onsite_cleanings c
              LEFT JOIN clients cl ON cl.id = c.client_id
              LEFT JOIN contracts k ON k.id = c.contract_id
        )
        SELECT kind, id, client_id, client_name, client_kind,
               created_on::text AS created_on, completed_on::text AS completed_on,
               status, handover, area, amount,
               contract_id, contract_number, contract_kind, counted_in_contract
          FROM work
         WHERE 1=1
        """;

    public List<Map<String, Object>> works(Filters f) {
        var params = new MapSqlParameterSource()
                .addValue("from", f.from()).addValue("to", f.to())
                .addValue("workKind", f.workKind()).addValue("handover", f.handover())
                .addValue("clientKind", f.clientKind()).addValue("clientId", f.clientId())
                .addValue("contractKind", f.contractKind()).addValue("contractId", f.contractId())
                .addValue("statuses", f.statuses());

        StringBuilder sql = new StringBuilder(WORKS_SQL);
        String dateColumn = "COMPLETED".equals(f.dateBasis()) ? "completed_on" : "created_on";
        // По выполнению: незавершённая работа в отчёт не попадает вовсе — у неё
        // нет даты по выбранному основанию.
        if ("COMPLETED".equals(f.dateBasis())) sql.append(" AND completed_on IS NOT NULL ");
        if (f.from() != null) sql.append(" AND ").append(dateColumn).append(" >= :from ");
        if (f.to() != null) sql.append(" AND ").append(dateColumn).append(" <= :to ");
        if (f.workKind() != null && !f.workKind().isBlank()) sql.append(" AND kind = :workKind ");
        if (f.handover() != null && !f.handover().isBlank()) sql.append(" AND handover = :handover ");
        if (f.clientKind() != null && !f.clientKind().isBlank()) sql.append(" AND client_kind = :clientKind ");
        if (f.clientId() != null) sql.append(" AND client_id = :clientId ");
        if ("WITH".equals(f.contractMode())) sql.append(" AND contract_id IS NOT NULL ");
        if ("WITHOUT".equals(f.contractMode())) sql.append(" AND contract_id IS NULL ");
        if (f.contractKind() != null && !f.contractKind().isBlank()) sql.append(" AND contract_kind = :contractKind ");
        if (f.contractId() != null) sql.append(" AND contract_id = :contractId ");
        if (f.statuses() != null && !f.statuses().isEmpty()) sql.append(" AND status IN (:statuses) ");
        sql.append(" ORDER BY ").append(dateColumn).append(" DESC NULLS LAST, kind, id DESC");

        return jdbc.queryForList(sql.toString(), params);
    }

    /**
     * Затраты, учтённые в периоде. Расходы компании общие: к клиенту или
     * контракту они не привязаны, поэтому фильтры работ на них не действуют —
     * кроме прямых затрат на заказ, которые видно по alloc_order_id.
     */
    public List<Map<String, Object>> costs(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
            SELECT e.id, e.kind, e.entry_date::text AS entry_date, e.title, e.amount,
                   e.allocation, e.alloc_order_id, e.counterparty, c.name AS category_name
              FROM cost_entries e
              LEFT JOIN expense_categories c ON c.id = e.category_id
             WHERE (CAST(:from AS date) IS NULL OR e.entry_date >= :from)
               AND (CAST(:to AS date) IS NULL OR e.entry_date <= :to)
             ORDER BY e.entry_date DESC, e.id DESC
        """, new MapSqlParameterSource().addValue("from", from).addValue("to", to));
    }

    /** Начисления ФОТ периода — по дате начисления, а не по месяцу ведомости. */
    public List<Map<String, Object>> payroll(LocalDate from, LocalDate to) {
        return jdbc.queryForList("""
            SELECT p.id, p.year_month, p.entry_date::text AS entry_date, p.kind,
                   p.source_type, p.source_id, p.amount, p.details,
                   e.name AS employee_name
              FROM payroll_entries p
              JOIN employees e ON e.id = p.employee_id
             WHERE (CAST(:from AS date) IS NULL OR p.entry_date >= :from)
               AND (CAST(:to AS date) IS NULL OR p.entry_date <= :to)
             ORDER BY p.entry_date DESC, p.id DESC
        """, new MapSqlParameterSource().addValue("from", from).addValue("to", to));
    }

    /** Реестр контрактных юрлиц с реквизитами — отдельная выгрузка по ТЗ. */
    public List<Map<String, Object>> contractClients() {
        return jdbc.queryForList("""
            SELECT cl.id, cl.name, cl.inn, cl.address, cl.phone, cl.email,
                   cl.contact_person, cl.contact_person_phone,
                   COUNT(k.id) AS contracts_count,
                   COALESCE(SUM(k.planned_sqm), 0) AS planned_sqm
              FROM clients cl
              JOIN contracts k ON k.client_id = cl.id
             WHERE cl.client_type = 'LEGAL_ENTITY'
             GROUP BY cl.id
             ORDER BY cl.name COLLATE "C"
        """, Map.of());
    }

    /** Список контрактов с условиями и план-фактом — вторая отдельная выгрузка. */
    public List<Map<String, Object>> contractsWithPlanFact() {
        return jdbc.queryForList("""
            SELECT k.id, k.number, k.kind, cl.name AS client_name, cl.inn AS client_inn,
                   k.signed_on::text AS signed_on, k.expires_on::text AS expires_on,
                   k.planned_sqm, k.price_per_sqm, k.is_active,
                   COALESCE((SELECT SUM(i.area) FROM orders o
                               JOIN order_items i ON i.order_id = o.id
                              WHERE o.contract_id = k.id AND o.contract_delivered_at IS NOT NULL
                                AND i.status <> 'CANCELLED'), 0)
                 + COALESCE((SELECT SUM(c.area) FROM onsite_cleanings c
                              WHERE c.contract_id = k.id AND c.status = 'DONE'), 0) AS fact_sqm
              FROM contracts k
              JOIN clients cl ON cl.id = k.client_id
             ORDER BY k.signed_on DESC, k.id DESC
        """, Map.of());
    }
}
