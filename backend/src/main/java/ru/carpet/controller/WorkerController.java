package ru.carpet.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.web.bind.annotation.*;
import ru.carpet.exception.BusinessRuleException;
import ru.carpet.model.ServiceStatus;
import ru.carpet.service.OrderItemService;
import ru.carpet.service.OrderItemServiceInstanceService;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST-API для личного кабинета работника (Спринт D, замечание Миши 11 мая).
 *
 * <p>Доступен по PIN-авторизации (без логин/пароля): работник выбирает свою
 * плитку из списка на странице входа, вводит 4 цифры — попадает в свой
 * кабинет. Все запросы пробрасывают `employeeId` в URL, мы проверяем PIN
 * один раз на логине, дальше клиент шлёт ID — но каждый мутирующий запрос
 * сверяет, что услуга/позиция действительно назначена на этого сотрудника
 * (иначе 403). Это защищает от прямого вмешательства в чужие услуги.
 *
 * <p>Эндпоинты выведены под отдельный путь {@code /api/worker/**}, который
 * пропущен в SecurityConfig (см. permitAll) — у работников нет Basic Auth.
 * На проде с белым IP сюда можно навесить дополнительный rate-limit или
 * подписанный токен; сейчас тренажёр-стенд этого не требует.
 */
@RestController
@RequestMapping("/api/worker")
public class WorkerController {

    private final NamedParameterJdbcTemplate jdbc;
    private final OrderItemServiceInstanceService serviceInstanceService;
    private final OrderItemService orderItemService;

    public WorkerController(NamedParameterJdbcTemplate jdbc,
                            OrderItemServiceInstanceService serviceInstanceService,
                            OrderItemService orderItemService) {
        this.jdbc = jdbc;
        this.serviceInstanceService = serviceInstanceService;
        this.orderItemService = orderItemService;
    }

    // ---------- 1. Список сотрудников для экрана выбора плитки ----------

    @GetMapping("/employees")
    public List<Map<String, Object>> listEmployees() {
        // Только активные. PIN не отдаём — клиент его не должен знать.
        return jdbc.queryForList("""
            SELECT e.id, e.name,
                   r.name AS role_name,
                   (e.pin IS NOT NULL) AS has_pin
            FROM employees e
            LEFT JOIN employee_roles r ON r.id = e.role_id
            WHERE e.active = true
            ORDER BY e.name
            """, Map.of());
    }

    // ---------- 2. Логин по PIN ----------

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        Long employeeId = ((Number) body.get("employee_id")).longValue();
        String pin = (String) body.get("pin");
        if (pin == null || pin.isBlank()) {
            return ResponseEntity.status(401).body(Map.of("error", "PIN не указан"));
        }
        var rows = jdbc.queryForList(
            "SELECT id, name, pin FROM employees WHERE id = :id AND active = true",
            Map.of("id", employeeId));
        if (rows.isEmpty()) return ResponseEntity.status(404).body(Map.of("error", "Сотрудник не найден"));
        Map<String, Object> r = rows.get(0);
        String dbPin = (String) r.get("pin");
        if (dbPin == null) return ResponseEntity.status(409).body(Map.of("error", "PIN не задан — обратитесь к супервизору"));
        if (!dbPin.equals(pin)) return ResponseEntity.status(401).body(Map.of("error", "Неверный PIN"));
        return ResponseEntity.ok(Map.of(
            "employee_id", r.get("id"),
            "name",        r.get("name")
        ));
    }

    // ---------- 3. Список услуг работника ----------

    @GetMapping("/{employeeId}/services")
    public List<Map<String, Object>> myServices(@PathVariable Long employeeId) {
        // JOIN'имся к назначениям, услугам, позициям, заказам и клиентам — клиент мобилки
        // хочет видеть в одной строке: что за услуга, на какой вещи, какого клиента,
        // и в каком статусе всё это.
        // V10: имя услуги и pricing_type берутся из snapshot версии SKU
        // (sku_version_id), с fallback на текущий мастер SKU.
        return jdbc.queryForList("""
            SELECT
                ois.id              AS service_id,
                ois.status          AS service_status,
                ois.price           AS service_price,
                COALESCE(sv.name, s.name)                 AS service_name,
                COALESCE(sv.pricing_type, s.pricing_type) AS pricing_type,
                oi.id               AS item_id,
                oi.description      AS item_description,
                oi.defects          AS item_defects,
                oi.status           AS item_status,
                oi.length           AS item_length,
                oi.width            AS item_width,
                oi.area             AS item_area,
                oi.weight           AS item_weight,
                it.id               AS item_type_id,
                it.name             AS item_type_name,
                o.id                AS order_id,
                o.client_name       AS client_name,
                o.pickup_address    AS pickup_address,
                o.delivery_address  AS delivery_address,
                o.pickup_date       AS pickup_date,
                o.delivery_date     AS delivery_date
            FROM service_assignees sa
            JOIN order_item_services ois ON ois.id = sa.order_item_service_id
            LEFT JOIN skus           s   ON s.id   = ois.sku_id
            LEFT JOIN sku_versions   sv  ON sv.id  = ois.sku_version_id
            JOIN order_items oi          ON oi.id  = ois.order_item_id
            JOIN item_types  it          ON it.id  = oi.item_type_id
            JOIN orders      o           ON o.id   = oi.order_id
            WHERE sa.employee_id = :eid
              AND ois.status <> 'CANCELLED'
              -- Правка №2 (31.08): выполненную работу показываем всегда, даже когда
              -- заказ уже оплачен и закрыт. Раньше COMPLETED-заказы отсекались, и
              -- стирщик не мог вернуться к своему ковру, чтобы посмотреть фото и
              -- размеры. Активные услуги по-прежнему прячем у отменённых заказов.
              AND (ois.status = 'DONE' OR o.status NOT IN ('CANCELLED','COMPLETED'))
            ORDER BY
                CASE ois.status
                    WHEN 'IN_PROGRESS' THEN 1
                    WHEN 'CREATED'     THEN 2
                    WHEN 'DONE'        THEN 3
                    ELSE 4
                END,
                COALESCE(o.pickup_date, o.delivery_date)
            """, Map.of("eid", employeeId));
    }

    // ---------- 4. Смена статуса услуги ----------

    @PatchMapping("/{employeeId}/services/{serviceId}/status")
    public ResponseEntity<?> changeServiceStatus(
        @PathVariable Long employeeId,
        @PathVariable Long serviceId,
        @RequestBody Map<String, String> body
    ) {
        if (!isAssignee(employeeId, serviceId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Услуга не назначена на вас"));
        }
        String newStatus = body.get("status");
        if (!List.of("CREATED", "IN_PROGRESS", "DONE").contains(newStatus)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Недопустимый статус"));
        }
        // Раньше тут был сырой UPDATE в обход сервисного слоя — из-за этого стирщик
        // закрывал услугу с телефона, а позиция в заказе оставалась «Создана»:
        // не пересчитывались статус позиции, статус заказа и lifecycle-триггеры
        // (например «Приём» → заказ IN_PROGRESS). Теперь идём через тот же сервис,
        // что и веб-интерфейс — поведение мобилки и десктопа совпадает.
        try {
            serviceInstanceService.updateStatus(serviceId, ServiceStatus.valueOf(newStatus));
        } catch (BusinessRuleException e) {
            // Например «не заполнена площадь» для услуги с расчётом по площади —
            // отдаём текст как есть, мобилка показывает его в alert.
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ---------- 5. Размеры позиции ----------

    @PatchMapping("/{employeeId}/items/{itemId}/dimensions")
    public ResponseEntity<?> updateDimensions(
        @PathVariable Long employeeId,
        @PathVariable Long itemId,
        @RequestBody Map<String, Object> body
    ) {
        if (!isItemAssignee(employeeId, itemId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Позиция не назначена на вас"));
        }
        // Через сервисный слой, а не сырым UPDATE: смена размеров должна пересчитать
        // цены услуг (BY_AREA/BY_WEIGHT) и сумму заказа. Раньше стирщик правил размеры
        // с телефона, а цена оставалась от старых габаритов.
        try {
            orderItemService.updateDimensions(itemId,
                asDecimal(body.get("length")),
                asDecimal(body.get("width")),
                asDecimal(body.get("weight")),
                asDecimal(body.get("area")),
                null);
        } catch (BusinessRuleException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ---------- 6. Описание и дефекты ----------

    @PatchMapping("/{employeeId}/items/{itemId}/description")
    public ResponseEntity<?> updateDescription(
        @PathVariable Long employeeId,
        @PathVariable Long itemId,
        @RequestBody Map<String, String> body
    ) {
        if (!isItemAssignee(employeeId, itemId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Позиция не назначена на вас"));
        }
        jdbc.update("""
            UPDATE order_items
               SET description = :d, defects = :def, updated_at = NOW()
             WHERE id = :id
            """, Map.of("d", body.getOrDefault("description", ""),
                        "def", body.getOrDefault("defects", ""),
                        "id", itemId));
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ---------- 7. Фото ----------

    @PostMapping("/{employeeId}/items/{itemId}/photos")
    public ResponseEntity<?> addPhoto(
        @PathVariable Long employeeId,
        @PathVariable Long itemId,
        @RequestBody Map<String, String> body
    ) {
        if (!isItemAssignee(employeeId, itemId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Позиция не назначена на вас"));
        }
        String filename    = body.getOrDefault("filename", "photo.jpg");
        String contentType = body.getOrDefault("content_type", "image/jpeg");
        String data        = body.get("data");
        if (data == null || data.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "Нет данных"));
        var params = new MapSqlParameterSource()
            .addValue("oi", itemId)
            .addValue("fn", filename)
            .addValue("ct", contentType)
            .addValue("d",  data);
        jdbc.update("""
            INSERT INTO order_item_photos(order_item_id, filename, content_type, data)
            VALUES (:oi, :fn, :ct, :d)
            """, params);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ---------- 8a. Смена delivery_state позиции (Спринт V9, фидбэк Миши) ----------

    /**
     * Водитель отмечает результат доставки конкретной позиции:
     *   DELIVERED — отдал клиенту;
     *   LOST      — не довёз (потерял/повредил);
     *   PENDING   — откат (сброс отметки, нужно когда ошибся).
     *
     * <p>После смены пересчитываем статус заказа:
     *   • все позиции DELIVERED — заказ DELIVERED;
     *   • часть DELIVERED, есть хотя бы одна LOST — PARTIALLY_DELIVERED;
     *   • ничего не изменилось (всё ещё есть PENDING) — статус заказа не трогаем.
     *
     * <p>Поле {@code changed_by} в audit-логе — id работника (PIN-сессия).
     */
    @PatchMapping("/{employeeId}/items/{itemId}/delivery-state")
    public ResponseEntity<?> setDeliveryState(
        @PathVariable Long employeeId,
        @PathVariable Long itemId,
        @RequestBody Map<String, String> body
    ) {
        // Безопасность: работник может менять только позиции из заказов,
        // на услугах которых он assignee. Используем существующий isItemAssignee.
        if (!isItemAssignee(employeeId, itemId)) {
            return ResponseEntity.status(403).body(Map.of("error", "Позиция не назначена на вас"));
        }
        String state = body.get("state");
        if (!List.of("PENDING", "DELIVERED", "LOST").contains(state)) {
            return ResponseEntity.badRequest().body(Map.of("error", "state: PENDING | DELIVERED | LOST"));
        }
        // Меняем поле + узнаём order_id для последующей пересборки статуса заказа.
        Long orderId = jdbc.queryForObject("""
            UPDATE order_items
               SET delivery_state = :s, updated_at = NOW()
             WHERE id = :id
             RETURNING order_id
        """, Map.of("s", state, "id", itemId), Long.class);

        recomputeOrderStatusAfterDelivery(orderId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    /** Пересчёт статуса заказа по delivery_state позиций. */
    private void recomputeOrderStatusAfterDelivery(Long orderId) {
        // Считаем сколько позиций в каждом состоянии (только не отменённых).
        var counts = jdbc.queryForMap("""
            SELECT
                COUNT(*) FILTER (WHERE delivery_state = 'PENDING'   AND status <> 'CANCELLED') AS pending,
                COUNT(*) FILTER (WHERE delivery_state = 'DELIVERED' AND status <> 'CANCELLED') AS delivered,
                COUNT(*) FILTER (WHERE delivery_state = 'LOST'      AND status <> 'CANCELLED') AS lost
            FROM order_items WHERE order_id = :id
        """, Map.of("id", orderId));
        long pending   = ((Number) counts.get("pending")).longValue();
        long delivered = ((Number) counts.get("delivered")).longValue();
        long lost      = ((Number) counts.get("lost")).longValue();

        String newStatus = null;
        if (pending == 0 && lost > 0) {
            newStatus = "PARTIALLY_DELIVERED";
        } else if (pending == 0 && delivered > 0 && lost == 0) {
            newStatus = "DELIVERED";
        }
        if (newStatus != null) {
            jdbc.update("UPDATE orders SET status = :s, updated_at = NOW() WHERE id = :id AND status NOT IN ('COMPLETED','CANCELLED')",
                Map.of("s", newStatus, "id", orderId));
        }
    }

    // ---------- 9. Маршрут водителя на день (Спринт D.5) ----------

    /**
     * Все точки забора и доставки на сегодня, где работник назначен исполнителем
     * хотя бы одной услуги в заказе (для логиста это обычно «Доставка»).
     *
     * <p>Возвращает строки в формате: тип точки (pickup/delivery), адрес,
     * время, контакт клиента, краткое описание позиций и итоговая сумма.
     * Сортировка — сначала по дате, потом по time slot. Завершённые
     * (actual_*_date IS NOT NULL) скрываются — водитель видит только то,
     * что ещё нужно сделать.
     *
     * <p>{@code dateFrom}/{@code dateTo} — необязательные параметры
     * (формат ISO YYYY-MM-DD). По умолчанию — только сегодня.
     */
    @GetMapping("/{employeeId}/route")
    public List<Map<String, Object>> myRoute(
        @PathVariable Long employeeId,
        @RequestParam(required = false) java.time.LocalDate dateFrom,
        @RequestParam(required = false) java.time.LocalDate dateTo
    ) {
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.LocalDate from = dateFrom != null ? dateFrom : today;
        java.time.LocalDate to   = dateTo   != null ? dateTo   : today;
        Map<String, Object> p = Map.of("eid", employeeId, "from", from, "to", to);
        return jdbc.queryForList("""
            WITH my_orders AS (
                SELECT DISTINCT o.id
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                JOIN order_item_services ois ON ois.order_item_id = oi.id
                JOIN service_assignees sa ON sa.order_item_service_id = ois.id
                WHERE sa.employee_id = :eid
                  AND o.status NOT IN ('CANCELLED','COMPLETED')
            )
            SELECT 'pickup' AS point_type,
                   o.id AS order_id,
                   o.client_name,
                   o.pickup_address AS address,
                   o.pickup_district AS district,
                   o.pickup_date AS plan_date,
                   o.pickup_time_slot AS time_slot,
                   o.total_amount,
                   o.paid,
                   o.payment_type,
                   (SELECT phone FROM clients WHERE id = o.client_id) AS client_phone
            FROM orders o
            WHERE o.id IN (SELECT id FROM my_orders)
              AND o.pickup_date BETWEEN :from AND :to
              AND o.actual_pickup_date IS NULL
            UNION ALL
            SELECT 'delivery' AS point_type,
                   o.id AS order_id,
                   o.client_name,
                   o.delivery_address AS address,
                   o.delivery_district AS district,
                   o.delivery_date AS plan_date,
                   o.delivery_time_slot AS time_slot,
                   o.total_amount,
                   o.paid,
                   o.payment_type,
                   (SELECT phone FROM clients WHERE id = o.client_id) AS client_phone
            FROM orders o
            WHERE o.id IN (SELECT id FROM my_orders)
              AND o.delivery_date BETWEEN :from AND :to
              AND o.actual_delivery_date IS NULL
            ORDER BY plan_date, time_slot NULLS LAST, order_id
            """, p);
    }

    /**
     * Позиции заказа с их {@code delivery_state} — для экрана отметки доставки
     * на мобилке водителя (Спринт V9). Возвращаем только не-default позиции
     * (доставка/приём идут общим списком, не нужно водителю их отмечать).
     */
    @GetMapping("/{employeeId}/orders/{orderId}/items-for-delivery")
    public List<Map<String, Object>> itemsForDelivery(
        @PathVariable Long employeeId,
        @PathVariable Long orderId
    ) {
        // Защита: проверяем, что работник в assignees хотя бы одной услуги заказа.
        Long ok = jdbc.queryForObject("""
            SELECT COUNT(*)
              FROM service_assignees sa
              JOIN order_item_services ois ON ois.id = sa.order_item_service_id
              JOIN order_items oi          ON oi.id  = ois.order_item_id
             WHERE oi.order_id = :oid AND sa.employee_id = :eid
        """, Map.of("oid", orderId, "eid", employeeId), Long.class);
        if (ok == null || ok == 0) return List.of();

        // V10: фильтр it.is_default = FALSE убран — поля больше нет. Для мобильного
        // воркера показываем все позиции; «авто-добавленные» теперь определяются
        // через SKU.is_auto_add на услуге, а не на типе позиции.
        return jdbc.queryForList("""
            SELECT oi.id              AS item_id,
                   oi.description     AS description,
                   oi.status          AS item_status,
                   oi.delivery_state  AS delivery_state,
                   it.name            AS item_type_name
              FROM order_items oi
              JOIN item_types it ON it.id = oi.item_type_id
             WHERE oi.order_id = :oid
             ORDER BY oi.id
        """, Map.of("oid", orderId));
    }

    // ---------- 9. Доступные (нераспределённые) услуги по роли ----------

    /**
     * V11: услуги, подходящие по роли текущего работника, которые он может взять.
     *
     * <p>Правка №4 (20.08): раньше отсюда исчезало всё, что уже кто-то взял, и
     * присоединиться к работе над одним ковром было невозможно — второго
     * исполнителя мог назначить только оператор из веба. Теперь отдаём и занятые:
     * поле {@code assignee_names} говорит, кто уже работает, а {@code is_taken}
     * позволяет мобильному приложению развести «свободные» и «в работе у коллег».
     *
     * <p>Услуги, где работник уже исполнитель, не отдаём — они у него в основном
     * списке (/services), иначе задвоятся.
     */
    @GetMapping("/{employeeId}/available")
    public List<Map<String, Object>> availableServices(@PathVariable Long employeeId) {
        return jdbc.queryForList("""
            SELECT
                ois.id              AS service_id,
                ois.status          AS service_status,
                ois.price           AS service_price,
                COALESCE(sv.name, s.name) AS service_name,
                oi.id               AS item_id,
                oi.description      AS item_description,
                -- Правка №3 (31.08): размеры видны ДО взятия в работу — стирщик
                -- заранее оценивает габариты и распределяет нагрузку.
                oi.length           AS item_length,
                oi.width            AS item_width,
                oi.area             AS item_area,
                oi.weight           AS item_weight,
                it.name             AS item_type_name,
                o.id                AS order_id,
                o.client_name       AS client_name,
                EXISTS (SELECT 1 FROM service_assignees sa WHERE sa.order_item_service_id = ois.id) AS is_taken,
                (SELECT string_agg(e2.name, ', ' ORDER BY e2.name)
                   FROM service_assignees sa2
                   JOIN employees e2 ON e2.id = sa2.employee_id
                  WHERE sa2.order_item_service_id = ois.id) AS assignee_names
              FROM order_item_services ois
              JOIN order_items oi ON oi.id = ois.order_item_id
              JOIN orders o ON o.id = oi.order_id
              JOIN item_types it ON it.id = oi.item_type_id
              LEFT JOIN skus s ON s.id = ois.sku_id
              LEFT JOIN sku_versions sv ON sv.id = ois.sku_version_id
             WHERE ois.status IN ('CREATED', 'IN_PROGRESS')
               AND s.exclude_from_status_calc = FALSE
               -- Свои услуги не показываем: они уже в основном списке работника.
               AND NOT EXISTS (
                   SELECT 1 FROM service_assignees sa
                    WHERE sa.order_item_service_id = ois.id AND sa.employee_id = :eid
               )
               AND (
                   -- Роль сотрудника включает этот item_type, ИЛИ сотрудник без роли
                   EXISTS (SELECT 1 FROM employees e WHERE e.id = :eid AND e.role_id IS NULL)
                   OR EXISTS (
                       SELECT 1 FROM employees e
                       JOIN employee_role_item_types rt ON rt.role_id = e.role_id AND rt.item_type_id = oi.item_type_id
                       WHERE e.id = :eid
                   )
               )
             ORDER BY is_taken, o.id, oi.id
        """, Map.of("eid", employeeId));
    }

    /**
     * V11: работник берёт услугу. Правка №4 (20.08): если услугу уже кто-то взял,
     * это не ошибка — работник присоединяется вторым исполнителем (совместная стирка
     * одного ковра — обычная ситуация).
     *
     * <p>Необязательное тело {@code {"with_employee_ids": [5, 6]}} — сразу записать
     * коллег, которые работают вместе с ним, чтобы каждому корректно засчиталась работа.
     */
    @PostMapping("/{employeeId}/take/{serviceId}")
    public ResponseEntity<?> takeService(@PathVariable Long employeeId, @PathVariable Long serviceId,
                                         @RequestBody(required = false) Map<String, Object> body) {
        Integer status = jdbc.queryForList(
                "SELECT 1 FROM order_item_services WHERE id = :s AND status IN ('CREATED','IN_PROGRESS')",
                Map.of("s", serviceId), Integer.class).stream().findFirst().orElse(null);
        if (status == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Услуга уже завершена или отменена"));
        }

        // Себя + названных коллег. ON CONFLICT — повторное «взять» не падает.
        java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
        ids.add(employeeId);
        if (body != null && body.get("with_employee_ids") instanceof List<?> raw) {
            for (Object o : raw) {
                if (o instanceof Number n) ids.add(n.longValue());
            }
        }
        for (Long id : ids) {
            jdbc.update("""
                INSERT INTO service_assignees (order_item_service_id, employee_id)
                VALUES (:s, :e)
                ON CONFLICT (order_item_service_id, employee_id) DO NOTHING
            """, Map.of("s", serviceId, "e", id));
        }
        jdbc.update("UPDATE order_item_services SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = :s AND status = 'CREATED'",
                Map.of("s", serviceId));
        // Правка №3 (20.08): статус услуги здесь меняется сырым SQL (нам нужно
        // взятие без проверок сервисного слоя), поэтому пересчёт статуса позиции
        // надо дёрнуть руками. Без этого услуга уходила «В работе», а позиция
        // оставалась «Создана» — оператор видел рассинхрон в карточке заказа.
        recalcItemStatusByService(serviceId);
        return ResponseEntity.ok(Map.of("ok", true, "assignees", ids.size()));
    }

    /**
     * Пересчитать статус позиции по id её услуги.
     *
     * <p>Нужен там, где статус услуги меняется прямым SQL мимо
     * {@link OrderItemServiceInstanceService#updateStatus} — только он сам зовёт
     * {@link OrderItemService#recalculateItemStatus}. Тихо игнорируем сбой:
     * действие водителя/стирщика не должно падать из-за пересчёта.
     */
    private void recalcItemStatusByService(Long serviceId) {
        try {
            Long itemId = jdbc.queryForObject(
                    "SELECT order_item_id FROM order_item_services WHERE id = :s",
                    Map.of("s", serviceId), Long.class);
            if (itemId != null) orderItemService.recalculateItemStatus(itemId);
        } catch (Exception ignored) {}
    }

    // ---------- 10. Установить PIN при первом входе ----------

    @PostMapping("/set-pin")
    public ResponseEntity<?> setPin(@RequestBody Map<String, Object> body) {
        Long employeeId = ((Number) body.get("employee_id")).longValue();
        String pin = (String) body.get("pin");
        if (pin == null || pin.length() < 4 || pin.length() > 10) {
            return ResponseEntity.badRequest().body(Map.of("error", "PIN: 4–10 символов"));
        }
        // Разрешаем только если PIN ещё не задан — иначе менять должен супервизор.
        int updated = jdbc.update(
            "UPDATE employees SET pin = :p, updated_at = NOW() WHERE id = :id AND pin IS NULL",
            Map.of("p", pin, "id", employeeId));
        if (updated == 0) {
            return ResponseEntity.status(409).body(Map.of("error", "PIN уже задан, обратитесь к супервизору"));
        }
        return ResponseEntity.ok(Map.of("ok", true));
    }

    // ---------- Хелперы доступа ----------

    private boolean isAssignee(Long employeeId, Long serviceId) {
        Long cnt = jdbc.queryForObject(
            "SELECT COUNT(*) FROM service_assignees WHERE order_item_service_id = :sid AND employee_id = :eid",
            Map.of("sid", serviceId, "eid", employeeId), Long.class);
        return cnt != null && cnt > 0;
    }

    /** Назначение по позиции — если работник назначен хотя бы на одну её услугу. */
    private boolean isItemAssignee(Long employeeId, Long itemId) {
        Long cnt = jdbc.queryForObject("""
            SELECT COUNT(*)
            FROM service_assignees sa
            JOIN order_item_services ois ON ois.id = sa.order_item_service_id
            WHERE ois.order_item_id = :iid AND sa.employee_id = :eid
            """, Map.of("iid", itemId, "eid", employeeId), Long.class);
        return cnt != null && cnt > 0;
    }

    private static BigDecimal asDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal b) return b;
        if (v instanceof Number n)    return new BigDecimal(n.toString());
        if (v instanceof String s && !s.isBlank()) return new BigDecimal(s);
        return null;
    }

    // ================================================================
    // V11: Водитель — забрал / доставил
    // ================================================================

    /**
     * Водитель забрал заказ. Проставляет «Приём» → DONE, назначает водителя исполнителем.
     * Заказ двигается по lifecycle (если у SKU «Приём» задан triggers_order_status).
     */
    @PostMapping("/{employeeId}/orders/{orderId}/pickup")
    public ResponseEntity<?> pickup(@PathVariable Long employeeId, @PathVariable Long orderId) {
        // Найти услугу «Приём» (auto-add SKU с item_type=Приём) для этого заказа
        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT ois.id AS service_id, ois.order_item_id, ois.sku_id
              FROM order_item_services ois
              JOIN order_items oi ON oi.id = ois.order_item_id
              JOIN skus s ON s.id = ois.sku_id
             WHERE oi.order_id = :oid
               AND s.is_auto_add = TRUE
               AND ois.status != 'DONE' AND ois.status != 'CANCELLED'
               AND EXISTS (SELECT 1 FROM sku_attributes sa WHERE sa.sku_id = s.id AND sa.attr_key = 'item_type'
                           AND sa.attr_value IN (SELECT CAST(id AS text) FROM item_types WHERE name = 'Приём'))
             LIMIT 1
        """, Map.of("oid", orderId));

        if (rows.isEmpty()) {
            return ResponseEntity.ok(Map.of("ok", false, "message", "Услуга «Приём» не найдена или уже выполнена"));
        }
        Long serviceId = ((Number) rows.get(0).get("service_id")).longValue();
        Long orderItemId = ((Number) rows.get(0).get("order_item_id")).longValue();
        Long skuId = ((Number) rows.get(0).get("sku_id")).longValue();

        // Назначить водителя исполнителем
        jdbc.update("INSERT INTO service_assignees (order_item_service_id, employee_id) VALUES (:s, :e) ON CONFLICT DO NOTHING",
                Map.of("s", serviceId, "e", employeeId));
        // Поставить DONE
        jdbc.update("UPDATE order_item_services SET status = 'DONE', updated_at = NOW() WHERE id = :id",
                Map.of("id", serviceId));
        recalcItemStatusByService(serviceId);
        // Обновить actual_pickup_date если не заполнена.
        // Слот НЕ проставляем: раньше сюда жёстко писалось '08:00-12:00' — слот из
        // старого захардкоженного набора, которого нет в справочнике. Такой заказ
        // попадал на доске логистики в зону «вне графика». Пусть остаётся пустым —
        // оператор назначит слот перетаскиванием.
        jdbc.update("UPDATE orders SET actual_pickup_date = CURRENT_DATE WHERE id = :oid AND actual_pickup_date IS NULL",
                Map.of("oid", orderId));

        return ResponseEntity.ok(Map.of("ok", true, "message", "Забор зафиксирован"));
    }

    /**
     * Водитель доставил заказ. Проставляет «Доставка» → DONE, назначает водителя.
     * Заказ → DELIVERED (если у SKU «Доставка» задан triggers_order_status).
     */
    @PostMapping("/{employeeId}/orders/{orderId}/deliver")
    public ResponseEntity<?> deliver(@PathVariable Long employeeId, @PathVariable Long orderId) {
        // Проверяем: все не-excluded позиции DONE?
        Long notDone = jdbc.queryForObject("""
            SELECT COUNT(*)
              FROM order_items oi
             WHERE oi.order_id = :oid AND oi.status NOT IN ('DONE', 'CANCELLED')
               AND NOT EXISTS (
                   SELECT 1 FROM order_item_services ois
                   JOIN skus s ON s.id = ois.sku_id AND s.exclude_from_status_calc = TRUE
                   WHERE ois.order_item_id = oi.id
               )
        """, Map.of("oid", orderId), Long.class);

        boolean allReady = notDone == null || notDone == 0;

        // Найти услугу «Доставка»
        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT ois.id AS service_id, ois.order_item_id, ois.sku_id
              FROM order_item_services ois
              JOIN order_items oi ON oi.id = ois.order_item_id
              JOIN skus s ON s.id = ois.sku_id
             WHERE oi.order_id = :oid
               AND s.is_auto_add = TRUE
               AND ois.status != 'DONE' AND ois.status != 'CANCELLED'
               AND EXISTS (SELECT 1 FROM sku_attributes sa WHERE sa.sku_id = s.id AND sa.attr_key = 'item_type'
                           AND sa.attr_value IN (SELECT CAST(id AS text) FROM item_types WHERE name = 'Доставка'))
             LIMIT 1
        """, Map.of("oid", orderId));

        if (rows.isEmpty()) {
            return ResponseEntity.ok(Map.of("ok", false, "message", "Услуга «Доставка» не найдена или уже выполнена"));
        }
        Long serviceId = ((Number) rows.get(0).get("service_id")).longValue();

        // Назначить водителя
        jdbc.update("INSERT INTO service_assignees (order_item_service_id, employee_id) VALUES (:s, :e) ON CONFLICT DO NOTHING",
                Map.of("s", serviceId, "e", employeeId));
        // DONE
        jdbc.update("UPDATE order_item_services SET status = 'DONE', updated_at = NOW() WHERE id = :id",
                Map.of("id", serviceId));
        recalcItemStatusByService(serviceId);
        // Обновить actual_delivery_date. Слот не проставляем — см. комментарий в pickup().
        jdbc.update("UPDATE orders SET actual_delivery_date = CURRENT_DATE WHERE id = :oid AND actual_delivery_date IS NULL",
                Map.of("oid", orderId));
        // Заказ → DELIVERED
        jdbc.update("UPDATE orders SET status = 'DELIVERED', version = version + 1, updated_at = NOW() WHERE id = :oid",
                Map.of("oid", orderId));

        return ResponseEntity.ok(Map.of("ok", true, "all_ready", allReady,
                "message", allReady ? "Доставлено" : "Доставлено (предупреждение: не все позиции были готовы)"));
    }
}
