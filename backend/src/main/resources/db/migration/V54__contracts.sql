-- V54: контракты юрлиц и план-факт (ТЗ v2, блок 6).
--
-- У юрлиц работа идёт по договору: фиксированная цена за м², плановый объём
-- на срок действия и отдельный учёт того, сколько метров уже сдано. Карточка
-- самого юрлица у нас уже есть (clients с типом LEGAL_ENTITY) — расширять её
-- не нужно, нужен договор и связь с заказами.

CREATE TABLE IF NOT EXISTS contracts (
    id             BIGSERIAL PRIMARY KEY,
    client_id      BIGINT NOT NULL REFERENCES clients(id),
    number         VARCHAR(100) NOT NULL,
    -- COMMERCIAL — обычный договор, GOVERNMENT — государственный контракт.
    kind           VARCHAR(20) NOT NULL DEFAULT 'COMMERCIAL',
    signed_on      DATE NOT NULL,
    expires_on     DATE,
    planned_sqm    NUMERIC(12,2),
    -- Одна цена за метр на весь контракт: несколько тарифов внутри договора
    -- в первой версии не предусмотрены (прямая оговорка ТЗ).
    price_per_sqm  NUMERIC(12,2) NOT NULL,
    comment        TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     VARCHAR(150),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT contracts_kind_check CHECK (kind IN ('COMMERCIAL', 'GOVERNMENT')),
    CONSTRAINT contracts_period_check CHECK (expires_on IS NULL OR expires_on >= signed_on)
);

CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);

-- Файл договора и приложения.
CREATE TABLE IF NOT EXISTS contract_files (
    id           BIGSERIAL PRIMARY KEY,
    contract_id  BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    filename     VARCHAR(255),
    content_type VARCHAR(100),
    data         TEXT NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Связь работы с контрактом.
--
-- Цену за метр запоминаем на заказе: при изменении контракта ранее учтённые
-- заказы пересчитывать нельзя. Дата сдачи — отдельно от доставки: до сдачи
-- метры в факт контракта не идут (приёмочный тест AT06).
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contract_id             BIGINT REFERENCES contracts(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contract_price_per_sqm  NUMERIC(12,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contract_delivered_at   TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_orders_contract ON orders(contract_id) WHERE contract_id IS NOT NULL;

-- Выездная чистка тоже может идти по контракту; её факт засчитывается по
-- завершению работ.
ALTER TABLE onsite_cleanings ADD COLUMN IF NOT EXISTS contract_id BIGINT REFERENCES contracts(id);

CREATE INDEX IF NOT EXISTS idx_onsite_contract ON onsite_cleanings(contract_id)
    WHERE contract_id IS NOT NULL;

-- История сдачи и её отмены: ошибочную сдачу можно откатить, но след остаётся.
CREATE TABLE IF NOT EXISTS contract_deliveries (
    id           BIGSERIAL PRIMARY KEY,
    contract_id  BIGINT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    order_id     BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    cleaning_id  BIGINT REFERENCES onsite_cleanings(id) ON DELETE CASCADE,
    sqm          NUMERIC(12,2) NOT NULL,
    action       VARCHAR(20) NOT NULL,
    reason       TEXT,
    created_by   VARCHAR(150),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT contract_deliveries_action_check CHECK (action IN ('DELIVERED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_contract_deliveries ON contract_deliveries(contract_id, created_at);
