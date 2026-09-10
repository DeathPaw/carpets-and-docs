package ru.carpet.controller;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.exception.EntityNotFoundException;
import ru.carpet.service.AuditLogService;

import java.util.List;
import java.util.Map;

/**
 * V39: реквизиты для печатных форм (правка №6 от 09.09).
 *
 * <p>Одна запись на всю систему. Меняется в Справочниках и сразу попадает во все
 * документы: накладные, пустые бланки, маршрутный лист.
 *
 * <p>Читать реквизиты нужно и кабинету водителя — он печатает накладные сам и
 * ходит под {@code /api/worker/**} без Basic Auth. Поэтому у GET два пути. Там
 * только то, что и так печатается для клиента, — отдавать это без логина не страшно.
 */
@RestController
public class CompanySettingsController {

    private static final String COLS =
        "brand_name, tagline, subtitle, header_address, executor, legal_address, phones, logo_data";

    /** Логотип лежит data-URL'ом прямо в строке: 1,4 млн символов base64 ≈ 1 МБ файла. */
    private static final int MAX_LOGO_LENGTH = 1_400_000;

    private final NamedParameterJdbcTemplate jdbc;
    private final AuditLogService auditLogService;

    public CompanySettingsController(NamedParameterJdbcTemplate jdbc, AuditLogService auditLogService) {
        this.jdbc = jdbc;
        this.auditLogService = auditLogService;
    }

    @GetMapping({"/api/company-settings", "/api/worker/company-settings"})
    public Map<String, Object> get() {
        List<Map<String, Object>> rows =
            jdbc.queryForList("SELECT " + COLS + " FROM company_settings WHERE id = 1", Map.of());
        if (rows.isEmpty()) {
            throw new EntityNotFoundException("Реквизиты для печатных форм не заполнены");
        }
        return rows.get(0);
    }

    @PutMapping("/api/company-settings")
    public Map<String, Object> update(@RequestBody Map<String, Object> body) {
        String brand = text(body, "brand_name");
        if (brand == null) {
            throw new BusinessRuleException("Укажите название — оно печатается крупно в шапке документов");
        }
        String logo = text(body, "logo_data");
        if (logo != null) {
            if (!logo.startsWith("data:image/")) {
                throw new BusinessRuleException("Логотип должен быть картинкой: PNG, JPG или SVG");
            }
            if (logo.length() > MAX_LOGO_LENGTH) {
                throw new BusinessRuleException("Файл логотипа слишком большой — нужен до 1 МБ");
            }
        }
        var p = new MapSqlParameterSource()
            .addValue("brand", brand)
            .addValue("tagline", text(body, "tagline"))
            .addValue("subtitle", text(body, "subtitle"))
            .addValue("headerAddress", text(body, "header_address"))
            .addValue("executor", text(body, "executor"))
            .addValue("legalAddress", text(body, "legal_address"))
            .addValue("phones", text(body, "phones"))
            .addValue("logo", logo);
        // Upsert: если строку когда-нибудь удалят руками, сохранение её вернёт,
        // а не молча обновит ноль записей.
        jdbc.update("""
            INSERT INTO company_settings
                (id, brand_name, tagline, subtitle, header_address, executor, legal_address, phones, logo_data, updated_at)
            VALUES
                (1, :brand, :tagline, :subtitle, :headerAddress, :executor, :legalAddress, :phones, :logo, NOW())
            ON CONFLICT (id) DO UPDATE SET
                brand_name     = EXCLUDED.brand_name,
                tagline        = EXCLUDED.tagline,
                subtitle       = EXCLUDED.subtitle,
                header_address = EXCLUDED.header_address,
                executor       = EXCLUDED.executor,
                legal_address  = EXCLUDED.legal_address,
                phones         = EXCLUDED.phones,
                logo_data      = EXCLUDED.logo_data,
                updated_at     = NOW()
            """, p);
        auditLogService.log("SETTINGS", 1L, "UPDATE", "Изменены реквизиты печатных форм");
        return get();
    }

    /** Пустая строка — то же, что «не задано»: в печати не должно быть пустых подписей. */
    private static String text(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s;
    }
}
