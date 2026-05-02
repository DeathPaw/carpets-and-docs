-- =============================================================
-- Схема базы данных: Система учёта заказов для производства ковров
-- Применять вручную: psql -d carpet_db -f schema.sql
-- =============================================================

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(50),
    email       VARCHAR(255),
    address     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Справочник типов позиций (например: Ковёр, Иной объект)
CREATE TABLE IF NOT EXISTS item_types (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL UNIQUE,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    default_price   NUMERIC(12,2),
    free_threshold  NUMERIC(12,2),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Шаблоны услуг (справочник, например: Чистка, Покраска)
CREATE TABLE IF NOT EXISTS service_definitions (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    base_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
    pricing_type VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Привязка услуг к типам позиций (M:N)
CREATE TABLE IF NOT EXISTS item_type_services (
    item_type_id    BIGINT NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
    service_def_id  BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (item_type_id, service_def_id)
);

-- Сотрудники / исполнители
CREATE TABLE IF NOT EXISTS employees (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    contact     VARCHAR(255),
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Заказы
CREATE TABLE IF NOT EXISTS orders (
    id              BIGSERIAL PRIMARY KEY,
    client_id       BIGINT REFERENCES clients(id),
    client_name     VARCHAR(255) NOT NULL,
    comment         TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'LEAD',
    is_warranty     BOOLEAN NOT NULL DEFAULT FALSE,
    parent_order_id BIGINT REFERENCES orders(id),
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid            BOOLEAN NOT NULL DEFAULT FALSE,
    payment_type    VARCHAR(50),
    payment_date    TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Позиции заказа (отдельные единицы работы в составе заказа)
CREATE TABLE IF NOT EXISTS order_items (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_type_id    BIGINT NOT NULL REFERENCES item_types(id),
    description     TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,
    length          NUMERIC(8,2),
    width           NUMERIC(8,2),
    weight          NUMERIC(8,2),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Экземпляры услуг, привязанные к конкретной позиции заказа
CREATE TABLE IF NOT EXISTS order_item_services (
    id              BIGSERIAL PRIMARY KEY,
    order_item_id   BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    service_def_id  BIGINT NOT NULL REFERENCES service_definitions(id),
    status          VARCHAR(50) NOT NULL DEFAULT 'CREATED',
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_manual_price BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Назначения исполнителей на экземпляры услуг (M:N)
CREATE TABLE IF NOT EXISTS service_assignees (
    order_item_service_id   BIGINT NOT NULL REFERENCES order_item_services(id) ON DELETE CASCADE,
    employee_id             BIGINT NOT NULL REFERENCES employees(id),
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_item_service_id, employee_id)
);

-- История изменений статуса заказа
CREATE TABLE IF NOT EXISTS order_status_history (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    old_status  VARCHAR(50),
    new_status  VARCHAR(50) NOT NULL,
    changed_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Лог системных ошибок (HTTP 500, 422, 409)
CREATE TABLE IF NOT EXISTS error_log (
    id              BIGSERIAL PRIMARY KEY,
    error_type      VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    request_path    VARCHAR(1024),
    occurred_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Аудит лог изменений объектов системы
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   BIGINT,
    action      VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
