CREATE TABLE IF NOT EXISTS price_modifiers (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    percent     NUMERIC(5,2) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_modifiers (
    client_id       BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    modifier_id     BIGINT NOT NULL REFERENCES price_modifiers(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, modifier_id)
);

CREATE TABLE IF NOT EXISTS order_modifiers (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    modifier_id     BIGINT NOT NULL REFERENCES price_modifiers(id),
    modifier_name   VARCHAR(255) NOT NULL,
    percent         NUMERIC(5,2) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
UPDATE orders SET base_amount = total_amount WHERE base_amount = 0 AND total_amount > 0;
