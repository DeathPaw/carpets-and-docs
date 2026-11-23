-- V65: упрощение карточки контракта (ПР-011).
--
-- Номер, дата заключения и вид контракта больше не обязательны: дата часто
-- известна только после подписи заказчика. Обязателен срок действия — по нему
-- контролируют окончание обязательств. Цена за м² необязательна: в части
-- контрактов цена задана за общий объём. Появилась общая стоимость контракта
-- отдельной суммой и плановые объёмы по ДЭЗ и стирке (по коврам — planned_sqm);
-- любой объём можно не заполнять. Единицы ДЭЗ и стирки — свободной строкой,
-- пока заказчик не утвердил их.
ALTER TABLE contracts ALTER COLUMN number DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN signed_on DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN price_per_sqm DROP NOT NULL;
ALTER TABLE contracts ALTER COLUMN kind DROP NOT NULL;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_period_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_period_check
    CHECK (expires_on IS NULL OR signed_on IS NULL OR expires_on >= signed_on);

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS total_amount      NUMERIC(14,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS planned_dez       NUMERIC(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS planned_dez_unit  VARCHAR(30);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS planned_wash      NUMERIC(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS planned_wash_unit VARCHAR(30);
