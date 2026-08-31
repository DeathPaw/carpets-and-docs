-- V36: у заявки на закупку остаётся ровно четыре статуса — по одному на столбец доски.
--
-- В V33 путь был NEW → APPROVED → ORDERED → RECEIVED. На доске это дало столбец
-- «В работе» с двумя внутренними статусами, которые оператор не различал:
-- «Согласована» и «Заказана» означали одно и то же — заявку взяли в работу.
-- Лишний этап приходилось переключать отдельным полем в карточке.
--
-- Теперь: NEW (Создана) → ORDERED (В работе) → RECEIVED (Готово), CANCELLED на любом шаге.
-- Статус ORDERED сохраняем как значение «в работе» — так уцелеют заявки, которые
-- уже дошли до него на другом контуре; APPROVED переносим в него же.

UPDATE supply_requests SET status = 'ORDERED' WHERE status = 'APPROVED';

ALTER TABLE supply_requests DROP CONSTRAINT IF EXISTS supply_requests_status_chk;
ALTER TABLE supply_requests ADD CONSTRAINT supply_requests_status_chk
    CHECK (status IN ('NEW','ORDERED','RECEIVED','CANCELLED'));

-- Частичный индекс открытых заявок ссылался на APPROVED — пересобираем.
DROP INDEX IF EXISTS idx_supply_requests_open;
CREATE INDEX idx_supply_requests_open
    ON supply_requests (needed_by) WHERE status IN ('NEW','ORDERED');
