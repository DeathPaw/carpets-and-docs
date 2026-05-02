package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.repository.AnalyticsRepository;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsRepository repository;

    public AnalyticsController(AnalyticsRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/orders-by-district")
    public List<Map<String, Object>> ordersByDistrict() {
        return repository.ordersByDistrict();
    }

    @GetMapping("/orders-by-status")
    public List<Map<String, Object>> ordersByStatus() {
        return repository.ordersByStatus();
    }

    @GetMapping("/items-by-type")
    public List<Map<String, Object>> itemsByType() {
        return repository.itemsByType();
    }

    @GetMapping("/employee-stats")
    public List<Map<String, Object>> employeeStats() {
        return repository.employeeStats();
    }

    @GetMapping("/revenue-by-month")
    public List<Map<String, Object>> revenueByMonth() {
        return repository.revenueByMonth();
    }

    @GetMapping("/top-clients")
    public List<Map<String, Object>> topClients() {
        return repository.topClients();
    }

    @GetMapping("/margin")
    public List<Map<String, Object>> margin() {
        return repository.marginAnalysis();
    }

    @GetMapping("/warranty-stats")
    public List<Map<String, Object>> warrantyStats() {
        return repository.warrantyStats();
    }

    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        return repository.dashboard();
    }

    @GetMapping("/production-queue")
    public List<Map<String, Object>> productionQueue() {
        return repository.productionQueue();
    }
}
