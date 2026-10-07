-- V50: реестры затрат и база для себестоимости (ТЗ v2, блок «Закупки, затраты и себестоимость»).
--
-- До сих пор расходы жили одной суммой на категорию и месяц (monthly_expenses)
-- — этого хватало для P&L, но не для себестоимости: нельзя сказать, во что
-- обошёлся конкретный ковёр. ТЗ просит два реестра (материальные закупки и
-- прочие затраты) и у каждой записи — способ учёта в себестоимости:
-- на месяц, на период или прямо на заказ.
--
-- Старый реестр не трогаем: он используется в отчёте P&L. Записи туда и сюда
-- дублировать нельзя — это правило документа, следим за ним в интерфейсе.

CREATE TABLE IF NOT EXISTS cost_entries (
    id             BIGSERIAL PRIMARY KEY,
    -- MATERIAL — покупка у поставщика (химия, инструмент, сапоги),
    -- OTHER — прочая затрата (электричество, аренда, ремонт, услуги).
    kind           VARCHAR(20) NOT NULL,
    entry_date     DATE NOT NULL,
    category_id    BIGINT REFERENCES expense_categories(id),
    title          VARCHAR(255) NOT NULL,
    -- Количество и единица имеют смысл только у материальных закупок.
    quantity       NUMERIC(12,3),
    unit           VARCHAR(20),
    amount         NUMERIC(12,2) NOT NULL,
    -- Поставщик или контрагент — одно поле: смысл один, названия разные.
    counterparty   VARCHAR(255),
    comment        TEXT,
    -- Способ учёта в себестоимости: MONTH | PERIOD | ORDER.
    allocation     VARCHAR(20) NOT NULL DEFAULT 'MONTH',
    -- Для MONTH — первое число месяца отнесения.
    alloc_month    DATE,
    -- Для PERIOD — границы включительно.
    alloc_from     DATE,
    alloc_to       DATE,
    -- Для ORDER — прямой расход на конкретный заказ.
    alloc_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    created_by     VARCHAR(150),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT cost_entries_kind_check  CHECK (kind IN ('MATERIAL', 'OTHER')),
    CONSTRAINT cost_entries_amount_check CHECK (amount >= 0),
    CONSTRAINT cost_entries_alloc_check CHECK (
        (allocation = 'MONTH'  AND alloc_month IS NOT NULL)
     OR (allocation = 'PERIOD' AND alloc_from IS NOT NULL AND alloc_to IS NOT NULL AND alloc_from <= alloc_to)
     OR (allocation = 'ORDER'  AND alloc_order_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_cost_entries_date  ON cost_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_cost_entries_kind  ON cost_entries(kind);
CREATE INDEX IF NOT EXISTS idx_cost_entries_month ON cost_entries(alloc_month);
CREATE INDEX IF NOT EXISTS idx_cost_entries_order ON cost_entries(alloc_order_id)
    WHERE alloc_order_id IS NOT NULL;

-- Вложения к затрате: счета, акты, фото чека.
CREATE TABLE IF NOT EXISTS cost_entry_files (
    id            BIGSERIAL PRIMARY KEY,
    cost_entry_id BIGINT NOT NULL REFERENCES cost_entries(id) ON DELETE CASCADE,
    filename      VARCHAR(255),
    content_type  VARCHAR(100),
    -- base64, как у фотографий позиций: отдельного файлового хранилища в проекте нет.
    data          TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_entry_files_entry ON cost_entry_files(cost_entry_id);

-- ---------------------------------------------------------------------------
-- База распределения: обработанные метры по дате завершения обработки.
--
-- Раньше момент «ковёр готов» нигде не фиксировался — статус позиции менялся,
-- и понять, в каком месяце работа закончена, можно было только по updated_at,
-- который двигает любая правка. Заводим явную дату.
-- ---------------------------------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- Историческим позициям проставляем время последнего изменения: более точных
-- данных в базе нет, а без этого метраж прошлых месяцев окажется нулевым.
UPDATE order_items
   SET completed_at = updated_at
 WHERE completed_at IS NULL
   AND status = 'DONE';

CREATE INDEX IF NOT EXISTS idx_order_items_completed_at ON order_items(completed_at)
    WHERE completed_at IS NOT NULL;
