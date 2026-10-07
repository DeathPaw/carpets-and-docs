package ru.carpet.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.repository.ContractRepository;
import ru.carpet.repository.OrderItemRepository;
import ru.carpet.service.AuditLogService;
import ru.carpet.service.OrderItemService;
import ru.carpet.service.OrderService;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Контракты юрлиц: условия, план-факт и связь с работами (ТЗ v2, блок 6).
 */
@RestController
@RequestMapping("/api/contracts")
public class ContractController {

    private final ContractRepository repository;
    private final OrderItemRepository orderItemRepository;
    private final OrderItemService orderItemService;
    private final OrderService orderService;
    private final AuditLogService auditLogService;

    public ContractController(ContractRepository repository,
                              OrderItemRepository orderItemRepository,
                              OrderItemService orderItemService,
                              OrderService orderService,
                              AuditLogService auditLogService) {
        this.repository = repository;
        this.orderItemRepository = orderItemRepository;
        this.orderItemService = orderItemService;
        this.orderService = orderService;
        this.auditLogService = auditLogService;
    }

    /**
     * Пересчёт заказа после привязки или отвязки контракта: услуги за м²
     * переходят на договорную ставку (и обратно на прайс при отвязке).
     * Остальные услуги и даты прайса не трогаем.
     */
    private void recalculateOrder(Long orderId) {
        orderItemRepository.findByOrderId(orderId)
                .forEach(item -> orderItemService.recalculateServicePrices(item.id(), false));
        orderService.recalculateTotalAmount(orderId);
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) Long clientId,
                                          @RequestParam(required = false) Boolean activeOnly) {
        return repository.findAll(clientId, activeOnly);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        var contract = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Контракт не найден: " + id));
        var result = new LinkedHashMap<>(contract);
        result.put("files", repository.files(id));
        result.put("plan_fact", planFact(id));
        return result;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        validate(body);
        Long id = repository.save(body, AuditUser.current());
        auditLogService.log("CONTRACT", id, "CREATE",
                "Контракт № " + body.get("number") + " на " + body.get("price_per_sqm") + " ₽/м²");
        return get(id);
    }

    @PutMapping("/{id}")
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        repository.findById(id).orElseThrow(() -> new EntityNotFoundException("Контракт не найден: " + id));
        validate(body);
        repository.update(id, body);
        // Ранее учтённые заказы не пересчитываем: у них своя зафиксированная цена.
        auditLogService.log("CONTRACT", id, "UPDATE",
                "Контракт № " + body.get("number") + " изменён; ранее учтённые заказы сохраняют прежнюю цену");
        return get(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        repository.delete(id);
        auditLogService.log("CONTRACT", id, "DELETE", "Контракт #" + id + " удалён");
    }

    // ---------------- план-факт ----------------

    @GetMapping("/{id}/plan-fact")
    public Map<String, Object> planFact(@PathVariable Long id) {
        var raw = repository.planFact(id);
        BigDecimal planned = decimal(raw.get("planned_sqm"));
        BigDecimal price = decimal(raw.get("price_per_sqm"));
        BigDecimal fact = decimal(raw.get("orders_sqm")).add(decimal(raw.get("onsite_sqm")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("planned_sqm", planned);
        result.put("fact_sqm", fact);
        result.put("remaining_sqm", planned.subtract(fact).max(BigDecimal.ZERO));
        result.put("over_sqm", fact.subtract(planned).max(BigDecimal.ZERO));
        // При нулевом плане процент не считаем — делить не на что.
        result.put("completion_percent", planned.signum() == 0 ? null
                : fact.multiply(BigDecimal.valueOf(100)).divide(planned, 1, RoundingMode.HALF_UP));
        result.put("planned_amount", planned.multiply(price));
        result.put("fact_amount", fact.multiply(price));
        result.put("works", repository.works(id));
        result.put("deliveries", repository.deliveries(id));
        return result;
    }

    // ---------------- связь с заказом ----------------

    /** Привязка заказа к контракту: договорная цена за метр фиксируется на заказе. */
    @PostMapping("/{id}/orders/{orderId}")
    public Map<String, Object> linkOrder(@PathVariable Long id, @PathVariable Long orderId) {
        var contract = repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Контракт не найден: " + id));
        BigDecimal price = decimal(contract.get("price_per_sqm"));
        repository.linkOrder(orderId, id, price);
        recalculateOrder(orderId);

        // ТЗ: предупреждаем о выходе за срок и за плановый объём, но не запрещаем —
        // решение остаётся за оператором.
        List<String> warnings = new java.util.ArrayList<>();
        LocalDate expires = contract.get("expires_on") == null
                ? null : LocalDate.parse(String.valueOf(contract.get("expires_on")));
        if (expires != null && LocalDate.now().isAfter(expires)) {
            warnings.add("Срок контракта истёк " + expires);
        }
        BigDecimal planned = decimal(contract.get("planned_sqm"));
        if (planned.signum() > 0) {
            var raw = repository.planFact(id);
            BigDecimal fact = decimal(raw.get("orders_sqm")).add(decimal(raw.get("onsite_sqm")));
            BigDecimal withOrder = fact.add(repository.orderSqm(orderId));
            if (withOrder.compareTo(planned) > 0) {
                warnings.add("С этим заказом объём превысит план на "
                        + withOrder.subtract(planned).stripTrailingZeros().toPlainString() + " м²");
            }
        }
        String warning = warnings.isEmpty() ? null : String.join(". ", warnings);

        auditLogService.log("ORDER", orderId, "UPDATE",
                "Заказ #" + String.format("%05d", orderId) + " привязан к контракту № " + contract.get("number")
                        + " по " + price.stripTrailingZeros().toPlainString() + " ₽/м²");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("price_per_sqm", price);
        if (warning != null) result.put("warning", warning);
        return result;
    }

    /** Отвязка заказа от контракта: метры перестают влиять на план-факт. */
    @DeleteMapping("/orders/{orderId}")
    public Map<String, Object> unlinkOrder(@PathVariable Long orderId) {
        repository.linkOrder(orderId, null, null);
        repository.setOrderDelivered(orderId, false);
        recalculateOrder(orderId);
        auditLogService.log("ORDER", orderId, "UPDATE",
                "Заказ #" + String.format("%05d", orderId) + " отвязан от контракта");
        return Map.of("ok", true);
    }

    /**
     * Сдача заказа по контракту. До сдачи метры в факт не идут, даже если
     * работа выполнена — так устроен приёмочный тест ТЗ.
     */
    @PostMapping("/{id}/orders/{orderId}/deliver")
    public Map<String, Object> deliverOrder(@PathVariable Long id, @PathVariable Long orderId,
                                            @RequestBody(required = false) Map<String, Object> body) {
        boolean delivered = body == null || !Boolean.FALSE.equals(body.get("delivered"));
        BigDecimal sqm = repository.orderSqm(orderId);
        repository.setOrderDelivered(orderId, delivered);
        repository.logDelivery(id, orderId, null, sqm,
                delivered ? "DELIVERED" : "CANCELLED",
                body == null ? null : (String) body.get("reason"), AuditUser.current());
        auditLogService.log("CONTRACT", id, delivered ? "UPDATE" : "STATUS_ROLLBACK",
                (delivered ? "Сдан" : "Отменена сдача") + " заказ #" + String.format("%05d", orderId)
                        + " на " + sqm.stripTrailingZeros().toPlainString() + " м²");
        return planFact(id);
    }

    // ---------------- файлы ----------------

    @PostMapping("/{id}/files")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> addFile(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String data = body.get("data");
        if (data == null || data.isBlank()) throw new BusinessRuleException("Пустой файл");
        Long fileId = repository.addFile(id, body.getOrDefault("filename", "договор"),
                body.getOrDefault("content_type", "application/octet-stream"), data);
        auditLogService.log("CONTRACT", id, "UPDATE", "К контракту #" + id + " прикреплён файл");
        return Map.of("id", fileId);
    }

    @GetMapping("/{id}/files/{fileId}")
    public ResponseEntity<byte[]> file(@PathVariable Long id, @PathVariable Long fileId) {
        var row = repository.file(id, fileId).orElse(null);
        if (row == null) return ResponseEntity.notFound().build();
        String data = String.valueOf(row.get("data"));
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        byte[] bytes;
        try {
            bytes = java.util.Base64.getDecoder().decode(data.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
        String contentType = row.get("content_type") == null
                ? "application/octet-stream" : String.valueOf(row.get("content_type"));
        return ResponseEntity.ok().header("Content-Type", contentType).body(bytes);
    }

    @DeleteMapping("/{id}/files/{fileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFile(@PathVariable Long id, @PathVariable Long fileId) {
        repository.deleteFile(id, fileId);
        auditLogService.log("CONTRACT", id, "UPDATE", "У контракта #" + id + " удалён файл");
    }

    private void validate(Map<String, Object> body) {
        if (body.get("client_id") == null) throw new BusinessRuleException("Выберите юрлицо");
        if (body.get("number") == null || String.valueOf(body.get("number")).isBlank()) {
            throw new BusinessRuleException("Укажите номер контракта");
        }
        if (body.get("signed_on") == null) throw new BusinessRuleException("Укажите дату заключения");
        if (body.get("price_per_sqm") == null) throw new BusinessRuleException("Укажите стоимость м²");
    }

    private static BigDecimal decimal(Object v) {
        if (v == null) return BigDecimal.ZERO;
        return v instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(v));
    }
}
