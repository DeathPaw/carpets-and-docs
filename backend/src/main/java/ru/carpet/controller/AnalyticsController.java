package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.AnalyticsDto;
import ru.carpet.repository.AnalyticsRepository;
import ru.carpet.repository.DashboardRepository;
import ru.carpet.repository.ProductionRepository;
import ru.carpet.repository.ProfitabilityRepository;

import java.util.List;
import java.util.Map;

/**
 * Аналитические эндпоинты — на чтение, без бизнес-логики.
 *
 * <p>Раньше всё возвращалось как {@code List<Map<String,Object>>} — нет типобезопасности,
 * Swagger не мог документировать схему. Теперь — типизированные record DTO из {@link AnalyticsDto},
 * Jackson сериализует их в snake_case согласно глобальной конфигурации.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsRepository repository;
    private final DashboardRepository dashboardRepository;
    private final ProductionRepository productionRepository;
    private final ProfitabilityRepository profitabilityRepository;

    public AnalyticsController(AnalyticsRepository repository,
                               DashboardRepository dashboardRepository,
                               ProductionRepository productionRepository,
                               ProfitabilityRepository profitabilityRepository) {
        this.repository = repository;
        this.dashboardRepository = dashboardRepository;
        this.productionRepository = productionRepository;
        this.profitabilityRepository = profitabilityRepository;
    }

    @GetMapping("/orders-by-district")
    public List<AnalyticsDto.DistrictCount> ordersByDistrict(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.ordersByDistrict(dateFrom, dateTo);
    }

    @GetMapping("/orders-by-status")
    public List<AnalyticsDto.StatusCount> ordersByStatus(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.ordersByStatus(dateFrom, dateTo);
    }

    @GetMapping("/items-by-type")
    public List<AnalyticsDto.TypeCount> itemsByType(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.itemsByType(dateFrom, dateTo);
    }

    @GetMapping("/employee-stats")
    public List<AnalyticsDto.EmployeeStat> employeeStats(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.employeeStats(dateFrom, dateTo);
    }

    @GetMapping("/revenue-by-month")
    public List<AnalyticsDto.MonthRevenue> revenueByMonth(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.revenueByMonth(dateFrom, dateTo);
    }

    @GetMapping("/top-clients")
    public List<AnalyticsDto.TopClient> topClients(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.topClients(dateFrom, dateTo);
    }

    @GetMapping("/margin")
    public List<AnalyticsDto.MarginRow> margin(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.marginAnalysis(dateFrom, dateTo);
    }

    @GetMapping("/warranty-stats")
    public List<AnalyticsDto.WarrantyStat> warrantyStats(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return repository.warrantyStats(dateFrom, dateTo);
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        // Дашборд намеренно остаётся плоским Map — набор виджетов меняется чаще,
        // чем DTO успевал бы переписываться, и фронт TS-сторого типизирован.
        return dashboardRepository.dashboard();
    }

    /**
     * Детальные карточки проблемных заказов (Спринт B, замечание Миши 11 мая:
     * «вместо квадратиков с цифрами выводи списки с деталями, ты на этом
     * пространстве спокойно поместишь 4 карточки и провалишься в один клик»).
     *
     * Frontend опрашивает каждую минуту (см. autorefresh в DashboardPage).
     */
    @GetMapping("/dashboard/problems")
    public Map<String, Object> dashboardProblems() {
        return dashboardRepository.problemOrders(5);
    }

    @GetMapping("/production-queue")
    public List<AnalyticsDto.ProductionQueueOrder> productionQueue() {
        return productionRepository.productionQueue();
    }

    @GetMapping("/production-queue-items")
    public List<AnalyticsDto.ProductionQueueItem> productionQueueItems() {
        return productionRepository.productionQueueItems();
    }

    @GetMapping("/production-queue-services")
    public List<AnalyticsDto.ProductionQueueService> productionQueueServices() {
        return productionRepository.productionQueueServices();
    }

    // ────────── Доходность ──────────
    @GetMapping("/profit/by-item-type")
    public List<AnalyticsDto.ProfitByItemType> profitByItemType(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return profitabilityRepository.profitByItemType(dateFrom, dateTo);
    }

    @GetMapping("/profit/by-client")
    public List<AnalyticsDto.ProfitByClient> profitByClient(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return profitabilityRepository.profitByClient(dateFrom, dateTo);
    }

    @GetMapping("/profit/by-employee")
    public List<AnalyticsDto.ProfitByEmployee> profitByEmployee(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return profitabilityRepository.profitByEmployee(dateFrom, dateTo);
    }

    @GetMapping("/profit/by-employee/{employeeId}/services")
    public List<AnalyticsDto.ProfitByEmployeeService> profitByEmployeeServices(
            @PathVariable Long employeeId,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return profitabilityRepository.profitByEmployeeServices(employeeId, dateFrom, dateTo);
    }

    @GetMapping("/profit/by-district")
    public List<AnalyticsDto.ProfitByDistrict> profitByDistrict(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo) {
        return profitabilityRepository.profitByDistrict(dateFrom, dateTo);
    }

    @GetMapping("/profit/by-order")
    public List<AnalyticsDto.ProfitByOrder> profitByOrder(
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) Long clientId) {
        return profitabilityRepository.profitByOrder(dateFrom, dateTo, clientId);
    }
}
