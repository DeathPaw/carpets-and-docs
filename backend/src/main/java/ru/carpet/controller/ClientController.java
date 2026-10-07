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
import ru.carpet.repository.ClientAnalyticsRepository;
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
    /** V47: портрет клиентской базы и выгрузка (правки №1 и №2 от 13.09). */
    private final ClientAnalyticsRepository clientAnalyticsRepository;

    public ClientController(ClientRepository clientRepository, OrderRepository orderRepository,
                            AuditLogService auditLogService, ClientModifierService clientModifierService,
                            ClientEventRepository clientEventRepository,
                            ClientAnalyticsRepository clientAnalyticsRepository) {
        this.clientRepository = clientRepository;
        this.orderRepository = orderRepository;
        this.auditLogService = auditLogService;
        this.clientModifierService = clientModifierService;
        this.clientEventRepository = clientEventRepository;
        this.clientAnalyticsRepository = clientAnalyticsRepository;
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

    /**
     * V47 (правки №1 и №2 от 13.09): портрет клиентской базы.
     *
     * <p>Одна строка на клиента с агрегатами по заказам и скидками. Те же
     * фильтры используются выгрузкой в Excel — оператор сначала отбирает
     * сегмент (пенсионеры, постоянные, район), потом выгружает именно его.
     */
    @GetMapping("/analytics")
    public Map<String, Object> analytics(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) List<String> districts,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String restartStatus,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) String clientType,
            @RequestParam(required = false) Boolean onlyRegular,
            @RequestParam(required = false) Boolean withDiscount,
            @RequestParam(required = false) Integer minOrders,
            @RequestParam(required = false) String sortBy,
            @RequestParam(required = false) String sortDir,
            @RequestParam(defaultValue = "1000") int limit
    ) {
        var filters = new ClientAnalyticsRepository.Filters(search, districts, source, restartStatus,
                gender, clientType, onlyRegular, withDiscount, minOrders, sortBy, sortDir);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("summary", clientAnalyticsRepository.summary(filters));
        result.put("rows", clientAnalyticsRepository.rows(filters, Math.min(limit, 100000)));
        return result;
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
        // V46: маркетинговые поля пишем отдельным запросом — см. ClientRepository.updateMarketing.
        // V47: пол оператор обычно не указывает — предполагаем по отчеству/имени,
        // в карточке он виден и правится вручную.
        // У юрлица пола нет: «Балтийская Звезда» — не женщина, а отель.
        String gender = req.gender() != null && !req.gender().isBlank()
                ? req.gender()
                : ("LEGAL_ENTITY".equals(client.clientType())
                    ? null
                    : ru.carpet.service.GenderGuesser.guess(client.name(), client.firstName()));
        clientRepository.updateMarketing(client.id(), req.restartStatus(), req.source(), req.sourceNote(),
                gender, req.age());
        auditLogService.log("CLIENT", client.id(), "CREATE", "Создан клиент: " + client.name());
        return clientRepository.findById(client.id()).orElse(client);
    }

    @PutMapping("/{id}")
    public Client update(@PathVariable Long id, @Valid @RequestBody CreateClientRequest req) {
        Client before = clientRepository.findById(id)
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
        clientRepository.updateMarketing(id, req.restartStatus(), req.source(), req.sourceNote(),
                req.gender(), req.age());
        // V19 (#7): денормализованное orders.client_name автоматически не обновляется,
        // если оператор изменил имя клиента. Пробрасываем новое имя во все его заказы.
        if (!java.util.Objects.equals(before.name(), client.name())) {
            int updated = orderRepository.updateClientNameInOrders(id, client.name());
            if (updated > 0) {
                auditLogService.log("CLIENT", id, "RENAME_PROPAGATE",
                    "Имя клиента изменено: '" + before.name() + "' → '" + client.name()
                    + "', обновлено заказов: " + updated);
            }
        }
        auditLogService.log("CLIENT", id, "UPDATE", "Обновлён клиент: " + client.name());
        return clientRepository.findById(id).orElse(client);
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
