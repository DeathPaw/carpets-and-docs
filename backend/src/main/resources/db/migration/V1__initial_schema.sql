-- =================================================================================
-- Baseline-схема системы учёта заказов «Производство ковров».
-- Объединяет все ранее существовавшие миграции V1..V13 в одну.
-- Безопасно для свежей установки. Для установок с уже применёнными V1..V13 нужно
-- выполнить `mvn flyway:repair` (или DELETE FROM flyway_schema_history; для test/dev)
-- — Spring Boot не пересчитает контрольные суммы автоматически.
-- =================================================================================

-- ---------- Справочники ----------

-- Клиенты (физ.лица и организации)
CREATE TABLE IF NOT EXISTS clients (
    id                   BIGSERIAL PRIMARY KEY,
    client_type          VARCHAR(20)  NOT NULL DEFAULT 'INDIVIDUAL',  -- INDIVIDUAL | LEGAL_ENTITY
    name                 VARCHAR(255) NOT NULL,
    first_name           VARCHAR(255),
    last_name            VARCHAR(255),
    phone                VARCHAR(50),
    extra_phone          VARCHAR(50),
    email                VARCHAR(255),
    address              TEXT,
    district             VARCHAR(255),
    inn                  VARCHAR(20),
    contact_person       VARCHAR(255),
    contact_person_phone VARCHAR(50),
    comment              TEXT,
    is_pensioner         BOOLEAN NOT NULL DEFAULT FALSE,
    is_problem           BOOLEAN NOT NULL DEFAULT FALSE,
    is_regular           BOOLEAN NOT NULL DEFAULT FALSE,
    -- Координаты с DaData для отображения на карте.
    lat                  NUMERIC(10,7),
    lon                  NUMERIC(10,7),
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Типы позиций (Ковёр, Палас, Доставка и т.п.)
-- is_default=true — позиция автоматически добавляется в каждый новый заказ (например, доставка).
-- is_deleted=true — soft-delete: тип скрыт в формах создания, но исторические заказы продолжают
--                  ссылаться на него (FK сохраняется). Жёсткое удаление невозможно, потому что
--                  на тип ссылаются order_items.
CREATE TABLE IF NOT EXISTS item_types (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL UNIQUE,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    default_price   NUMERIC(12,2),
    free_threshold  NUMERIC(12,2),  -- сумма заказа, выше которой default_price = 0 (бесплатная доставка)
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Шаблоны услуг (Чистка, Стирка, Покраска и т.д.)
-- is_deleted=true — soft-delete: услуга скрыта в новых заказах, исторические сохраняют ссылки.
CREATE TABLE IF NOT EXISTS service_definitions (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(255) NOT NULL UNIQUE,
    base_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    pricing_type VARCHAR(20)   NOT NULL DEFAULT 'FIXED',  -- FIXED | BY_WEIGHT | BY_AREA | BY_PERIMETER
    is_deleted   BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Прайс-лист: пересечение типов позиций и услуг с ценой и себестоимостью.
-- is_active=true — услуга доступна для этого типа.
CREATE TABLE IF NOT EXISTS price_list (
    id              BIGSERIAL PRIMARY KEY,
    item_type_id    BIGINT NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
    service_def_id  BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    price           NUMERIC(12,2),
    cost_price      NUMERIC(12,2),  -- для расчёта прибыли в Доходности
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (item_type_id, service_def_id)
);

-- Сотрудники / исполнители
CREATE TABLE IF NOT EXISTS employees (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    contact     VARCHAR(255),
    active      BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-delete: уволенный сотрудник active=false
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Модификаторы цены (наценки/скидки в %): «Срочно +25%», «Постоянный клиент −10%»
CREATE TABLE IF NOT EXISTS price_modifiers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    percent     NUMERIC(5,2) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Привязка модификаторов к клиентам — каждый новый заказ клиента получит эти модификаторы
CREATE TABLE IF NOT EXISTS client_modifiers (
    client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    modifier_id BIGINT NOT NULL REFERENCES price_modifiers(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, modifier_id)
);

-- Дефекты (опционально, привязка к услугам и наценка)
CREATE TABLE IF NOT EXISTS defect_definitions (
    id                BIGSERIAL PRIMARY KEY,
    name              VARCHAR(255) NOT NULL,
    surcharge_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_defects (
    service_def_id BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    defect_def_id  BIGINT NOT NULL REFERENCES defect_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (service_def_id, defect_def_id)
);

-- Справочник районов (адреса клиентов и заказов)
CREATE TABLE IF NOT EXISTS districts (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Заказы ----------

CREATE TABLE IF NOT EXISTS orders (
    id                       BIGSERIAL PRIMARY KEY,
    client_id                BIGINT REFERENCES clients(id),
    client_name              VARCHAR(255) NOT NULL,
    comment                  TEXT,
    status                   VARCHAR(50) NOT NULL DEFAULT 'LEAD',
    is_warranty              BOOLEAN NOT NULL DEFAULT FALSE,
    parent_order_id          BIGINT REFERENCES orders(id),
    -- Финансы
    total_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,  -- сумма до модификаторов
    discount_percent         NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- legacy, теперь через order_modifiers
    paid                     BOOLEAN NOT NULL DEFAULT FALSE,
    payment_type             VARCHAR(50),                       -- CARD | CASH | TRANSFER
    payment_date             TIMESTAMP,
    -- Логистика
    pickup_address           TEXT,
    pickup_district          VARCHAR(255),
    pickup_lat               NUMERIC(10,7),
    pickup_lon               NUMERIC(10,7),
    pickup_date              DATE,
    pickup_time_slot         VARCHAR(20),
    actual_pickup_date       DATE,
    actual_pickup_time_slot  VARCHAR(20),
    delivery_address         TEXT,
    delivery_district        VARCHAR(255),
    delivery_lat             NUMERIC(10,7),
    delivery_lon             NUMERIC(10,7),
    delivery_date            DATE,
    delivery_time_slot       VARCHAR(20),
    actual_delivery_date     DATE,
    actual_delivery_time_slot VARCHAR(20),
    -- Прочее
    legacy_id                BIGINT,                            -- ID из старой системы
    cancellation_reason      TEXT,                              -- обязательно при CANCELLED
    version                  BIGINT NOT NULL DEFAULT 0,         -- optimistic locking
    created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Позиции заказа (отдельные ковры/изделия в составе заказа)
CREATE TABLE IF NOT EXISTS order_items (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type_id        BIGINT NOT NULL REFERENCES item_types(id),
    description         TEXT,
    defects             TEXT,                                -- свободное описание дефектов
    status              VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    price               NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Размеры (используются для расчёта цены услуг с pricing_type=BY_AREA/BY_WEIGHT/BY_PERIMETER)
    length              NUMERIC(8,2),
    width               NUMERIC(8,2),
    weight              NUMERIC(8,2),
    area                NUMERIC(8,2),
    running_meters      NUMERIC(8,2),
    cancellation_reason TEXT,
    version             BIGINT NOT NULL DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Экземпляры услуг, привязанные к конкретной позиции
CREATE TABLE IF NOT EXISTS order_item_services (
    id                  BIGSERIAL PRIMARY KEY,
    order_item_id       BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    service_def_id      BIGINT NOT NULL REFERENCES service_definitions(id),
    status              VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    price               NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_manual_price     BOOLEAN NOT NULL DEFAULT FALSE,
    cancellation_reason TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Назначения исполнителей на экземпляры услуг (M:N)
CREATE TABLE IF NOT EXISTS service_assignees (
    order_item_service_id BIGINT NOT NULL REFERENCES order_item_services(id) ON DELETE CASCADE,
    employee_id           BIGINT NOT NULL REFERENCES employees(id),
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_item_service_id, employee_id)
);

-- Применённые дефекты к конкретному экземпляру услуги
CREATE TABLE IF NOT EXISTS order_item_service_defects (
    order_item_service_id BIGINT NOT NULL REFERENCES order_item_services(id) ON DELETE CASCADE,
    defect_def_id         BIGINT NOT NULL REFERENCES defect_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (order_item_service_id, defect_def_id)
);

-- Модификаторы цены, применённые к конкретному заказу
CREATE TABLE IF NOT EXISTS order_modifiers (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    modifier_id   BIGINT NOT NULL REFERENCES price_modifiers(id),
    modifier_name VARCHAR(255) NOT NULL,
    percent       NUMERIC(5,2) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Фото позиций. Хранятся в TEXT как base64 — самый простой вариант: фронт сразу
-- может встроить в data:url, бэк не делает преобразования при чтении/записи.
-- Bytea (бинарь) — теоретически на 33% компактнее, но в реальности возникали
-- проблемы с отображением JPG (вероятно, из-за strict-режима Base64.getDecoder
-- на отдельных кодировках). Для текущего объёма фото TEXT вполне достаточно.
CREATE TABLE IF NOT EXISTS order_item_photos (
    id            BIGSERIAL PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    filename      VARCHAR(255) NOT NULL,
    content_type  VARCHAR(100) NOT NULL,
    data          TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Логи и аудит ----------

CREATE TABLE IF NOT EXISTS order_status_history (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status  VARCHAR(50),
    new_status  VARCHAR(50) NOT NULL,
    changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS error_log (
    id           BIGSERIAL PRIMARY KEY,
    error_type   VARCHAR(255) NOT NULL,
    message      TEXT NOT NULL,
    request_path VARCHAR(1024),
    occurred_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   BIGINT,
    action      VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_events (
    id          BIGSERIAL PRIMARY KEY,
    client_id   BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    event_type  VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------- Индексы ----------
-- Все основные точки фильтрации и JOIN-а покрыты, чтобы планировщик не делал seq-scan.

-- Заказы
CREATE INDEX IF NOT EXISTS idx_orders_status               ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_client_id            ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at           ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_legacy_id            ON orders(legacy_id);
CREATE INDEX IF NOT EXISTS idx_orders_actual_pickup_date   ON orders(actual_pickup_date);
CREATE INDEX IF NOT EXISTS idx_orders_actual_delivery_date ON orders(actual_delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_date          ON orders(pickup_date);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date        ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_payment_date         ON orders(payment_date);
CREATE INDEX IF NOT EXISTS idx_orders_parent_order_id      ON orders(parent_order_id);

-- Позиции
CREATE INDEX IF NOT EXISTS idx_order_items_order_id     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item_type_id ON order_items(item_type_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status       ON order_items(status);

-- Услуги
CREATE INDEX IF NOT EXISTS idx_order_item_services_order_item_id  ON order_item_services(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_services_service_def_id ON order_item_services(service_def_id);
CREATE INDEX IF NOT EXISTS idx_order_item_services_status         ON order_item_services(status);

-- Назначения исполнителей
CREATE INDEX IF NOT EXISTS idx_service_assignees_employee_id            ON service_assignees(employee_id);
CREATE INDEX IF NOT EXISTS idx_service_assignees_order_item_service_id  ON service_assignees(order_item_service_id);

-- Прайс-лист
CREATE INDEX IF NOT EXISTS idx_price_list_item_type_id   ON price_list(item_type_id);
CREATE INDEX IF NOT EXISTS idx_price_list_service_def_id ON price_list(service_def_id);

-- Модификаторы
CREATE INDEX IF NOT EXISTS idx_order_modifiers_order_id   ON order_modifiers(order_id);
CREATE INDEX IF NOT EXISTS idx_client_modifiers_client_id ON client_modifiers(client_id);

-- Клиенты
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name  ON clients(LOWER(name));

-- Фото и события
CREATE INDEX IF NOT EXISTS idx_item_photos_order_item_id ON order_item_photos(order_item_id);
CREATE INDEX IF NOT EXISTS idx_client_events_client_id   ON client_events(client_id);

-- Справочники
CREATE INDEX IF NOT EXISTS idx_districts_active ON districts(is_active);

-- ---------- Базовые данные ----------

-- 18 районов Санкт-Петербурга по умолчанию.
-- Оператор может добавлять/редактировать через UI.
INSERT INTO districts (name, sort_order) VALUES
    ('Адмиралтейский',    10),
    ('Василеостровский',  20),
    ('Выборгский',        30),
    ('Калининский',       40),
    ('Кировский',         50),
    ('Колпинский',        60),
    ('Красногвардейский', 70),
    ('Красносельский',    80),
    ('Кронштадтский',     90),
    ('Курортный',        100),
    ('Московский',       110),
    ('Невский',          120),
    ('Петроградский',    130),
    ('Петродворцовый',   140),
    ('Приморский',       150),
    ('Пушкинский',       160),
    ('Фрунзенский',      170),
    ('Центральный',      180)
ON CONFLICT (name) DO NOTHING;
