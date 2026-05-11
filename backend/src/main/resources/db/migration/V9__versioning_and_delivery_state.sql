-- =====================================================================================
-- V9: Версионирование услуг/типов позиций/прайса + per-item статус доставки.
--
-- ПРЕДЫСТОРИЯ (встреча с архитектором Мишей 11 мая):
--   • «Услуга — это SKU. Когда меняешь её атрибуты, должна появляться новая версия,
--      старая остаётся в архиве. В корзине ссылка на конкретную версию.»
--   • «Доставка — отдельная подсистема, может закрыться частично (1 из 5 ковров
--      потерян в дороге → весь заказ не "доставлен", а "частично доставлен").»
--
-- РЕШЕНИЕ В ЭТОЙ МИГРАЦИИ:
--   1. Версии для service_definitions, item_types, price_list. Master хранит
--      «текущее значение» (для быстрых каталожных селектов и UI редактирования),
--      _versions хранит всю историю изменений по версии. is_active в price_list
--      остаётся флагом на мастере — это не атрибут SKU, а сценарий «временно скрыть».
--   2. В order_items и order_item_services добавляются FK на конкретные версии.
--      Заполняются для всех новых записей; в исторических они NULL — отображаем
--      через JOIN с COALESCE-fallback на master.
--   3. order_items.delivery_state — PENDING / DELIVERED / LOST. По умолчанию PENDING.
--   4. orders.status — статус PARTIALLY_DELIVERED появляется как новое значение
--      VARCHAR-колонки. Схему не трогаем, изменения только в Java enum.
-- =====================================================================================

-- ---------- 1. service_definition_versions ----------

CREATE TABLE IF NOT EXISTS service_definition_versions (
    id            BIGSERIAL PRIMARY KEY,
    master_id     BIGINT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
    version_num   INT NOT NULL,
    -- Snapshot всех «версионируемых» атрибутов.
    name          VARCHAR(255) NOT NULL,
    base_price    NUMERIC(12,2) NOT NULL,
    pricing_type  VARCHAR(20)   NOT NULL,
    -- Метаданные.
    valid_from    TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_to      TIMESTAMP,                       -- NULL = текущая версия
    changed_by    VARCHAR(100),                    -- логин оператора или 'worker:<id>'
    UNIQUE (master_id, version_num)
);
CREATE INDEX IF NOT EXISTS idx_service_def_versions_master ON service_definition_versions(master_id);

-- В master добавим ссылку на текущую версию для быстрого JOIN'а.
ALTER TABLE service_definitions
    ADD COLUMN IF NOT EXISTS current_version_id BIGINT REFERENCES service_definition_versions(id);

-- Заливаем версию №1 для каждой существующей записи.
INSERT INTO service_definition_versions(master_id, version_num, name, base_price, pricing_type, valid_from, changed_by)
SELECT id, 1, name, base_price, pricing_type, created_at, 'system:migration_v9'
FROM service_definitions
WHERE NOT EXISTS (
    SELECT 1 FROM service_definition_versions sdv WHERE sdv.master_id = service_definitions.id
);

UPDATE service_definitions sd
   SET current_version_id = (
       SELECT id FROM service_definition_versions sdv
        WHERE sdv.master_id = sd.id AND sdv.valid_to IS NULL
        ORDER BY version_num DESC LIMIT 1
   )
WHERE current_version_id IS NULL;

-- ---------- 2. item_type_versions ----------

CREATE TABLE IF NOT EXISTS item_type_versions (
    id              BIGSERIAL PRIMARY KEY,
    master_id       BIGINT NOT NULL REFERENCES item_types(id) ON DELETE CASCADE,
    version_num     INT NOT NULL,
    name            VARCHAR(255) NOT NULL,
    is_default      BOOLEAN NOT NULL,
    default_price   NUMERIC(12,2),
    free_threshold  NUMERIC(12,2),
    valid_from      TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_to        TIMESTAMP,
    changed_by      VARCHAR(100),
    UNIQUE (master_id, version_num)
);
CREATE INDEX IF NOT EXISTS idx_item_type_versions_master ON item_type_versions(master_id);

ALTER TABLE item_types
    ADD COLUMN IF NOT EXISTS current_version_id BIGINT REFERENCES item_type_versions(id);

INSERT INTO item_type_versions(master_id, version_num, name, is_default, default_price, free_threshold, valid_from, changed_by)
SELECT id, 1, name, is_default, default_price, free_threshold, created_at, 'system:migration_v9'
FROM item_types
WHERE NOT EXISTS (
    SELECT 1 FROM item_type_versions itv WHERE itv.master_id = item_types.id
);

UPDATE item_types it
   SET current_version_id = (
       SELECT id FROM item_type_versions itv
        WHERE itv.master_id = it.id AND itv.valid_to IS NULL
        ORDER BY version_num DESC LIMIT 1
   )
WHERE current_version_id IS NULL;

-- ---------- 3. price_list_versions ----------
-- Версионируем ТОЛЬКО price и cost_price. is_active остаётся на master.

CREATE TABLE IF NOT EXISTS price_list_versions (
    id          BIGSERIAL PRIMARY KEY,
    master_id   BIGINT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    price       NUMERIC(12,2),
    cost_price  NUMERIC(12,2),
    valid_from  TIMESTAMP NOT NULL DEFAULT NOW(),
    valid_to    TIMESTAMP,
    changed_by  VARCHAR(100),
    UNIQUE (master_id, version_num)
);
CREATE INDEX IF NOT EXISTS idx_price_list_versions_master ON price_list_versions(master_id);

ALTER TABLE price_list
    ADD COLUMN IF NOT EXISTS current_version_id BIGINT REFERENCES price_list_versions(id);

INSERT INTO price_list_versions(master_id, version_num, price, cost_price, valid_from, changed_by)
SELECT id, 1, price, cost_price, created_at, 'system:migration_v9'
FROM price_list
WHERE NOT EXISTS (
    SELECT 1 FROM price_list_versions plv WHERE plv.master_id = price_list.id
);

UPDATE price_list pl
   SET current_version_id = (
       SELECT id FROM price_list_versions plv
        WHERE plv.master_id = pl.id AND plv.valid_to IS NULL
        ORDER BY version_num DESC LIMIT 1
   )
WHERE current_version_id IS NULL;

-- ---------- 4. Ссылки на версии в заказах ----------
-- NULL означает «исторический заказ до миграции» — отображаем через JOIN с COALESCE.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS item_type_version_id BIGINT REFERENCES item_type_versions(id);

ALTER TABLE order_item_services
    ADD COLUMN IF NOT EXISTS service_def_version_id BIGINT REFERENCES service_definition_versions(id),
    ADD COLUMN IF NOT EXISTS price_list_version_id  BIGINT REFERENCES price_list_versions(id);

-- Заполняем version_id для существующих позиций — берём текущую (только) версию.
UPDATE order_items oi
   SET item_type_version_id = (SELECT current_version_id FROM item_types WHERE id = oi.item_type_id)
WHERE item_type_version_id IS NULL;

UPDATE order_item_services ois
   SET service_def_version_id = (SELECT current_version_id FROM service_definitions WHERE id = ois.service_def_id)
WHERE service_def_version_id IS NULL;

-- ---------- 5. delivery_state per-item ----------
-- PENDING — позиция ещё не доставлена клиенту.
-- DELIVERED — водитель отметил, что отдал.
-- LOST — водитель отметил «не довёз» (потерял/повредил). Заказ переходит
-- в PARTIALLY_DELIVERED, проблема выводится на главную, оператор решает —
-- ручками создаёт гарантию или другую компенсацию.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS delivery_state VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- Для уже доставленных заказов проставим DELIVERED, чтобы статистика была корректной.
UPDATE order_items oi
   SET delivery_state = 'DELIVERED'
  FROM orders o
 WHERE o.id = oi.order_id
   AND o.status IN ('DELIVERED','COMPLETED')
   AND oi.delivery_state = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_order_items_delivery_state
    ON order_items(delivery_state)
    WHERE delivery_state IN ('LOST');
