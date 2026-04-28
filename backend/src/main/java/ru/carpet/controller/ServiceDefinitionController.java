package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.ServiceDefinitionRequest;
import ru.carpet.model.ServiceDefinition;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.ServiceDefinitionService;

import java.util.List;

@RestController
@RequestMapping("/api/service-definitions")
public class ServiceDefinitionController {

    private final ServiceDefinitionService service;
    private final AuditLogService auditLogService;

    public ServiceDefinitionController(ServiceDefinitionService service, AuditLogService auditLogService) {
        this.service = service;
        this.auditLogService = auditLogService;
    }

    @GetMapping
    public List<ServiceDefinition> getAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceDefinition create(@Valid @RequestBody ServiceDefinitionRequest request) {
        ru.carpet.model.PricingType pricingType = ru.carpet.model.PricingType.valueOf(request.pricingType());
        ServiceDefinition sd = service.create(request.name(), request.basePrice(), pricingType);
        auditLogService.log("SERVICE_DEFINITION", sd.id(), "CREATE",
                "Создан шаблон услуги: " + sd.name() + " (" + sd.pricingType() + ", " + sd.basePrice() + "₽)");
        return sd;
    }

    @PutMapping("/{id}")
    public ServiceDefinition update(@PathVariable Long id, @Valid @RequestBody ServiceDefinitionRequest request) {
        ru.carpet.model.PricingType pricingType = ru.carpet.model.PricingType.valueOf(request.pricingType());
        ServiceDefinition sd = service.update(id, request.name(), request.basePrice(), pricingType);
        auditLogService.log("SERVICE_DEFINITION", id, "UPDATE",
                "Обновлён шаблон услуги: " + sd.name() + " (" + sd.pricingType() + ", " + sd.basePrice() + "₽)");
        return sd;
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        service.delete(id);
        auditLogService.log("SERVICE_DEFINITION", id, "DELETE", "Удалён шаблон услуги #" + id);
    }
}
