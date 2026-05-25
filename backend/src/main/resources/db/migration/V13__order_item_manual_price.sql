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
--
-- ВНИМАНИЕ: после деплоя решили упростить модель — цену позиции вручную
-- больше не редактируем (только цену услуги). Столбец становится мёртвым
-- весом, V14 его дропает. Этот файл оставлен для согласованности с Flyway-
-- историей на серверах, где V13 уже применилась.

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS is_manual_price BOOLEAN NOT NULL DEFAULT FALSE;
