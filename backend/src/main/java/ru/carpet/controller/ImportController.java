package ru.carpet.controller;

import org.springframework.web.bind.annotation.*;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.service.ImportService;
import ru.carpet.service.ImportTemplates;

import java.util.List;
import java.util.Map;

/**
 * Обмен через Excel (ТЗ v2, блок 8).
 *
 * <p>Шаблон, проверка и запись идут по одной схеме: описание шаблона отдаётся
 * наружу, и по нему же фронт строит файл. Схема проверки одна и для оператора,
 * и для загрузки разработчиком.
 */
@RestController
@RequestMapping("/api/import")
public class ImportController {

    private final ImportService service;

    public ImportController(ImportService service) {
        this.service = service;
    }

    /** Описания всех шаблонов — по ним фронт рисует .xlsx для скачивания. */
    @GetMapping("/templates")
    public List<ImportTemplates.Template> templates() {
        return List.of(ImportTemplates.PRIVATE_ORDERS, ImportTemplates.LEGAL_ENTITIES, ImportTemplates.CONTRACTS);
    }

    @GetMapping("/templates/{kind}")
    public ImportTemplates.Template template(@PathVariable String kind) {
        var template = ImportTemplates.ALL.get(kind);
        if (template == null) throw new EntityNotFoundException("Шаблон не найден: " + kind);
        return template;
    }

    /** Проверка без записи: что создастся, что обновится, где дубли и ошибки. */
    @PostMapping("/{kind}/validate")
    public ImportService.Report validate(@PathVariable String kind, @RequestBody Map<String, Object> body) {
        return service.validate(batch(kind, body));
    }

    /** Запись подтверждённого пакета. Пакет с ошибками не сохраняется. */
    @PostMapping("/{kind}/commit")
    public Map<String, Object> commit(@PathVariable String kind, @RequestBody Map<String, Object> body) {
        return service.commit(batch(kind, body));
    }

    @GetMapping("/batches")
    public List<Map<String, Object>> batches(@RequestParam(defaultValue = "20") int limit) {
        return service.batches(Math.min(limit, 200));
    }

    @SuppressWarnings("unchecked")
    private ImportService.Batch batch(String kind, Map<String, Object> body) {
        return new ImportService.Batch(
                kind,
                String.valueOf(body.getOrDefault("version", "")),
                (List<String>) body.get("columns"),
                (List<Map<String, Object>>) body.getOrDefault("rows", List.of()),
                (String) body.getOrDefault("update_mode", "SKIP"),
                (String) body.get("filename")
        );
    }
}
