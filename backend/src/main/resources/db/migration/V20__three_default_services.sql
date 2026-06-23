-- V20: 3 чистые позиции по умолчанию — Прием, Доставка, Оформление.
--
-- Было (V18): 4 auto-add SKU (Доставка-забор, Доставка-отвоз, Оформление, Приём)
-- → attachAutoAddSkus собирал их в 3 «жирные» позиции (Оформление + Забор[Доставка+Приём] + Отвоз).
-- Оператор просил «3 услуги по умолчанию: Прием, Доставка, Оформление с аналогичными услугами»,
-- то есть 3 отдельные позиции, в каждой по одной одноимённой услуге.
--
-- Решение: создаём новый SKU «Доставка» (триггерит заказ → DELIVERED при DONE),
-- снимаем is_auto_add с «Доставка (забор)»/«Доставка (отвоз)» — они остаются
-- как SKU (для исторических заказов и manual swap), но больше не лезут в новые заказы.
-- Старые заказы не трогаем: их order_items уже привязаны к нужным SKU.

-- 1. Новый «Доставка».
INSERT INTO skus (group_id, name, pricing_type, price, cost_price, is_auto_add,
                  free_threshold, auto_complete_on_status, triggers_order_status,
                  exclude_from_status_calc, is_active)
VALUES (2, 'Доставка', 'FIXED', 500.00, 150.00, TRUE, 4000.00,
        NULL, 'DELIVERED', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- 2. Версия v1 + current_version_id + атрибут item_type.
INSERT INTO sku_versions (master_id, version_num, name, group_id, pricing_type, price,
                          cost_price, is_auto_add, free_threshold, attributes_snapshot, changed_by)
SELECT id, 1, name, group_id, pricing_type, price, cost_price, is_auto_add, free_threshold,
       jsonb_build_object('item_type', jsonb_build_array('12')), 'seed-v20'
  FROM skus
 WHERE name = 'Доставка' AND current_version_id IS NULL;

UPDATE skus
   SET current_version_id = (SELECT id FROM sku_versions WHERE master_id = skus.id AND version_num = 1)
 WHERE name = 'Доставка' AND current_version_id IS NULL;

INSERT INTO sku_attributes (sku_id, attr_key, attr_value)
SELECT id, 'item_type', '12' FROM skus WHERE name = 'Доставка'
ON CONFLICT DO NOTHING;

-- 3. Снимаем auto-add с забора и отвоза. Они остаются доступными для manual-добавления
--    через SkuPicker и для свапа с Самовывозом, но в новых заказах их больше не будет.
UPDATE skus SET is_auto_add = FALSE
 WHERE name IN ('Доставка (забор)', 'Доставка (отвоз)');

-- 4. Жизненный цикл «Приём»: триггерит заказ в IN_PROGRESS при DONE
--    (раньше auto_complete='IN_PROGRESS' — это работало в обратную сторону: услуга
--    закрывалась когда заказ уже был в IN_PROGRESS, что бессмысленно для активного
--    действия «принять ковёр в работу»).
UPDATE skus
   SET auto_complete_on_status = NULL,
       triggers_order_status = 'IN_PROGRESS'
 WHERE name = 'Приём';
