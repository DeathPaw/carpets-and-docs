-- Migration V2: Clients expansion, Orders expansion, Order items expansion, Defects

-- Clients expansion
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type VARCHAR(20) NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS extra_phone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS inn VARCHAR(20);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person VARCHAR(255);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_pensioner BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_problem BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_regular BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS district VARCHAR(255);

-- Orders expansion
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS legacy_id BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time_slot VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_time_slot VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_district VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_district VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Order items expansion
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS area NUMERIC(8,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS running_meters NUMERIC(8,2);

-- Defects reference table
CREATE TABLE IF NOT EXISTS defect_definitions (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    surcharge_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Defects linked to service definitions (which defects apply to which services)
CREATE TABLE IF NOT EXISTS service_defects (
    service_def_id  BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    defect_def_id   BIGINT NOT NULL REFERENCES defect_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (service_def_id, defect_def_id)
);

-- Defects applied to specific order item services
CREATE TABLE IF NOT EXISTS order_item_service_defects (
    order_item_service_id BIGINT NOT NULL REFERENCES order_item_services(id) ON DELETE CASCADE,
    defect_def_id         BIGINT NOT NULL REFERENCES defect_definitions(id) ON DELETE CASCADE,
    PRIMARY KEY (order_item_service_id, defect_def_id)
);
