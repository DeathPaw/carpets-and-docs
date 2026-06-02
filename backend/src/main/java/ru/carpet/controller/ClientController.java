package ru.carpet.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import ru.carpet.dto.CreateClientRequest;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.model.Client;
import ru.carpet.model.ClientEvent;
import ru.carpet.model.Order;
import ru.carpet.model.PriceModifier;
import ru.carpet.repository.ClientEventRepository;
import ru.carpet.repository.ClientRepository;
import ru.carpet.repository.OrderRepository;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.ClientModifierService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final ClientRepository clientRepository;
    private final OrderRepository orderRepository;
    private final AuditLogService auditLogService;
    private final ClientModifierService clientModifierService;
    private final ClientEventRepository clientEventRepository;

    public ClientController(ClientRepository clientRepository, OrderRepository orderRepository,
                            AuditLogService auditLogService, ClientModifierService clientModifierService,
                            ClientEventRepository clientEventRepository) {
        this.clientRepository = clientRepository;
        this.orderRepository = orderRepository;
        this.auditLogService = auditLogService;
        this.clientModifierService = clientModifierService;
        this.clientEventRepository = clientEventRepository;
    }

    @GetMapping
    public List<Client> getAll() {
        return clientRepository.findAll();
    }

    @GetMapping("/search")
    public List<Client> search(@RequestParam String q) {
        return clientRepository.search(q);
    }

    @GetMapping("/{id}")
    public Client getById(@PathVariable Long id) {
        return clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found: " + id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Client create(@Valid @RequestBody CreateClientRequest req) {
        Client client = clientRepository.save(
                req.clientType(), req.name(), req.firstName(), req.lastName(),
                req.phone(), req.extraPhone(), req.address(), req.apartment(), req.district(),
                req.inn(), req.contactPerson(), req.contactPersonPhone(), req.comment(),
                req.isPensioner() != null && req.isPensioner(),
                req.isProblem() != null && req.isProblem(),
                req.isRegular() != null && req.isRegular(),
                req.lat(), req.lon()
        );
        auditLogService.log("CLIENT", client.id(), "CREATE", "Создан клиент: " + client.name());
        return client;
    }

    @PutMapping("/{id}")
    public Client update(@PathVariable Long id, @Valid @RequestBody CreateClientRequest req) {
        clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found: " + id));
        Client client = clientRepository.update(
                id, req.clientType(), req.name(), req.firstName(), req.lastName(),
                req.phone(), req.extraPhone(), req.address(), req.apartment(), req.district(),
                req.inn(), req.contactPerson(), req.contactPersonPhone(), req.comment(),
                req.isPensioner() != null && req.isPensioner(),
                req.isProblem() != null && req.isProblem(),
                req.isRegular() != null && req.isRegular(),
                req.lat(), req.lon()
        );
        auditLogService.log("CLIENT", id, "UPDATE", "Обновлён клиент: " + client.name());
        return client;
    }

    @GetMapping("/{id}/orders")
    public List<Order> getClientOrders(@PathVariable Long id) {
        clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found: " + id));
        return orderRepository.findByClientId(id);
    }

    @GetMapping("/{id}/modifiers")
    public List<PriceModifier> getClientModifiers(@PathVariable Long id) {
        return clientModifierService.getModifiers(id);
    }

    @PostMapping("/{id}/modifiers")
    public void addClientModifier(@PathVariable Long id, @RequestBody Map<String, Long> body) {
        clientModifierService.addModifier(id, body.get("modifier_id"));
    }

    @DeleteMapping("/{id}/modifiers/{modifierId}")
    public void removeClientModifier(@PathVariable Long id, @PathVariable Long modifierId) {
        clientModifierService.removeModifier(id, modifierId);
    }

    @GetMapping("/{id}/events")
    public List<ClientEvent> getClientEvents(@PathVariable Long id) {
        clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found: " + id));
        return clientEventRepository.findByClientId(id);
    }

    @PostMapping("/{id}/events")
    @ResponseStatus(HttpStatus.CREATED)
    public ClientEvent addClientEvent(@PathVariable Long id, @RequestBody Map<String, String> body) {
        clientRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Client not found: " + id));
        return clientEventRepository.save(id, body.get("event_type"), body.get("description"));
    }
}
