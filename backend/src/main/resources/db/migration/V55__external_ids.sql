-- V55: внешние идентификаторы для обмена через Excel (ТЗ v2, блок 8).
--
-- Импорт опознаёт записи только по внешнему ID: угадывать клиента или контракт
-- по похожему названию запрещено прямой оговоркой ТЗ. Повторная загрузка файла
-- с теми же ID обновляет записи, а не плодит дубли.
--
-- Колонки добавляются мягко: у всех существующих записей external_id остаётся
-- NULL, и уникальность на них не распространяется (частичный индекс).

ALTER TABLE clients   ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
-- КПП требуется шаблоном юрлиц; у частных клиентов остаётся пустым.
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS kpp VARCHAR(20);
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_external_id ON clients(external_id)
    WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external_id ON orders(external_id)
    WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_external_id ON contracts(external_id)
    WHERE external_id IS NOT NULL;

-- Журнал загрузок: видно, кто и что залил, и можно отличить импортированные
-- записи от заведённых руками.
CREATE TABLE IF NOT EXISTS import_batches (
    id           BIGSERIAL PRIMARY KEY,
    kind         VARCHAR(40) NOT NULL,
    template_version VARCHAR(20) NOT NULL,
    filename     VARCHAR(255),
    update_mode  VARCHAR(20) NOT NULL,
    created_count  INTEGER NOT NULL DEFAULT 0,
    updated_count  INTEGER NOT NULL DEFAULT 0,
    skipped_count  INTEGER NOT NULL DEFAULT 0,
    created_by   VARCHAR(150),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT import_batches_mode_check CHECK (update_mode IN ('SKIP', 'UPDATE'))
);

CREATE INDEX IF NOT EXISTS idx_import_batches_created ON import_batches(created_at DESC);
