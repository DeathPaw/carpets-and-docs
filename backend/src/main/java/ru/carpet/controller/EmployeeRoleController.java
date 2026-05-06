package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.EmployeeRoleRequest;
import ru.carpet.model.EmployeeRole;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.EmployeeRoleService;

import java.util.List;

@RestController
@RequestMapping("/api/employee-roles")
public class EmployeeRoleController {

    private final EmployeeRoleService service;
    private final AuditLogService auditLogService;

    public EmployeeRoleController(EmployeeRoleService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<EmployeeRole> getAll() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public EmployeeRole getById(@PathVariable Long id) {
        return service.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeRole create(@Valid @RequestBody EmployeeRoleRequest request) {
        EmployeeRole role = service.create(request.name(), request.description(), request.itemTypeIds());
        auditLogService.log("EMPLOYEE_ROLE", role.id(), "CREATE", "Создана роль: " + role.name());
        return role;
    }

    @PutMapping("/{id}")
    public EmployeeRole update(@PathVariable Long id, @Valid @RequestBody EmployeeRoleRequest request) {
        EmployeeRole role = service.update(id, request.name(), request.description(), request.itemTypeIds());
        auditLogService.log("EMPLOYEE_ROLE", id, "UPDATE", "Обновлена роль: " + role.name());
        return role;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
        auditLogService.log("EMPLOYEE_ROLE", id, "DELETE", "Удалена роль #" + id);
    }
}
