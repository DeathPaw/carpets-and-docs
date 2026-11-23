-- V63: количество однотипных изделий в одной позиции (ПР-002).
--
-- 46 одинаковых ковриков — одна позиция «×46», а не 46 строк. Размеры, вес и
-- площадь в позиции — на ОДНУ штуку (по ним выбирается SKU по диапазонам
-- «5–10 кг» и т.п.), а цена, метры для зарплаты и себестоимости, факт
-- контрактов и отчёты умножаются на quantity.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
