package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.repository.ReportRepository;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Отчёты по работам, затратам и ФОТ (ТЗ v2, блок 7).
 *
 * <p>Показатели считаются поверх тех же строк, которые отдаются на раскрытие,
 * поэтому «итог» и «что в него вошло» не могут разойтись.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final ReportRepository repository;

    public ReportController(ReportRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/works")
    public Map<String, Object> works(
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to,
            @RequestParam(defaultValue = "CREATED") String dateBasis,
            @RequestParam(required = false) String workKind,
            @RequestParam(required = false) String handover,
            @RequestParam(required = false) String clientKind,
            @RequestParam(required = false) Long clientId,
            @RequestParam(required = false) String contractMode,
            @RequestParam(required = false) String contractKind,
            @RequestParam(required = false) Long contractId,
            @RequestParam(required = false) List<String> statuses
    ) {
        var filters = new ReportRepository.Filters(from, to, dateBasis, workKind, handover,
                clientKind, clientId, contractMode, contractKind, contractId, statuses);
        List<Map<String, Object>> rows = repository.works(filters);
        List<Map<String, Object>> costs = repository.costs(from, to);
        List<Map<String, Object>> payroll = repository.payroll(from, to);

        BigDecimal area = sum(rows, "area");
        BigDecimal amount = sum(rows, "amount");
        BigDecimal costsTotal = sum(costs, "amount");
        BigDecimal payrollTotal = sum(payroll, "amount");
        // Прямые затраты на отобранные заказы — единственная часть расходов,
        // которая связана с конкретной работой и потому фильтруется вместе с ней.
        var orderIds = rows.stream()
                .filter(r -> "ORDER".equals(r.get("kind")))
                .map(r -> ((Number) r.get("id")).longValue())
                .collect(java.util.stream.Collectors.toSet());
        BigDecimal directCosts = costs.stream()
                .filter(c -> c.get("alloc_order_id") != null
                        && orderIds.contains(((Number) c.get("alloc_order_id")).longValue()))
                .map(c -> decimal(c.get("amount")))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("works_count", rows.size());
        summary.put("orders_count", rows.stream().filter(r -> "ORDER".equals(r.get("kind"))).count());
        summary.put("onsite_count", rows.stream().filter(r -> "ONSITE".equals(r.get("kind"))).count());
        summary.put("area_sqm", area);
        summary.put("work_amount", amount);
        summary.put("costs_total", costsTotal);
        summary.put("direct_costs", directCosts);
        summary.put("payroll_total", payrollTotal);
        // Себестоимость метра по отобранным работам — справочно: расходы за период
        // целиком, а метры только отобранные, поэтому при узком фильтре цифра растёт.
        summary.put("cost_per_sqm", area.signum() == 0 ? null
                : costsTotal.add(payrollTotal).divide(area, 2, RoundingMode.HALF_UP));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("rows", rows);
        result.put("costs", costs);
        result.put("payroll", payroll);
        return result;
    }

    /** Реестр контрактных юрлиц — отдельная выгрузка по ТЗ. */
    @GetMapping("/contract-clients")
    public List<Map<String, Object>> contractClients() {
        return repository.contractClients();
    }

    /** Контракты с условиями и план-фактом — вторая отдельная выгрузка. */
    @GetMapping("/contracts")
    public List<Map<String, Object>> contracts() {
        return repository.contractsWithPlanFact().stream().map(row -> {
            var out = new LinkedHashMap<>(row);
            BigDecimal planned = decimal(row.get("planned_sqm"));
            BigDecimal fact = decimal(row.get("fact_sqm"));
            BigDecimal price = decimal(row.get("price_per_sqm"));
            out.put("remaining_sqm", planned.subtract(fact).max(BigDecimal.ZERO));
            out.put("over_sqm", fact.subtract(planned).max(BigDecimal.ZERO));
            out.put("completion_percent", planned.signum() == 0 ? null
                    : fact.multiply(BigDecimal.valueOf(100)).divide(planned, 1, RoundingMode.HALF_UP));
            out.put("planned_amount", planned.multiply(price));
            out.put("fact_amount", fact.multiply(price));
            return (Map<String, Object>) out;
        }).toList();
    }

    private static BigDecimal sum(List<Map<String, Object>> rows, String field) {
        return rows.stream().map(r -> decimal(r.get(field))).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal decimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        return v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v));
    }
}
