-- V13: is_manual_price на order_items.
--
-- Контекст бага: оператор вручную правил цену доставки (или free_threshold
-- зацепился и обнулил её), потом редактировал обычную позицию — recalculate-
-- DefaultItemPrices опять снапал доставку к sku.price() или ZERO. Манульный
-- ввод стирался.
--
-- Решение по аналогии с услугами (order_item_services.is_manual_price):
-- флаг TRUE = «оператор настроил цену сам, не трогать в auto-пересчётах».
-- recalculateDefaultItemPrices теперь пропускает позиции с TRUE.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN NOT NULL DEFAULT FALSE;
