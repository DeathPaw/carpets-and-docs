-- V16: добавляем два auto-add SKU — «Оформление» и «Приём».
--
-- «Оформление» — оператор оформил заказ. Auto-assignится на оператора-создателя
-- (если у пользователя role=OPERATOR). DONE двигает заказ LEAD→CREATED.
-- «Приём» — стирщик принял ковёр в работу. DONE двигает CREATED/FOR_PICKUP → IN_PROGRESS.
--
-- Оба:
--  • is_auto_add=TRUE: при создании заказа автоматически добавляются.
--  • exclude_from_status_calc=TRUE: не блокируют переход в DONE (как и доставки).
--  • pricing_type=FIXED, price=0 — это не платные услуги, а вехи lifecycle.
--  • Группа «Доставка» (id=2): группировка нелогична, но у нас нет отдельной
--    sku_group «Lifecycle». Создавать ради двух SKU оверкилл; в UI группа
--    показывается только в редакторе SKU, для оператора это прозрачно.

INSERT INTO skus (group_id, name, pricing_type, price, cost_price, is_auto_add,
                  free_threshold, auto_complete_on_status, triggers_order_status,
                  exclude_from_status_calc, is_active)
VALUES
  (2, 'Оформление', 'FIXED', 0, 0, TRUE, NULL, NULL,        'CREATED',     TRUE, TRUE),
  (2, 'Приём',      'FIXED', 0, 0, TRUE, NULL, NULL,        'IN_PROGRESS', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Создаём v1 для новых SKU, чтобы snapshot был.
INSERT INTO sku_versions (master_id, version_num, name, group_id, pricing_type, price,
                          cost_price, is_auto_add, free_threshold, attributes_snapshot, changed_by)
SELECT id, 1, name, group_id, pricing_type, price, cost_price, is_auto_add, free_threshold,
       jsonb_build_object('item_type', jsonb_build_array('12')), 'seed-v16'
  FROM skus
 WHERE name IN ('Оформление','Приём')
   AND current_version_id IS NULL;

UPDATE skus
   SET current_version_id = (SELECT id FROM sku_versions WHERE master_id = skus.id AND version_num = 1)
 WHERE name IN ('Оформление','Приём') AND current_version_id IS NULL;

-- Атрибуты: применимы к типу «Доставка» (id=12). Это позволяет SkuPicker по типу
-- позиции 12 находить их, но т.к. они is_auto_add — реально добавляются автоматически
-- и в SkuPicker оператор их выбирать не будет.
INSERT INTO sku_attributes (sku_id, attr_key, attr_value)
SELECT id, 'item_type', '12'
  FROM skus
 WHERE name IN ('Оформление','Приём')
ON CONFLICT DO NOTHING;
