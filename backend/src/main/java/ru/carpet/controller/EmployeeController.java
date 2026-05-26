package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.EmployeeRequest;
import ru.carpet.model.Employee;
import ru.carpet.model.OrderItemServiceInstance;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.EmployeeService;
import ru.carpet.service.OrderItemServiceInstanceService;

import java.util.List;

@RestController
@RequestMapping("/api/employees")
public class EmployeeController {

    private final EmployeeService service;
    private final OrderItemServiceInstanceService serviceInstanceService;
    private final AuditLogService auditLogService;

    public EmployeeController(EmployeeService service, OrderItemServiceInstanceService serviceInstanceService, AuditLogService auditLogService) {
        this.service = service;
        this.serviceInstanceService = serviceInstanceService;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<Employee> getAll(@RequestParam(required = false) Boolean includeInactive) {
        if (Boolean.TRUE.equals(includeInactive)) {
            return service.findAll();
        }
        return service.findAllActive();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Employee create(@Valid @RequestBody EmployeeRequest request) {
        Employee emp = service.create(request.name(), request.phone(), request.email(), request.roleId());
        auditLogService.log("EMPLOYEE", emp.id(), "CREATE", "Создан сотрудник: " + emp.name());
        return emp;
    }

    @PutMapping("/{id}")
    public Employee update(@PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        Employee emp = service.update(id, request.name(), request.phone(), request.email(), request.roleId());
        auditLogService.log("EMPLOYEE", id, "UPDATE", "Обновлён сотрудник: " + emp.name());
        return emp;
    }

    /**
     * Сотрудники, способные выполнять услуги для указанного типа позиции.
     * Используется в форме «Назначить исполнителей»: фильтрует по роли,
     * чтобы оператор не мог выбрать «Васю-чистильщика» на стирку тюлей.
     */
    @GetMapping("/suitable-for")
    public List<Employee> suitableFor(@RequestParam Long itemTypeId) {
        return service.findSuitableForItemType(itemTypeId);
    }

    /** Кандидаты в водители/логисты — у кого в роли есть хоть один default item_type. */
    @GetMapping("/drivers")
    public List<Employee> drivers() {
        return service.findDrivers();
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivateViaDelete(@PathVariable Long id) {
        service.deactivate(id);
        auditLogService.log("EMPLOYEE", id, "DEACTIVATE", "Деактивирован сотрудник #" + id);
    }

    @PatchMapping("/{id}/deactivate")
    public Employee deactivate(@PathVariable Long id) {
        service.deactivate(id);
        auditLogService.log("EMPLOYEE", id, "DEACTIVATE", "Деактивирован сотрудник #" + id);
        return service.findById(id);
    }

    @PatchMapping("/{id}/activate")
    public Employee activate(@PathVariable Long id) {
        service.activate(id);
        auditLogService.log("EMPLOYEE", id, "ACTIVATE", "Активирован сотрудник #" + id);
        return service.findById(id);
    }

    @GetMapping("/{id}/services")
    public List<OrderItemServiceInstance> getEmployeeServices(
            @PathVariable Long id,
            @RequestParam(required = false) String status,
            // V7: фильтр по диапазону дат для карточки сотрудника на странице Аналитика.
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo
    ) {
        return serviceInstanceService.findByEmployeeId(id, status, dateFrom, dateTo);
    }

    @GetMapping("/{id}/earnings")
    public java.math.BigDecimal getEmployeeEarnings(
            @PathVariable Long id,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo
    ) {
        return serviceInstanceService.sumPriceByEmployeeId(id, status, dateFrom, dateTo);
    }
}
