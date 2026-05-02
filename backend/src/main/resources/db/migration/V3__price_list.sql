-- Прайс-лист: пересечение типов позиций и услуг с ценой
CREATE TABLE IF NOT EXISTS price_list (
    id              BIGSERIAL PRIMARY KEY,
    item_type_id    BIGINT NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
    service_def_id  BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    price           NUMERIC(12,2),
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (item_type_id, service_def_id)
);

-- Заполнить cross-product для всех существующих пар
INSERT INTO price_list (item_type_id, service_def_id, price, is_active)
SELECT it.id, sd.id, NULL, FALSE
FROM item_types it CROSS JOIN service_definitions sd
ON CONFLICT DO NOTHING;

-- Перенести активные связи из старой таблицы, скопировав base_price
UPDATE price_list pl
SET is_active = TRUE,
    price = sd.base_price
FROM item_type_services its
JOIN service_definitions sd ON sd.id = its.service_def_id
WHERE pl.item_type_id = its.item_type_id
  AND pl.service_def_id = its.service_def_id;

-- Удалить старую таблицу
DROP TABLE IF EXISTS item_type_services;
