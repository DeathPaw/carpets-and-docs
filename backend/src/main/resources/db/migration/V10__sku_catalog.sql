-- =====================================================================================
-- V10: Замена «гиперкуба прайса» на плоский SKU-каталог.
--
-- ПРЕДЫСТОРИЯ. До V10 каталог жил как 2D-таблица пересечений:
--    service_definitions × item_types → price_list (цена в каждой клетке).
-- При появлении третьего измерения (вес, материал, размер) таблица превращается
-- в гиперкуб, UI рассыпается. Архитектор Миша (встреча 11 мая) предложил
-- плоскую SKU-модель: каждая учётная единица — отдельная запись с массивом
-- атрибутов. UI прайса становится Excel-подобной таблицей с фасет-фильтрами.
--
-- РЕШЕНИЕ:
--   • Сносим старое (service_definitions + price_list + их versions, V9-таблицы).
--   • Добавляем:
--       - attribute_definitions  — справочник доступных атрибутов SKU.
--       - sku_groups             — группы услуг (Стирка, Чистка, Доставка).
--       - skus                   — сами единицы учёта.
--       - sku_attributes         — EAV: ключ-значение для атрибутов SKU.
--       - sku_versions           — версии для аудита изменений цен/атрибутов.
--   • order_items.perimeter      — самостоятельная колонка, как area/weight
--                                  (формула 2(L+W) работает только для прямоугольника,
--                                  а у нас могут быть овальные/круглые ковры).
--   • order_item_services        — теперь FK на skus + sku_versions.
--   • На item_types убираются is_default/default_price/free_threshold — эти
--     поля переезжают на сами SKU (см. skus.is_auto_add / free_threshold).
--
-- ВНИМАНИЕ: V10 не сохраняет существующие данные прайса/услуг. Старые заказы
-- остаются — у них order_item_services.sku_id будет NULL (history без снапшота).
-- На проде такого не делают, но у нас всё тестовое и согласовано с заказчиком.
-- =====================================================================================

-- ---------- 1. Снос старого ----------

-- Сначала FK-колонки в order_item_services и order_items (V9), затем мастер-таблицы.
ALTER TABLE order_item_services DROP COLUMN IF EXISTS service_def_version_id;
ALTER TABLE order_item_services DROP COLUMN IF EXISTS price_list_version_id;
ALTER TABLE order_items         DROP COLUMN IF EXISTS item_type_version_id;

-- Связки роль-тип позиции остаются (роль умеет работать с item_type).
-- Старая default-логика — переезжает в is_auto_add на SKU.
ALTER TABLE item_types DROP COLUMN IF EXISTS is_default;
ALTER TABLE item_types DROP COLUMN IF EXISTS default_price;
ALTER TABLE item_types DROP COLUMN IF EXISTS free_threshold;
ALTER TABLE item_types DROP COLUMN IF EXISTS current_version_id;

-- Снос версионных таблиц V9.
DROP TABLE IF EXISTS service_definition_versions CASCADE;
DROP TABLE IF EXISTS price_list_versions          CASCADE;
DROP TABLE IF EXISTS item_type_versions           CASCADE;

-- Существующие order_item_services ссылаются на service_def_id. Снимем FK
-- перед удалением service_definitions, иначе DROP не пройдёт.
ALTER TABLE order_item_services DROP CONSTRAINT IF EXISTS order_item_services_service_def_id_fkey;

-- Снос price_list (со всеми FK).
DROP TABLE IF EXISTS price_list                   CASCADE;

-- Снос service_definitions.
DROP TABLE IF EXISTS service_defects              CASCADE;
DROP TABLE IF EXISTS service_definitions          CASCADE;

-- Полностью убираем service_def_id из order_item_services — исторические данные
-- не сохраняем (всё тестовое, см. ADR в комментариях). NOT NULL-констрейнт мешал
-- INSERT'ам сидером, и хранить «осиротевший» ID без FK смысла нет.
ALTER TABLE order_item_services DROP COLUMN IF EXISTS service_def_id;

-- ---------- 2. Справочник определений атрибутов ----------

CREATE TABLE attribute_definitions (
    key         VARCHAR(64)  PRIMARY KEY,
    label       VARCHAR(255) NOT NULL,
    value_type  VARCHAR(32)  NOT NULL,    -- NUMBER | STRING | REFERENCE_ITEM_TYPE
    unit        VARCHAR(32),
    sort_order  INT          NOT NULL DEFAULT 100,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

INSERT INTO attribute_definitions (key, label, value_type, unit, sort_order) VALUES
    ('item_type',           'Тип вещи',         'REFERENCE_ITEM_TYPE', NULL,  10),
    ('material',            'Материал',         'STRING',              NULL,  20),
    ('weight_min',          'Вес от',           'NUMBER',              'кг',  30),
    ('weight_max',          'Вес до',           'NUMBER',              'кг',  31),
    ('area_min',            'Площадь от',       'NUMBER',              'м²',  40),
    ('area_max',            'Площадь до',       'NUMBER',              'м²',  41),
    ('perimeter_min',       'Периметр от',      'NUMBER',              'м',   50),
    ('perimeter_max',       'Периметр до',      'NUMBER',              'м',   51),
    ('length_min',          'Длина от',         'NUMBER',              'м',   60),
    ('length_max',          'Длина до',         'NUMBER',              'м',   61),
    ('width_min',           'Ширина от',        'NUMBER',              'м',   70),
    ('width_max',           'Ширина до',        'NUMBER',              'м',   71),
    ('running_meters_min',  'Пог. метры от',    'NUMBER',              'м',   80),
    ('running_meters_max',  'Пог. метры до',    'NUMBER',              'м',   81)
ON CONFLICT (key) DO NOTHING;

-- ---------- 3. Группы SKU ----------

CREATE TABLE sku_groups (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    sort_order  INT          NOT NULL DEFAULT 100,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ---------- 4. SKU (учётные единицы) ----------

CREATE TABLE skus (
    id                 BIGSERIAL    PRIMARY KEY,
    group_id           BIGINT       NOT NULL REFERENCES sku_groups(id),
    name               VARCHAR(255) NOT NULL,
    -- Тип ценообразования: FIXED, BY_WEIGHT, BY_AREA, BY_PERIMETER,
    -- BY_LENGTH, BY_WIDTH, BY_RUNNING_METERS.
    -- Бэк по этому полю знает, на что умножать `price` для итога.
    pricing_type       VARCHAR(32)  NOT NULL,
    price              NUMERIC(12,2),
    cost_price         NUMERIC(12,2),
    -- is_auto_add=true — этот SKU автоматически добавляется в каждый
    -- новый заказ (заменяет старую логику default-типов).
    is_auto_add        BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Порог суммы заказа: если базовая сумма >= free_threshold, цена этого
    -- SKU становится 0. Применимо к доставке/оформлению. NULL = всегда платная.
    free_threshold     NUMERIC(12,2),
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    is_deleted         BOOLEAN      NOT NULL DEFAULT FALSE,
    current_version_id BIGINT,                -- FK на sku_versions (см. ниже)
    created_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_skus_group         ON skus(group_id);
CREATE INDEX idx_skus_auto_add      ON skus(is_auto_add) WHERE is_auto_add = TRUE;
CREATE INDEX idx_skus_active        ON skus(is_active)   WHERE is_active   = TRUE;

-- ---------- 5. Атрибуты SKU (EAV) ----------

-- attr_value хранится строкой; парсится по value_type из attribute_definitions.
-- PRIMARY KEY (sku_id, attr_key, attr_value) — допускаем несколько значений
-- одного ключа (например, один SKU применим к нескольким item_type).
CREATE TABLE sku_attributes (
    sku_id     BIGINT      NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    attr_key   VARCHAR(64) NOT NULL REFERENCES attribute_definitions(key),
    attr_value VARCHAR(255) NOT NULL,
    PRIMARY KEY (sku_id, attr_key, attr_value)
);
CREATE INDEX idx_sku_attrs_key_value ON sku_attributes(attr_key, attr_value);

-- ---------- 6. Версии SKU (аудит) ----------

CREATE TABLE sku_versions (
    id                  BIGSERIAL    PRIMARY KEY,
    master_id           BIGINT       NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    version_num         INT          NOT NULL,
    -- Snapshot всех важных полей мастера + атрибутов в JSONB.
    -- JSONB здесь, а не отдельная _attribute_versions — потому что версионировать
    -- M:N (sku × attr) полноценно сложно, а в JSONB сразу видно всё состояние.
    name                VARCHAR(255) NOT NULL,
    group_id            BIGINT,
    pricing_type        VARCHAR(32)  NOT NULL,
    price               NUMERIC(12,2),
    cost_price          NUMERIC(12,2),
    is_auto_add         BOOLEAN      NOT NULL,
    free_threshold      NUMERIC(12,2),
    attributes_snapshot JSONB,                 -- {attr_key: [values...]}
    valid_from          TIMESTAMP    NOT NULL DEFAULT NOW(),
    valid_to            TIMESTAMP,
    changed_by          VARCHAR(100),
    UNIQUE (master_id, version_num)
);
CREATE INDEX idx_sku_versions_master ON sku_versions(master_id);

ALTER TABLE skus ADD CONSTRAINT skus_current_version_fk
    FOREIGN KEY (current_version_id) REFERENCES sku_versions(id);

-- ---------- 7. Связь заказов с SKU ----------

-- Колонка sku_id (NULL для исторических заказов до V10).
ALTER TABLE order_item_services
    ADD COLUMN sku_id         BIGINT REFERENCES skus(id),
    ADD COLUMN sku_version_id BIGINT REFERENCES sku_versions(id);

CREATE INDEX idx_ois_sku_id     ON order_item_services(sku_id)
    WHERE sku_id IS NOT NULL;

-- ---------- 8. Периметр позиции ----------

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS perimeter NUMERIC(8,2);

-- ---------- 9. Обновляем триггер orders.status ----------
-- Старый compute_order_status (V3) фильтровал «значимые» позиции через
-- item_types.is_default. В V10 этого поля больше нет — авто-добавление
-- вынесено на SKU. Теперь статус считаем по ВСЕМ позициям заказа.

CREATE OR REPLACE FUNCTION compute_order_status(p_order_id BIGINT)
RETURNS VARCHAR AS $$
DECLARE
    v_current_status VARCHAR;
    v_total INTEGER;
    v_done INTEGER;
    v_cancelled INTEGER;
    v_in_progress INTEGER;
    v_partially_done INTEGER;
BEGIN
    SELECT status INTO v_current_status FROM orders WHERE id = p_order_id;
    IF v_current_status IS NULL THEN RETURN NULL; END IF;
    IF v_current_status IN ('LEAD', 'DELIVERED', 'COMPLETED', 'PARTIALLY_DELIVERED') THEN
        RETURN v_current_status;
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'DONE'),
        COUNT(*) FILTER (WHERE status = 'CANCELLED'),
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'),
        COUNT(*) FILTER (WHERE status = 'PARTIALLY_DONE')
    INTO v_total, v_done, v_cancelled, v_in_progress, v_partially_done
      FROM order_items
     WHERE order_id = p_order_id;

    IF v_total = 0 THEN RETURN v_current_status; END IF;

    IF v_done + v_cancelled = v_total THEN
        IF v_done > 0 THEN RETURN 'DONE'; ELSE RETURN 'CANCELLED'; END IF;
    END IF;

    IF v_done > 0 OR v_partially_done > 0 THEN
        RETURN 'PARTIALLY_DONE';
    END IF;

    IF v_in_progress > 0 THEN
        RETURN 'IN_PROGRESS';
    END IF;

    RETURN v_current_status;
END;
$$ LANGUAGE plpgsql;
