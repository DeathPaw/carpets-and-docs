package ru.carpet.training;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Сидер тренажёрного стенда.
 *
 * Активируется только в Spring-профиле `training` и при старте приложения:
 *   1. Полностью очищает БД (TRUNCATE с RESTART IDENTITY).
 *   2. Заливает «жирный» набор демо-данных, чтобы можно было показать ВЕСЬ
 *      функционал — особенно аналитику и логистику:
 *        — несколько клиентов разных типов (физлица + организация),
 *        — три-четыре сотрудника с ролями,
 *        — типы позиций (включая default — доставка/приём),
 *        — услуги: фиксированные, по площади, по весу,
 *        — прайс-лист с активными пересечениями,
 *        — десяток заказов в разных статусах (LEAD → DELIVERED) с реальными
 *          датами, чтобы графики «выручка по месяцам», «топ клиентов»,
 *          «производительность сотрудников» сразу выглядели наполненными.
 *
 * Тот же класс используется ручкой POST /api/training/reset, чтобы оператор
 * мог одним кликом вернуть тренажёр в исходное состояние.
 */
@Component
@Profile("training")
public class TrainingDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(TrainingDataSeeder.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final Random random = new Random(42); // фиксированный seed — стабильные демо-данные

    public TrainingDataSeeder(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        log.warn("=== TRAINING MODE: пересоздаю демо-данные ===");
        reset();
        log.warn("=== TRAINING MODE: демо-данные готовы. Порт 8081 ===");
    }

    /**
     * Полный сброс: чистим всё и заливаем заново. Вызывается на старте
     * и из TrainingController.reset() (кнопка «Начать заново» во фронте).
     */
    public synchronized void reset() {
        truncateAll();
        seedDistricts();
        var typeIds = seedItemTypes();
        var roleIds = seedRoles(typeIds);
        var employeeIds = seedEmployees(roleIds);
        var clientIds = seedClients();
        // V10: SKU-каталог вместо service_definitions × price_list.
        var groupIds = seedSkuGroups();
        var skuIds = seedSkus(groupIds, typeIds);
        // Заказы с привязкой к SKU и водитель с разными интервалами на сегодня.
        seedOrdersWithSkus(typeIds, skuIds, employeeIds, clientIds);
        seedLogisticsWave(typeIds, skuIds, employeeIds, clientIds);
        // V11: web-юзера тоже надо создать, иначе войти не получится
        // (после V11 авторизация ходит в таблицу users, а не в app.admin.* конфиг).
        seedUsers();
    }

    /**
     * V11: создаём минимум 1 web-юзера для входа. Логин/пароль = admin/foxy
     * (как заявлено в application-training.yml и в README). Пароль — BCrypt-хэш.
     */
    private void seedUsers() {
        // Хэш для пароля "foxy" (BCrypt cost 10). Совпадает с V12 продакшен-сидом.
        String foxyHash = "$2b$10$ZacUBGv.2FKv5o8f3FTc4OrUV1l0zWwRJ7f0jQiOd7u1CTw73XEBq";
        jdbc.update("""
            INSERT INTO users (username, password_hash, display_name, role, is_active)
            VALUES ('admin', :h, 'Администратор тренажёра', 'SUPERVISOR', TRUE)
            ON CONFLICT (username) DO NOTHING
        """, Map.of("h", foxyHash));
    }

    // ---------- SKU-каталог (V10) ----------

    /** Возвращает map имя_группы → id. */
    private Map<String, Long> seedSkuGroups() {
        Map<String, Long> ids = new HashMap<>();
        int order = 10;
        for (String name : new String[]{"Чистка", "Стирка", "Реставрация", "Доставка", "Приём"}) {
            Long id = jdbc.queryForObject(
                "INSERT INTO sku_groups(name, sort_order) VALUES (:n, :s) RETURNING id",
                Map.of("n", name, "s", order), Long.class);
            ids.put(name, id);
            order += 10;
        }
        return ids;
    }

    /**
     * Создаёт SKU + sku_attributes + версию №1 каждого.
     * Возвращает map «осмысленное имя» → sku_id для последующего использования
     * в заказах. EAV-атрибуты задаются явно через {@link #insertSku}.
     */
    private Map<String, Long> seedSkus(Map<String, Long> groups, Map<String, Long> types) {
        Map<String, Long> ids = new HashMap<>();
        // Чистка ковров по площади
        ids.put("Чистка ковра",
            insertSku(groups.get("Чистка"), "Чистка ковра", "BY_AREA",
                new BigDecimal("450"), new BigDecimal("180"),
                false, null,
                attr("item_type", String.valueOf(types.get("Ковёр")),
                     String.valueOf(types.get("Палас")),
                     String.valueOf(types.get("Покрывало")))));
        // Реставрация — фикс
        ids.put("Реставрация ковра",
            insertSku(groups.get("Реставрация"), "Реставрация ковра", "FIXED",
                new BigDecimal("3500"), new BigDecimal("1200"),
                false, null,
                attr("item_type", String.valueOf(types.get("Ковёр")))));
        // Стирка штор по весу
        ids.put("Стирка штор",
            insertSku(groups.get("Стирка"), "Стирка штор", "BY_WEIGHT",
                new BigDecimal("280"), new BigDecimal("110"),
                false, null,
                attr("item_type", String.valueOf(types.get("Шторы")))));
        // V18: Доставка теперь = 2 SKU (забор + отвоз), оба auto-add.
        // «Доставка (забор)»  — триггерит заказ в IN_PROGRESS при DONE → попадает в позицию «Забор».
        // «Доставка (отвоз)» — триггерит заказ в DELIVERED при DONE → попадает в позицию «Отвоз».
        ids.put("Доставка (забор)",
            insertSku(groups.get("Доставка"), "Доставка (забор)", "FIXED",
                new BigDecimal("300"), new BigDecimal("150"),
                true, new BigDecimal("3000"),
                null, "IN_PROGRESS", true,  // exclude_from_status_calc=true: lifecycle, не блокирует DONE
                attr("item_type", String.valueOf(types.get("Доставка")))));
        ids.put("Доставка (отвоз)",
            insertSku(groups.get("Доставка"), "Доставка (отвоз)", "FIXED",
                new BigDecimal("300"), new BigDecimal("150"),
                true, new BigDecimal("3000"),
                null, "DELIVERED", true,
                attr("item_type", String.valueOf(types.get("Доставка")))));
        // V18: Самовывоз — НЕ auto-add. Оператор меняет платную доставку на бесплатный самовывоз
        // через кнопку «↔ Самовывоз» рядом с услугой.
        ids.put("Самовывоз (привоз клиентом)",
            insertSku(groups.get("Доставка"), "Самовывоз (привоз клиентом)", "FIXED",
                BigDecimal.ZERO, BigDecimal.ZERO,
                false, null,
                null, "IN_PROGRESS", true,
                attr("item_type", String.valueOf(types.get("Доставка")))));
        ids.put("Самовывоз (отвоз клиентом)",
            insertSku(groups.get("Доставка"), "Самовывоз (отвоз клиентом)", "FIXED",
                BigDecimal.ZERO, BigDecimal.ZERO,
                false, null,
                null, "DELIVERED", true,
                attr("item_type", String.valueOf(types.get("Доставка")))));
        // Приём — auto-add, бесплатно. item_type=Доставка (а не Приём!) — чтобы
        // attachAutoAddSkus положил Приём в позицию «Забор» рядом с Доставкой.
        ids.put("Приём в офисе",
            insertSku(groups.get("Приём"), "Приём в офисе", "FIXED",
                BigDecimal.ZERO, BigDecimal.ZERO,
                true, null,
                "IN_PROGRESS", null, true,
                attr("item_type", String.valueOf(types.get("Доставка")))));
        return ids;
    }

    /** Конструктор атрибутов: пары (key, value) или (key, value1, value2, ...) для массивов. */
    private Map<String, List<String>> attr(String key, String... values) {
        Map<String, List<String>> m = new HashMap<>();
        m.put(key, new ArrayList<>(List.of(values)));
        return m;
    }

    private long insertSku(Long groupId, String name, String pricingType,
                           BigDecimal price, BigDecimal costPrice,
                           boolean isAutoAdd, BigDecimal freeThreshold,
                           Map<String, List<String>> attrs) {
        return insertSku(groupId, name, pricingType, price, costPrice, isAutoAdd, freeThreshold,
                null, null, false, attrs);
    }

    /** V17/V18: расширенный insertSku — поддерживает lifecycle-поля (для логики «Забор/Отвоз»). */
    private long insertSku(Long groupId, String name, String pricingType,
                           BigDecimal price, BigDecimal costPrice,
                           boolean isAutoAdd, BigDecimal freeThreshold,
                           String autoCompleteOnStatus, String triggersOrderStatus,
                           boolean excludeFromStatusCalc,
                           Map<String, List<String>> attrs) {
        Long skuId = jdbc.queryForObject("""
            INSERT INTO skus(group_id, name, pricing_type, price, cost_price, is_auto_add, free_threshold,
                             auto_complete_on_status, triggers_order_status, exclude_from_status_calc)
            VALUES (:g, :n, :pt, :p, :cp, :aa, :ft, :acs, :tos, :exc) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("g",  groupId)
            .addValue("n",  name)
            .addValue("pt", pricingType)
            .addValue("p",  price)
            .addValue("cp", costPrice)
            .addValue("aa", isAutoAdd)
            .addValue("ft", freeThreshold)
            .addValue("acs", autoCompleteOnStatus)
            .addValue("tos", triggersOrderStatus)
            .addValue("exc", excludeFromStatusCalc),
            Long.class);
        // Атрибуты в EAV.
        for (var e : attrs.entrySet()) {
            for (String v : e.getValue()) {
                jdbc.update(
                    "INSERT INTO sku_attributes(sku_id, attr_key, attr_value) VALUES (:s, :k, :v)",
                    Map.of("s", skuId, "k", e.getKey(), "v", v));
            }
        }
        // Версия №1 + current_version_id. JSONB передаём строкой с CAST.
        String attrsJson = jsonifyAttrs(attrs);
        Long versionId = jdbc.queryForObject("""
            INSERT INTO sku_versions(master_id, version_num, name, group_id, pricing_type, price, cost_price,
                                     is_auto_add, free_threshold, attributes_snapshot, changed_by)
            VALUES (:m, 1, :n, :g, :pt, :p, :cp, :aa, :ft, CAST(:snap AS jsonb), 'system:seed')
            RETURNING id
        """, new MapSqlParameterSource()
            .addValue("m",  skuId)
            .addValue("n",  name)
            .addValue("g",  groupId)
            .addValue("pt", pricingType)
            .addValue("p",  price)
            .addValue("cp", costPrice)
            .addValue("aa", isAutoAdd)
            .addValue("ft", freeThreshold)
            .addValue("snap", attrsJson),
            Long.class);
        jdbc.update("UPDATE skus SET current_version_id = :v WHERE id = :id",
            Map.of("v", versionId, "id", skuId));
        return skuId;
    }

    /** Простой JSON для snapshot — без Jackson dependency, потому что сидер мелкий. */
    private String jsonifyAttrs(Map<String, List<String>> attrs) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (var e : attrs.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append('"').append(e.getKey()).append("\":[");
            boolean firstV = true;
            for (String v : e.getValue()) {
                if (!firstV) sb.append(",");
                firstV = false;
                sb.append('"').append(v).append('"');
            }
            sb.append("]");
        }
        sb.append("}");
        return sb.toString();
    }

    // ---------- очистка ----------

    private void truncateAll() {
        // CASCADE снимает все FK-ограничения, RESTART IDENTITY возвращает sequence в 1.
        // V10: убрали удалённые таблицы service_definitions/price_list, добавили
        // skus/sku_groups/sku_attributes/sku_versions.
        jdbc.update("""
            TRUNCATE TABLE
                order_item_service_defects,
                service_assignees,
                order_item_services,
                order_item_photos,
                order_items,
                order_modifiers,
                order_status_history,
                orders,
                client_modifiers,
                client_events,
                clients,
                sku_versions,
                sku_attributes,
                skus,
                sku_groups,
                employee_role_item_types,
                employees,
                employee_roles,
                item_types,
                price_modifiers,
                defect_definitions,
                feedback_messages,
                error_log,
                audit_log,
                notifications,
                monthly_expenses,
                expense_categories,
                users,
                districts
            RESTART IDENTITY CASCADE
        """, Map.of());
    }

    // ---------- справочники ----------

    private void seedDistricts() {
        String[] names = {
            "Адмиралтейский","Василеостровский","Выборгский","Калининский","Кировский",
            "Колпинский","Красногвардейский","Красносельский","Кронштадтский","Курортный",
            "Московский","Невский","Петроградский","Петродворцовый","Приморский",
            "Пушкинский","Фрунзенский","Центральный"
        };
        int order = 10;
        for (String name : names) {
            jdbc.update(
                "INSERT INTO districts(name, sort_order) VALUES (:n, :o)",
                new MapSqlParameterSource("n", name).addValue("o", order)
            );
            order += 10;
        }
    }

    private Map<String, Long> seedItemTypes() {
        // V10: типы вещей клиента — теперь без default-логики (она на SKU).
        Map<String, Long> ids = new HashMap<>();
        for (String name : new String[]{"Доставка", "Приём", "Ковёр", "Палас", "Шторы", "Покрывало"}) {
            ids.put(name, insertItemType(name));
        }
        return ids;
    }

    private long insertItemType(String name) {
        return jdbc.queryForObject(
            "INSERT INTO item_types(name) VALUES (:name) RETURNING id",
            new MapSqlParameterSource("name", name), Long.class
        );
    }

    private Map<String, Long> seedRoles(Map<String, Long> types) {
        long roleMaster = insertRole("Мастер чистки", "Чистит ковры, паласы, покрывала");
        long roleWasher = insertRole("Прачка",        "Стирка штор и текстиля");
        long roleLogist = insertRole("Логист",        "Приёмка и доставка заказов");

        linkRoleToTypes(roleMaster, List.of(types.get("Ковёр"), types.get("Палас"), types.get("Покрывало")));
        linkRoleToTypes(roleWasher, List.of(types.get("Шторы")));
        linkRoleToTypes(roleLogist, List.of(types.get("Доставка"), types.get("Приём")));

        return Map.of(
            "Мастер чистки", roleMaster,
            "Прачка",        roleWasher,
            "Логист",        roleLogist
        );
    }

    private long insertRole(String name, String description) {
        var p = new MapSqlParameterSource().addValue("n", name).addValue("d", description);
        return jdbc.queryForObject(
            "INSERT INTO employee_roles(name, description) VALUES (:n, :d) RETURNING id",
            p, Long.class
        );
    }

    private void linkRoleToTypes(long roleId, List<Long> typeIds) {
        for (Long typeId : typeIds) {
            jdbc.update(
                "INSERT INTO employee_role_item_types(role_id, item_type_id) VALUES (:r, :t)",
                Map.of("r", roleId, "t", typeId)
            );
        }
    }

    /** Возвращает map имя_сотрудника → id. */
    private Map<String, Long> seedEmployees(Map<String, Long> roles) {
        // PIN-коды для тренажёрного входа (Спринт D). На демо-стенде они
        // подбираются легко и совпадают с порядковым номером — оператор-инструктор
        // показывает «вот сотрудник Иванова, её PIN 1111».
        Map<String, Long> ids = new HashMap<>();
        // V15: contact разделено на phone + email. У тренажёра все четверо — физлица, email пустой.
        ids.put("Анна Иванова",     insertEmployee("Анна Иванова",     "+7 (911) 100-20-30", null, roles.get("Мастер чистки"), "1111"));
        ids.put("Сергей Петров",    insertEmployee("Сергей Петров",    "+7 (911) 200-30-40", null, roles.get("Мастер чистки"), "2222"));
        ids.put("Марина Соколова",  insertEmployee("Марина Соколова",  "+7 (911) 300-40-50", null, roles.get("Прачка"),         "3333"));
        ids.put("Олег Кузнецов",    insertEmployee("Олег Кузнецов",    "+7 (911) 400-50-60", null, roles.get("Логист"),         "4444"));
        return ids;
    }

    private long insertEmployee(String name, String phone, String email, Long roleId, String pin) {
        var p = new MapSqlParameterSource()
            .addValue("n", name)
            .addValue("ph", phone)
            .addValue("em", email)
            .addValue("r", roleId)
            .addValue("p", pin);
        return jdbc.queryForObject(
            "INSERT INTO employees(name, phone, email, role_id, pin) VALUES (:n, :ph, :em, :r, :p) RETURNING id",
            p, Long.class
        );
    }

    /** Возвращает map имя_клиента → id. */
    private Map<String, Long> seedClients() {
        Map<String, Long> ids = new HashMap<>();
        // V18: квартира — отдельное поле, в адресе не дублируем (мешает геокодированию).
        ids.put("Иванов",   insertClient("Иванов Иван Иванович",     "INDIVIDUAL",   "+7 (921) 111-22-33", "ivanov@example.com",  "Невский пр., д. 100",         "5",  "Центральный"));
        ids.put("Петрова",  insertClient("Петрова Мария Сергеевна",  "INDIVIDUAL",   "+7 (921) 222-33-44", "petrova@example.com", "ул. Фурштатская, д. 12",      "3",  "Центральный"));
        ids.put("ЧистыйДом",insertClient("ООО \"Чистый дом\"",        "LEGAL_ENTITY", "+7 (812) 333-44-55", "info@chistydom.ru",   "Лиговский пр., д. 50",        null, "Центральный"));
        ids.put("Сидоров",  insertClient("Сидоров Алексей Петрович", "INDIVIDUAL",   "+7 (921) 444-55-66", null,                  "пр. Просвещения, д. 25",      "18", "Выборгский"));
        ids.put("Кузьмина", insertClient("Кузьмина Ольга Андреевна", "INDIVIDUAL",   "+7 (921) 555-66-77", "kuzmina@mail.ru",     "Большой пр. П.С., д. 80",     "12", "Петроградский"));
        ids.put("Волков",   insertClient("Волков Дмитрий Олегович",  "INDIVIDUAL",   "+7 (921) 666-77-88", null,                  "ул. Савушкина, д. 119",       "7",  "Приморский"));
        return ids;
    }

    private long insertClient(String name, String type, String phone, String email, String address, String apartment, String district) {
        var p = new MapSqlParameterSource()
            .addValue("ct", type)
            .addValue("n",  name)
            .addValue("ph", phone)
            .addValue("em", email)
            .addValue("ad", address)
            .addValue("ap", apartment)
            .addValue("ds", district);
        return jdbc.queryForObject(
            "INSERT INTO clients(client_type, name, phone, email, address, apartment, district) " +
            "VALUES (:ct, :n, :ph, :em, :ad, :ap, :ds) RETURNING id",
            p, Long.class
        );
    }

    // ---------- заказы (V10, через SKU) ----------

    private record SkuRef(Long skuId, String status, BigDecimal price, List<Long> assignees) {}
    private record ItemSpec(Long itemTypeId, String description,
                            BigDecimal length, BigDecimal width, BigDecimal area, BigDecimal weight,
                            List<SkuRef> services) {}

    private static BigDecimal bd(Number n) { return n == null ? null : new BigDecimal(n.toString()); }
    private static BigDecimal bd(String s) { return new BigDecimal(s); }

    /**
     * Десяток заказов в разных статусах для аналитики и логистики.
     * Каждая услуга ссылается на конкретный SKU + текущую версию.
     */
    private void seedOrdersWithSkus(
        Map<String, Long> types,
        Map<String, Long> skus,
        Map<String, Long> employees,
        Map<String, Long> clients
    ) {
        LocalDate today = LocalDate.now();
        Long skuChistka = skus.get("Чистка ковра");
        Long skuRestor  = skus.get("Реставрация ковра");
        Long skuStirka  = skus.get("Стирка штор");

        createOrder(clients.get("Иванов"), "Иванов Иван Иванович",
            "Невский пр., д. 100", "Центральный", "LEAD",
            today, null, false, null, today.atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Шерстяной 2×3 м", bd(3), bd(2), bd(6), null,
                List.of(new SkuRef(skuChistka, "CREATED", bd("2700"), List.of())))));

        createOrder(clients.get("Петрова"), "Петрова Мария Сергеевна",
            "ул. Фурштатская, д. 12", "Центральный", "CREATED",
            today.plusDays(1), null, false, null, today.minusDays(1).atStartOfDay(),
            List.of(new ItemSpec(types.get("Палас"), "Синтетика 2×4 м", bd(4), bd(2), bd(8), null,
                List.of(new SkuRef(skuChistka, "CREATED", bd("3040"), List.of())))));

        createOrder(clients.get("ЧистыйДом"), "ООО \"Чистый дом\"",
            "Лиговский пр., д. 50", "Центральный", "IN_PROGRESS",
            today.minusDays(1), today.plusDays(2), false, null, today.minusDays(2).atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Персидский 3×4 м", bd(4), bd(3), bd(12), null,
                List.of(
                    new SkuRef(skuChistka, "IN_PROGRESS", bd("5400"), List.of(employees.get("Анна Иванова"))),
                    new SkuRef(skuRestor,  "CREATED",     bd("3500"), List.of(employees.get("Сергей Петров")))))));

        createOrder(clients.get("Сидоров"), "Сидоров Алексей Петрович",
            "пр. Просвещения, д. 25", "Выборгский", "PARTIALLY_DONE",
            today.minusDays(3), today.plusDays(1), false, null, today.minusDays(4).atStartOfDay(),
            List.of(
                new ItemSpec(types.get("Шторы"), "Гардины 4 шт", null, null, null, bd(3),
                    List.of(new SkuRef(skuStirka, "DONE", bd("840"), List.of(employees.get("Марина Соколова"))))),
                new ItemSpec(types.get("Покрывало"), "Двуспальное", bd(2), bd(2), bd(4), null,
                    List.of(new SkuRef(skuChistka, "IN_PROGRESS", bd("1600"), List.of(employees.get("Анна Иванова")))))));

        createOrder(clients.get("Кузьмина"), "Кузьмина Ольга Андреевна",
            "Большой пр. П.С., д. 80", "Петроградский", "DONE",
            today.minusDays(5), today, false, null, today.minusDays(6).atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Шёлк 2×3 м", bd(3), bd(2), bd(6), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("2700"), List.of(employees.get("Сергей Петров")))))));

        createOrder(clients.get("Иванов"), "Иванов Иван Иванович",
            "Невский пр., д. 100", "Центральный", "DELIVERED",
            today.minusDays(10), today.minusDays(7), true, "CARD", today.minusDays(11).atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Шерсть 2×3 м", bd(3), bd(2), bd(6), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("2700"), List.of(employees.get("Анна Иванова")))))));

        createOrder(clients.get("ЧистыйДом"), "ООО \"Чистый дом\"",
            "Лиговский пр., д. 50", "Центральный", "DELIVERED",
            today.minusDays(20), today.minusDays(15), true, "TRANSFER", today.minusDays(22).atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Палас 3×5 м", bd(5), bd(3), bd(15), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("6750"), List.of(employees.get("Анна Иванова")))))));

        createOrder(clients.get("Петрова"), "Петрова Мария Сергеевна",
            "ул. Фурштатская, д. 12", "Центральный", "DELIVERED",
            today.minusDays(30), today.minusDays(25), true, "CASH", today.minusDays(32).atStartOfDay(),
            List.of(new ItemSpec(types.get("Шторы"), "Тюль 6 шт", null, null, null, bd(6),
                List.of(new SkuRef(skuStirka, "DONE", bd("1680"), List.of(employees.get("Марина Соколова")))))));

        createOrder(clients.get("Волков"), "Волков Дмитрий Олегович",
            "ул. Савушкина, д. 119", "Приморский", "DELIVERED",
            today.minusDays(45), today.minusDays(40), true, "CARD", today.minusDays(46).atStartOfDay(),
            List.of(new ItemSpec(types.get("Покрывало"), "Шерсть евро", bd(2), bd(2), bd(4), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("1600"), List.of(employees.get("Анна Иванова")))))));

        createOrder(clients.get("Иванов"), "Иванов Иван Иванович",
            "Невский пр., д. 100", "Центральный", "DELIVERED",
            today.minusDays(60), today.minusDays(55), true, "CARD", today.minusDays(62).atStartOfDay(),
            List.of(new ItemSpec(types.get("Ковёр"), "Машинной вязки 2×3 м", bd(3), bd(2), bd(6), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("2700"), List.of(employees.get("Сергей Петров")))))));

        // V17 + V18 демо-заказ: с квартирой, проблемным флагом, оператором-оформителем.
        createOrderFull(clients.get("Кузьмина"), "Кузьмина Ольга Андреевна",
            "Большой пр. П.С., д. 80", "Петроградский",
            "12", "12",
            "PARTIALLY_DONE", today.minusDays(2), today.plusDays(2), false, null,
            today.minusDays(3).atStartOfDay(),
            true, "Клиент сообщил о пятне после стирки — нужно переделать за наш счёт",
            employees.get("Анна Иванова"),
            List.of(new ItemSpec(types.get("Ковёр"), "Шерсть 2×2 м", bd(2), bd(2), bd(4), null,
                List.of(new SkuRef(skuChistka, "DONE", bd("1800"), List.of(employees.get("Анна Иванова")))))));

        // V19 демо-заказ: гарантийный возврат (все позиции бесплатны).
        // Создаём напрямую через repository.saveWarranty + копированием позиции.
        Long warrantyClientId = clients.get("Иванов");
        Long warrantyParent   = jdbc.queryForObject(
            "SELECT id FROM orders WHERE client_id = :c ORDER BY id LIMIT 1",
            Map.of("c", warrantyClientId), Long.class);
        Long warrantyOrderId = jdbc.queryForObject("""
            INSERT INTO orders(client_id, client_name, status, is_warranty, parent_order_id,
                               pickup_address, pickup_district, pickup_apartment,
                               total_amount, base_amount, created_at, updated_at,
                               comment)
            VALUES (:c, :cn, 'CREATED', TRUE, :pp, :pa, :pd, :pap,
                    0, 0, :now, :now,
                    'Гарантийный возврат: запах не ушёл, перестираем за счёт компании')
            RETURNING id
        """, new MapSqlParameterSource()
            .addValue("c",  warrantyClientId)
            .addValue("cn", "Иванов Иван Иванович")
            .addValue("pp", warrantyParent)
            .addValue("pa", "Невский пр., д. 100")
            .addValue("pd", "Центральный")
            .addValue("pap","5")
            .addValue("now", today.minusDays(1).atStartOfDay()),
            Long.class);
        // Позиция гарантии — 0₽
        Long warrItemId = jdbc.queryForObject("""
            INSERT INTO order_items(order_id, item_type_id, description, status, price,
                                    length, width, area)
            VALUES (:o, :tt, 'Перестирка по гарантии', 'CREATED', 0, 3, 2, 6)
            RETURNING id
        """, Map.of("o", warrantyOrderId, "tt", types.get("Ковёр")), Long.class);
        jdbc.update("""
            INSERT INTO order_item_services(order_item_id, sku_id, sku_version_id, status, price, is_manual_price)
            VALUES (:i, :s, (SELECT current_version_id FROM skus WHERE id = :s), 'CREATED', 0, TRUE)
        """, Map.of("i", warrItemId, "s", skuChistka));
    }

    /**
     * Логистическая волна: заборы и доставки на сегодня + завтра в разных слотах.
     */
    private void seedLogisticsWave(
        Map<String, Long> types,
        Map<String, Long> skus,
        Map<String, Long> employees,
        Map<String, Long> clients
    ) {
        LocalDate today    = LocalDate.now();
        LocalDate tomorrow = today.plusDays(1);
        Long oleg          = employees.get("Олег Кузнецов");
        Long anna          = employees.get("Анна Иванова");
        Long sergey        = employees.get("Сергей Петров");
        Long skuChistka    = skus.get("Чистка ковра");

        // V18: слоты из справочника — будни 17:00-20:30, сб 10:00-20:30. Тренажёру
        // безопаснее использовать перекрытие 17:00-20:00 — попадает в оба окна.
        createLogisticsOrder("Сегодня · 17-18", clients.get("Кузьмина"), "Кузьмина Ольга Андреевна",
            "Большой пр. П.С., д. 80", "Петроградский",
            today, "17:00-18:00", null, null, "CREATED", oleg, anna,
            types.get("Палас"), skuChistka, "Палас 2×3 м", bd(3), bd(2), bd(6));

        createLogisticsOrder("Сегодня · 18-19", clients.get("Волков"), "Волков Дмитрий Олегович",
            "ул. Савушкина, д. 119", "Приморский",
            today, "18:00-19:00", null, null, "CREATED", oleg, sergey,
            types.get("Ковёр"), skuChistka, "Ковёр шерсть 3×4 м", bd(4), bd(3), bd(12));

        createLogisticsOrder("Сегодня · 19-20", clients.get("Сидоров"), "Сидоров Алексей Петрович",
            "пр. Просвещения, д. 25", "Выборгский",
            today, "19:00-20:00", null, null, "CREATED", oleg, anna,
            types.get("Покрывало"), skuChistka, "Покрывало шерсть", bd(2), bd(2), bd(4));

        createLogisticsOrder("Доставка сегодня · 17-18", clients.get("Иванов"), "Иванов Иван Иванович",
            "Невский пр., д. 100", "Центральный",
            today.minusDays(3), "17:00-18:00", today, "17:00-18:00", "DONE", oleg, anna,
            types.get("Ковёр"), skuChistka, "Ковёр шёлк 2×3 м", bd(3), bd(2), bd(6));

        createLogisticsOrder("Доставка сегодня · 18-19", clients.get("Петрова"), "Петрова Мария Сергеевна",
            "ул. Фурштатская, д. 12", "Центральный",
            today.minusDays(2), "17:00-18:00", today, "18:00-19:00", "DONE", oleg, sergey,
            types.get("Палас"), skuChistka, "Палас 2×3 м", bd(3), bd(2), bd(6));

        createLogisticsOrder("Завтра · 17-18", clients.get("ЧистыйДом"), "ООО \"Чистый дом\"",
            "Лиговский пр., д. 50", "Центральный",
            tomorrow, "17:00-18:00", null, null, "CREATED", null, anna,
            types.get("Ковёр"), skuChistka, "Ковёр персидский 4×5 м", bd(5), bd(4), bd(20));

        createLogisticsOrder("Завтра · 18-19", clients.get("Кузьмина"), "Кузьмина Ольга Андреевна",
            "Большой пр. П.С., д. 80", "Петроградский",
            tomorrow, "18:00-19:00", null, null, "CREATED", null, sergey,
            types.get("Ковёр"), skuChistka, "Ковёр 2×3 м", bd(3), bd(2), bd(6));

        createLogisticsOrder("Завтра · 19-20", clients.get("Волков"), "Волков Дмитрий Олегович",
            "ул. Савушкина, д. 119", "Приморский",
            tomorrow, "19:00-20:00", null, null, "CREATED", null, anna,
            types.get("Палас"), skuChistka, "Палас 3×4 м", bd(4), bd(3), bd(12));
    }

    private void createOrder(
        Long clientId, String clientName,
        String pickupAddress, String pickupDistrict,
        String status, LocalDate pickupDate, LocalDate deliveryDate,
        boolean paid, String paymentType, LocalDateTime createdAt,
        List<ItemSpec> items
    ) {
        createOrderFull(clientId, clientName, pickupAddress, pickupDistrict,
                null, null, status, pickupDate, deliveryDate, paid, paymentType, createdAt,
                false, null, null, items);
    }

    /**
     * V17 + V18: расширенный createOrder поддерживает квартиру, оператора-оформителя,
     * проблемный флаг. Старая перегрузка делегирует сюда с null/false.
     */
    private void createOrderFull(
        Long clientId, String clientName,
        String pickupAddress, String pickupDistrict,
        String pickupApartment, String deliveryApartment,
        String status, LocalDate pickupDate, LocalDate deliveryDate,
        boolean paid, String paymentType, LocalDateTime createdAt,
        boolean isProblem, String problemReason, Long assignedOperatorEmpId,
        List<ItemSpec> items
    ) {
        BigDecimal total = BigDecimal.ZERO;
        for (var it : items) for (var s : it.services()) total = total.add(s.price());
        Long orderId = jdbc.queryForObject("""
            INSERT INTO orders(client_id, client_name, status, pickup_address, pickup_district,
                               pickup_apartment, delivery_apartment,
                               pickup_date, delivery_date, paid, payment_type, payment_date,
                               total_amount, base_amount,
                               is_problem, problem_reason, assigned_operator_id,
                               created_at, updated_at)
            VALUES (:c, :cn, :st, :pa, :pd, :pap, :dap,
                    :pdate, :ddate, :paid, :pt, :paydate,
                    :total, :total, :probF, :probR, :aoid,
                    :created, :created) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("c", clientId).addValue("cn", clientName).addValue("st", status)
            .addValue("pa", pickupAddress).addValue("pd", pickupDistrict)
            .addValue("pap", pickupApartment).addValue("dap", deliveryApartment)
            .addValue("pdate", pickupDate).addValue("ddate", deliveryDate)
            .addValue("paid", paid).addValue("pt", paymentType)
            .addValue("paydate", paid ? createdAt.plusDays(2) : null)
            .addValue("total", total).addValue("created", createdAt)
            .addValue("probF", isProblem).addValue("probR", problemReason)
            .addValue("aoid", assignedOperatorEmpId),
            Long.class);
        for (var it : items) insertItemAndServices(orderId, it, status);
    }

    private void insertItemAndServices(Long orderId, ItemSpec it, String orderStatus) {
        String itemStatus = switch (orderStatus) {
            case "LEAD", "CREATED"                -> "CREATED";
            case "IN_PROGRESS", "PARTIALLY_DONE"   -> "IN_PROGRESS";
            default                                  -> "DONE";
        };
        BigDecimal itemPrice = it.services().stream()
                .map(SkuRef::price).reduce(BigDecimal.ZERO, BigDecimal::add);
        Long itemId = jdbc.queryForObject("""
            INSERT INTO order_items(order_id, item_type_id, description, status, price,
                                    length, width, area, weight)
            VALUES (:o, :t, :d, :st, :p, :l, :w, :a, :wt) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("o", orderId).addValue("t", it.itemTypeId())
            .addValue("d", it.description()).addValue("st", itemStatus).addValue("p", itemPrice)
            .addValue("l", it.length()).addValue("w", it.width())
            .addValue("a", it.area()).addValue("wt", it.weight()),
            Long.class);
        for (var s : it.services()) {
            Long oisId = jdbc.queryForObject("""
                INSERT INTO order_item_services(order_item_id, sku_id, sku_version_id, status, price)
                VALUES (:i, :sku,
                        (SELECT current_version_id FROM skus WHERE id = :sku),
                        :st, :p) RETURNING id
            """, new MapSqlParameterSource()
                .addValue("i", itemId).addValue("sku", s.skuId())
                .addValue("st", s.status()).addValue("p", s.price()),
                Long.class);
            for (Long empId : s.assignees()) {
                jdbc.update("INSERT INTO service_assignees(order_item_service_id, employee_id) VALUES (:o, :e)",
                    Map.of("o", oisId, "e", empId));
            }
        }
    }

    /** Логистический заказ с одной позицией Чистка + назначенным водителем. */
    private void createLogisticsOrder(
        String comment,
        Long clientId, String clientName, String pickupAddress, String pickupDistrict,
        LocalDate pickupDate, String pickupSlot,
        LocalDate deliveryDate, String deliverySlot,
        String status, Long driverId, Long masterId,
        Long itemTypeId, Long skuChistka, String itemDescription,
        BigDecimal length, BigDecimal width, BigDecimal area
    ) {
        boolean pickupDone = "DONE".equals(status) || "PARTIALLY_DONE".equals(status);
        BigDecimal itemPrice = area.multiply(new BigDecimal("450"));
        BigDecimal total = itemPrice.add(new BigDecimal("500"));

        Long orderId = jdbc.queryForObject("""
            INSERT INTO orders(client_id, client_name, status, comment,
                               pickup_address, pickup_district, pickup_date, pickup_time_slot,
                               delivery_address, delivery_district, delivery_date, delivery_time_slot,
                               actual_pickup_date, actual_pickup_time_slot,
                               assigned_driver_id, paid, total_amount, base_amount, created_at, updated_at)
            VALUES (:c, :cn, :st, :cm, :pa, :pd, :pdate, :pslot,
                    :pa, :pd, :ddate, :dslot, :apdate, :apslot,
                    :drv, false, :total, :total, :created, :created) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("c", clientId).addValue("cn", clientName).addValue("st", status)
            .addValue("cm", comment).addValue("pa", pickupAddress).addValue("pd", pickupDistrict)
            .addValue("pdate", pickupDate).addValue("pslot", pickupSlot)
            .addValue("ddate", deliveryDate).addValue("dslot", deliverySlot)
            .addValue("apdate", pickupDone ? pickupDate : null)
            .addValue("apslot", pickupDone ? pickupSlot : null)
            .addValue("drv", driverId).addValue("total", total)
            .addValue("created", pickupDate.atStartOfDay()),
            Long.class);

        Long itemId = jdbc.queryForObject("""
            INSERT INTO order_items(order_id, item_type_id, description, status, price, length, width, area)
            VALUES (:o, :t, :d, :st, :p, :l, :w, :a) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("o", orderId).addValue("t", itemTypeId).addValue("d", itemDescription)
            .addValue("st", pickupDone ? "IN_PROGRESS" : "CREATED")
            .addValue("p", itemPrice).addValue("l", length).addValue("w", width).addValue("a", area),
            Long.class);
        Long svcId = jdbc.queryForObject("""
            INSERT INTO order_item_services(order_item_id, sku_id, sku_version_id, status, price)
            VALUES (:i, :sku, (SELECT current_version_id FROM skus WHERE id = :sku), :st, :p) RETURNING id
        """, new MapSqlParameterSource()
            .addValue("i", itemId).addValue("sku", skuChistka)
            .addValue("st", pickupDone ? "IN_PROGRESS" : "CREATED").addValue("p", itemPrice),
            Long.class);
        if (masterId != null) {
            jdbc.update("INSERT INTO service_assignees(order_item_service_id, employee_id) VALUES (:o, :e)",
                Map.of("o", svcId, "e", masterId));
        }
    }
}
