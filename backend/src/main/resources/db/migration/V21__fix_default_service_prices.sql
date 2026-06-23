-- V21: возвращаю исходные цены и free_threshold для Прием/Доставка.
--
-- В V20 я случайно поставил «Доставка» = 500₽ (должно было быть 300, как у
-- бывших Доставка-забор/отвоз), а у «Приём» оставил price=0/threshold=NULL —
-- из-за этого free_threshold у него не срабатывал.
--
-- Восстанавливаем боевые значения: оба сервиса по 300₽, оба обнуляются когда
-- базовая сумма заказа ≥ 4000₽.

UPDATE skus SET price = 300.00, free_threshold = 4000.00
 WHERE name = 'Доставка';

UPDATE skus SET price = 300.00, free_threshold = 4000.00
 WHERE name = 'Приём';

-- Те же поля в sku_versions.v1 — иначе при следующем редактировании каталога
-- мастер и версия разъедутся.
UPDATE sku_versions SET price = 300.00, free_threshold = 4000.00
 WHERE name IN ('Доставка', 'Приём') AND version_num = 1;
