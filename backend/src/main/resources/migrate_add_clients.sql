-- Миграция: добавление таблицы клиентов
-- psql -U glebramazanov -d carpet_db -f backend/src/main/resources/migrate_add_clients.sql

CREATE TABLE IF NOT EXISTS clients (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    phone       VARCHAR(50),
    email       VARCHAR(255),
    address     TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
