-- V22: разделить дефолтные позиции на 3 отдельных item_type.
--
-- Проблема V20/V21: у auto-add SKU «Оформление», «Приём», «Доставка» один и тот же
-- item_type=12 («Доставка»). attachAutoAddSkus создавал 3 позиции, но все
-- одного типа — и модалка выбора услуг для любой из них показывала весь список
-- доставочных SKU (Доставка-забор/отвоз/привоз/отвоз клиента/Приём/Доставка/Оформление).
--
-- Нужно:
--   тип «Оформление» → 1 SKU (Оформление, авто-назначение оператора-создателя)
--   тип «Приём»      → 2 SKU (Приём + Самовывоз (привоз клиентом))
--   тип «Доставка»   → 2 SKU (Доставка + Самовывоз (отвоз клиентом))
-- Legacy «Доставка (забор)»/«Доставка (отвоз)» снимаем с типа «Доставка» —
-- они остаются в БД для исторических заказов (order_items.sku_id ссылается), но в
-- новых позициях через «Только подходящие» больше не предлагаются.

-- 1. Завести два новых типа.
INSERT INTO item_types (name) VALUES ('Оформление') ON CONFLICT DO NOTHING;
INSERT INTO item_types (name) VALUES ('Приём')      ON CONFLICT DO NOTHING;

-- 2. Перепривязать атрибут item_type у auto-add SKU и их пары для свапа.
--    sku_attributes — EAV, ключ (sku_id, attr_key) с одним значением на тип.
--    Используем CTE с lookup'ом ID нового типа, чтобы не хардкодить.

-- 2a. Оформление (sku 16) → тип «Оформление»
UPDATE sku_attributes
   SET attr_value = (SELECT id::text FROM item_types WHERE name = 'Оформление')
 WHERE sku_id = (SELECT id FROM skus WHERE name = 'Оформление')
   AND attr_key = 'item_type';

-- 2b. Приём (sku 17) → тип «Приём»
UPDATE sku_attributes
   SET attr_value = (SELECT id::text FROM item_types WHERE name = 'Приём')
 WHERE sku_id = (SELECT id FROM skus WHERE name = 'Приём')
   AND attr_key = 'item_type';

-- 2c. Самовывоз (привоз клиентом) → тип «Приём» (парный для свапа)
UPDATE sku_attributes
   SET attr_value = (SELECT id::text FROM item_types WHERE name = 'Приём')
 WHERE sku_id = (SELECT id FROM skus WHERE name = 'Самовывоз (привоз клиентом)')
   AND attr_key = 'item_type';

-- 2d. Доставка (sku 18) и Самовывоз (отвоз клиентом) остаются на типе 12
--     (item_types.name = 'Доставка'). Ничего не делаем.

-- 2e. Legacy: снимаем item_type с «Доставка (забор)» и «Доставка (отвоз)».
--     В новых заказах они теперь не появятся в «Только подходящие» (без атрибута
--     item_type SkuService.matches возвращает true, но без галочки эти SKU и
--     так в каталоге; с галочкой — отфильтрованы по другому полю).
--     ⚠ Если позже захочется явно скрыть их от ручного добавления — is_active=FALSE.
DELETE FROM sku_attributes
 WHERE sku_id IN (SELECT id FROM skus WHERE name IN ('Доставка (забор)', 'Доставка (отвоз)'))
   AND attr_key = 'item_type';

-- 3. sku_versions.attributes_snapshot для v1 трёх auto-add SKU — синхронно.
--    Иначе при следующем редактировании каталога мастер и версия разъедутся
--    (sku_attributes возьмётся из v1).
UPDATE sku_versions
   SET attributes_snapshot = jsonb_build_object(
         'item_type',
         jsonb_build_array((SELECT id::text FROM item_types WHERE name = 'Оформление')))
 WHERE master_id = (SELECT id FROM skus WHERE name = 'Оформление') AND version_num = 1;

UPDATE sku_versions
   SET attributes_snapshot = jsonb_build_object(
         'item_type',
         jsonb_build_array((SELECT id::text FROM item_types WHERE name = 'Приём')))
 WHERE master_id = (SELECT id FROM skus WHERE name = 'Приём') AND version_num = 1;

-- Версия snapshot для «Самовывоз (привоз клиентом)» — отдельно. Если её sku_versions
-- v1 нет (старая seed-запись без версии) — UPDATE 0 rows, не падаем.
UPDATE sku_versions
   SET attributes_snapshot = jsonb_set(
         COALESCE(attributes_snapshot, '{}'::jsonb),
         '{item_type}',
         jsonb_build_array((SELECT id::text FROM item_types WHERE name = 'Приём')))
 WHERE master_id = (SELECT id FROM skus WHERE name = 'Самовывоз (привоз клиентом)') AND version_num = 1;

UPDATE sku_versions
   SET attributes_snapshot = attributes_snapshot - 'item_type'
 WHERE master_id IN (SELECT id FROM skus WHERE name IN ('Доставка (забор)', 'Доставка (отвоз)'))
   AND version_num = 1;
