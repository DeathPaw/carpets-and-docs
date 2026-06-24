-- V25: вернуть item_type=12 (Доставка) у legacy SKU «Доставка (забор)/(отвоз)».
--
-- Баг V22: я снял атрибут item_type у этих SKU, думая что «без атрибута они
-- не появятся в «Только подходящие» для других типов». Логика противоположная:
-- SkuService.matches() пропускает SKU без атрибута item_type как универсальную
-- (matches любому типу). Из-за этого legacy «Доставка (забор)/(отвоз)» начали
-- появляться в селекторе услуг для Тюля, Одеяла и любых других позиций.
--
-- Решение: вернуть им item_type='12' (Доставка). Они снова видны только когда
-- оператор добавляет услугу к позиции типа «Доставка» — это нормально, пусть
-- остаются доступны для исторических заказов и manual-добавления.

INSERT INTO sku_attributes (sku_id, attr_key, attr_value)
SELECT id, 'item_type', '12'
  FROM skus
 WHERE name IN ('Доставка (забор)', 'Доставка (отвоз)')
ON CONFLICT DO NOTHING;

-- Синхронно в sku_versions.attributes_snapshot v1 (если есть запись).
UPDATE sku_versions
   SET attributes_snapshot = jsonb_set(
         COALESCE(attributes_snapshot, '{}'::jsonb),
         '{item_type}',
         '["12"]'::jsonb)
 WHERE master_id IN (SELECT id FROM skus WHERE name IN ('Доставка (забор)', 'Доставка (отвоз)'))
   AND version_num = 1;
