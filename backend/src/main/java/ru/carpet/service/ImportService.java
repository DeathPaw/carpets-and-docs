package ru.carpet.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.carpet.audit.AuditUser;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.repository.ImportRepository;
import ru.carpet.service.ImportTemplates.Column;
import ru.carpet.service.ImportTemplates.Template;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Проверка и запись Excel-пакетов (ТЗ v2, блок 8).
 *
 * <p>Проверка и запись идут по одной схеме {@link ImportTemplates}: оператор
 * сначала видит, что будет создано, обновлено, что задвоено и где ошибки, и
 * только потом подтверждает сохранение. Пакет с ошибками не пишется.
 *
 * <p>Записи опознаются строго по внешнему ID. Отсутствие строки в файле ничего
 * не удаляет — это отдельное требование ТЗ.
 */
@Service
public class ImportService {

    private final ImportRepository repository;
    private final OrderService orderService;
    private final OrderItemService orderItemService;
    private final OrderItemServiceInstanceService serviceInstanceService;

    public ImportService(ImportRepository repository,
                         OrderService orderService,
                         OrderItemService orderItemService,
                         OrderItemServiceInstanceService serviceInstanceService) {
        this.repository = repository;
        this.orderService = orderService;
        this.orderItemService = orderItemService;
        this.serviceInstanceService = serviceInstanceService;
    }

    /** Проблема в конкретной ячейке: лист, строка файла, поле. */
    public record Issue(String sheet, int row, String field, String message) {}

    /** Что будет сделано со строкой (или группой строк одного заказа). */
    public record Change(int row, String externalId, String title, String note) {}

    public record Report(
            String kind,
            String templateVersion,
            int rowCount,
            List<Change> creates,
            List<Change> updates,
            List<Issue> duplicates,
            List<Issue> errors
    ) {
        public boolean ok() { return errors.isEmpty(); }
    }

    public record Batch(String kind, String version, List<String> columns,
                        List<Map<String, Object>> rows, String updateMode, String filename) {}

    // ---------------- проверка ----------------

    public Report validate(Batch batch) {
        Template template = template(batch.kind());
        List<Issue> errors = new ArrayList<>();
        List<Issue> duplicates = new ArrayList<>();
        List<Change> creates = new ArrayList<>();
        List<Change> updates = new ArrayList<>();

        // Версия и структура проверяются до строк: неподдерживаемый файл дальше
        // разбирать бессмысленно — в нём другие колонки.
        if (!ImportTemplates.VERSION.equals(batch.version())) {
            errors.add(new Issue(template.sheet(), 0, "версия",
                    "Шаблон версии «" + batch.version() + "» не поддерживается, нужна версия "
                            + ImportTemplates.VERSION + ". Скачайте актуальный шаблон."));
            return new Report(template.kind(), ImportTemplates.VERSION, 0, creates, updates, duplicates, errors);
        }
        List<String> expected = template.columns().stream().map(Column::key).toList();
        if (batch.columns() != null && !new HashSet<>(batch.columns()).containsAll(expected)) {
            var missing = new ArrayList<>(expected);
            missing.removeAll(batch.columns());
            errors.add(new Issue(template.sheet(), 0, String.join(", ", missing),
                    "В файле не хватает столбцов шаблона: " + String.join(", ", missing)));
            return new Report(template.kind(), ImportTemplates.VERSION, 0, creates, updates, duplicates, errors);
        }

        List<Map<String, Object>> rows = batch.rows() == null ? List.of() : batch.rows();
        if (rows.isEmpty()) {
            errors.add(new Issue(template.sheet(), 0, null, "В файле нет строк с данными"));
            return new Report(template.kind(), ImportTemplates.VERSION, 0, creates, updates, duplicates, errors);
        }

        // Типы, обязательность и допустимые значения — общие для всех видов.
        for (int i = 0; i < rows.size(); i++) {
            int lineNo = excelRow(i);
            var row = rows.get(i);
            for (Column c : template.columns()) {
                String value = str(row.get(c.key()));
                if (value == null) {
                    if (c.required()) {
                        errors.add(new Issue(template.sheet(), lineNo, c.title(), "Поле обязательно"));
                    }
                    continue;
                }
                switch (c.type()) {
                    case "DATE" -> {
                        try {
                            LocalDate.parse(normalizeDate(value));
                        } catch (DateTimeParseException e) {
                            errors.add(new Issue(template.sheet(), lineNo, c.title(),
                                    "Дата «" + value + "» не распознана, нужен формат ГГГГ-ММ-ДД"));
                        }
                    }
                    case "NUMBER" -> {
                        try {
                            new BigDecimal(value.replace(',', '.').replace(" ", ""));
                        } catch (NumberFormatException e) {
                            errors.add(new Issue(template.sheet(), lineNo, c.title(),
                                    "«" + value + "» — не число"));
                        }
                    }
                    case "ENUM" -> {
                        if (c.values() != null && !c.values().contains(value)) {
                            errors.add(new Issue(template.sheet(), lineNo, c.title(),
                                    "Допустимые значения: " + String.join(", ", c.values())));
                        }
                    }
                    default -> { /* TEXT — проверять нечего */ }
                }
            }
        }

        switch (template.kind()) {
            case "LEGAL_ENTITIES" -> validateSimple(template, rows, creates, updates, duplicates,
                    repository.clientIdsByExternal(externalIds(rows)), "name");
            case "CONTRACTS" -> validateContracts(template, rows, creates, updates, duplicates, errors);
            case "PRIVATE_ORDERS" -> validateOrders(template, rows, creates, updates, duplicates, errors);
            default -> throw new BusinessRuleException("Неизвестный вид импорта: " + template.kind());
        }

        return new Report(template.kind(), ImportTemplates.VERSION, rows.size(),
                creates, updates, duplicates, errors);
    }

    /** Юрлица: дубли внутри файла и разделение на создание/обновление. */
    private void validateSimple(Template template, List<Map<String, Object>> rows,
                                List<Change> creates, List<Change> updates, List<Issue> duplicates,
                                Map<String, Long> existing, String titleField) {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            int lineNo = excelRow(i);
            String ext = str(rows.get(i).get("external_id"));
            if (ext == null) continue;
            String title = String.valueOf(rows.get(i).getOrDefault(titleField, ext));
            if (!seen.add(ext)) {
                duplicates.add(new Issue(template.sheet(), lineNo, "Внешний ID",
                        "Внешний ID «" + ext + "» встречается в файле несколько раз"));
                continue;
            }
            if (existing.containsKey(ext)) {
                updates.add(new Change(lineNo, ext, title, "уже есть в системе"));
            } else {
                creates.add(new Change(lineNo, ext, title, null));
            }
        }
    }

    private void validateContracts(Template template, List<Map<String, Object>> rows,
                                   List<Change> creates, List<Change> updates,
                                   List<Issue> duplicates, List<Issue> errors) {
        validateSimple(template, rows, creates, updates, duplicates,
                repository.contractIdsByExternal(externalIds(rows)), "number");

        // Связь с юрлицом только по внешнему ID: похожее название не подбираем.
        var clientExternals = rows.stream().map(r -> str(r.get("client_external_id")))
                .filter(Objects::nonNull).distinct().toList();
        var known = repository.clientIdsByExternal(clientExternals);
        for (int i = 0; i < rows.size(); i++) {
            String ext = str(rows.get(i).get("client_external_id"));
            if (ext != null && !known.containsKey(ext)) {
                errors.add(new Issue(template.sheet(), excelRow(i), "Внешний ID юрлица",
                        "Юрлицо с внешним ID «" + ext + "» не найдено. Сначала загрузите юрлица."));
            }
        }
    }

    private void validateOrders(Template template, List<Map<String, Object>> rows,
                                List<Change> creates, List<Change> updates,
                                List<Issue> duplicates, List<Issue> errors) {
        var itemTypes = repository.itemTypeIdsByName();
        var skus = repository.skuIdsByName();
        var existing = repository.orderIdsByExternal(externalIds(rows));
        var knownClients = repository.clientIdsByExternal(rows.stream()
                .map(r -> str(r.get("client_external_id"))).filter(Objects::nonNull).distinct().toList());

        Set<String> seenOrders = new LinkedHashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            int lineNo = excelRow(i);
            var row = rows.get(i);
            String ext = str(row.get("external_id"));

            String itemType = str(row.get("item_type"));
            if (itemType != null && !itemTypes.containsKey(itemType)) {
                errors.add(new Issue(template.sheet(), lineNo, "Тип изделия",
                        "Тип «" + itemType + "» не найден в справочнике. Название должно совпадать точно."));
            }
            String services = str(row.get("services"));
            if (services != null) {
                for (String name : services.split(";")) {
                    String trimmed = name.trim();
                    if (!trimmed.isEmpty() && !skus.containsKey(trimmed)) {
                        errors.add(new Issue(template.sheet(), lineNo, "Услуги",
                                "Услуга «" + trimmed + "» не найдена в каталоге"));
                    }
                }
            }
            String clientExt = str(row.get("client_external_id"));
            if (clientExt != null && !knownClients.containsKey(clientExt)) {
                errors.add(new Issue(template.sheet(), lineNo, "Внешний ID клиента",
                        "Клиент с внешним ID «" + clientExt + "» не найден"));
            }

            if (ext == null || !seenOrders.add(ext)) continue;
            // Строки одного заказа — не дубль, а его позиции: считаем заказ один раз.
            String title = String.valueOf(row.getOrDefault("client_name", ext));
            if (existing.containsKey(ext)) {
                updates.add(new Change(lineNo, ext, title,
                        "заказ уже есть — обновим адрес и комментарий, позиции не трогаем"));
            } else {
                creates.add(new Change(lineNo, ext, title, null));
            }
        }
    }

    // ---------------- запись ----------------

    @Transactional
    public Map<String, Object> commit(Batch batch) {
        Report report = validate(batch);
        if (!report.ok()) {
            throw new BusinessRuleException("В пакете есть ошибки — исправьте файл и загрузите снова. "
                    + "Ошибок: " + report.errors().size());
        }
        String mode = "UPDATE".equals(batch.updateMode()) ? "UPDATE" : "SKIP";
        Template template = template(batch.kind());

        int created = 0, updated = 0, skipped = 0;
        switch (template.kind()) {
            case "LEGAL_ENTITIES" -> {
                var existing = repository.clientIdsByExternal(externalIds(batch.rows()));
                Set<String> done = new HashSet<>();
                for (var row : batch.rows()) {
                    String ext = str(row.get("external_id"));
                    if (ext == null || !done.add(ext)) continue;
                    Long id = existing.get(ext);
                    if (id == null) { repository.insertLegalEntity(row); created++; }
                    else if ("UPDATE".equals(mode)) { repository.updateLegalEntity(id, row); updated++; }
                    else skipped++;
                }
            }
            case "CONTRACTS" -> {
                var existing = repository.contractIdsByExternal(externalIds(batch.rows()));
                var clients = repository.clientIdsByExternal(batch.rows().stream()
                        .map(r -> str(r.get("client_external_id"))).filter(Objects::nonNull).distinct().toList());
                Set<String> done = new HashSet<>();
                for (var row : batch.rows()) {
                    String ext = str(row.get("external_id"));
                    if (ext == null || !done.add(ext)) continue;
                    Long clientId = clients.get(str(row.get("client_external_id")));
                    Long id = existing.get(ext);
                    if (id == null) { repository.insertContract(row, clientId, AuditUser.current()); created++; }
                    else if ("UPDATE".equals(mode)) { repository.updateContract(id, row, clientId); updated++; }
                    else skipped++;
                }
            }
            case "PRIVATE_ORDERS" -> {
                var counts = importOrders(batch.rows(), mode);
                created = counts[0]; updated = counts[1]; skipped = counts[2];
            }
            default -> throw new BusinessRuleException("Неизвестный вид импорта: " + template.kind());
        }

        Long batchId = repository.logBatch(template.kind(), ImportTemplates.VERSION, batch.filename(),
                mode, created, updated, skipped, AuditUser.current());
        return Map.of("batch_id", batchId, "created", created, "updated", updated, "skipped", skipped);
    }

    /**
     * Заказы: строки с одним внешним ID — позиции одного заказа.
     *
     * <p>Существующий заказ не пересобираем: позиции могли уже уйти в работу,
     * получить размеры и исполнителей. Обновляем только шапку — об этом сказано
     * в отчёте перед сохранением.
     */
    private int[] importOrders(List<Map<String, Object>> rows, String mode) {
        var existing = repository.orderIdsByExternal(externalIds(rows));
        var clients = repository.clientIdsByExternal(rows.stream()
                .map(r -> str(r.get("client_external_id"))).filter(Objects::nonNull).distinct().toList());
        var itemTypes = repository.itemTypeIdsByName();
        var skus = repository.skuIdsByName();

        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (var row : rows) {
            String ext = str(row.get("external_id"));
            if (ext != null) grouped.computeIfAbsent(ext, k -> new ArrayList<>()).add(row);
        }

        int created = 0, updated = 0, skipped = 0;
        for (var entry : grouped.entrySet()) {
            String ext = entry.getKey();
            var group = entry.getValue();
            var head = group.get(0);

            Long orderId = existing.get(ext);
            if (orderId != null) {
                if ("UPDATE".equals(mode)) { repository.updateOrderHeader(orderId, head); updated++; }
                else skipped++;
                continue;
            }

            Long clientId = clients.get(str(head.get("client_external_id")));
            if (clientId == null) clientId = repository.insertPrivateClient(head);

            var order = orderService.create(clientId, str(head.get("client_name")),
                    str(head.get("comment")), str(head.get("pickup_address")),
                    str(head.get("client_address")), null);
            repository.setOrderExternalId(order.id(), ext);
            LocalDate orderDate = LocalDate.parse(normalizeDate(str(head.get("order_date"))));
            repository.setOrderDate(order.id(), orderDate);

            for (var row : group) {
                Long typeId = itemTypes.get(str(row.get("item_type")));
                if (typeId == null) continue;
                var item = orderItemService.addItem(order.id(), typeId, str(row.get("description")));
                BigDecimal area = decimal(row.get("area"));
                BigDecimal weight = decimal(row.get("weight"));
                if (area != null || weight != null) {
                    orderItemService.updateDimensions(item.id(), null, null, weight, area, null);
                }
                String services = str(row.get("services"));
                if (services != null) {
                    for (String name : services.split(";")) {
                        Long skuId = skus.get(name.trim());
                        if (skuId != null) serviceInstanceService.addService(item.id(), skuId);
                    }
                }
            }
            created++;
        }
        return new int[]{created, updated, skipped};
    }

    public List<Map<String, Object>> batches(int limit) {
        return repository.batches(limit);
    }

    // ---------------- вспомогательное ----------------

    private static Template template(String kind) {
        Template t = ImportTemplates.ALL.get(kind);
        if (t == null) throw new BusinessRuleException("Неизвестный вид импорта: " + kind);
        return t;
    }

    private static List<String> externalIds(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> str(r.get("external_id"))).filter(Objects::nonNull).distinct().toList();
    }

    /** Номер строки в файле: первая строка — шапка, данные идут со второй. */
    private static int excelRow(int index) {
        return index + 2;
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** Excel любит отдавать дату как «2026-02-01T00:00:00» — берём только дату. */
    private static String normalizeDate(String value) {
        if (value == null) return null;
        int t = value.indexOf('T');
        return t > 0 ? value.substring(0, t) : value;
    }

    private static BigDecimal decimal(Object v) {
        String s = str(v);
        return s == null ? null : new BigDecimal(s.replace(',', '.').replace(" ", ""));
    }
}
