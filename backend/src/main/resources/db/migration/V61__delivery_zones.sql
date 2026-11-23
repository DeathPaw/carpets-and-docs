-- V61: зональный расчёт доставки (ПР-006).
--
-- Тарифы и полигоны зон — те же, что в калькуляторе сайта «Коврокота»
-- (resources/delivery/delivery-zones.geojson). Цена приёма и доставки
-- считается по зоне адреса заказа и сумме стирки.
--
-- Заказ считается по прайсу на дату оформления (V42), поэтому зоны действуют
-- только для заказов, оформленных начиная с этой даты: уже идущие заказы при
-- пересчёте не получат новую цену доставки неожиданно для клиента.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS delivery_zones_from DATE;
UPDATE company_settings SET delivery_zones_from = CURRENT_DATE WHERE delivery_zones_from IS NULL;
