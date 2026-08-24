-- V31: слот, добавленный только на конкретную дату.
--
-- Было: delivery_time_slots привязан к дню недели — слот, добавленный в среду,
-- появлялся во ВСЕХ средах, включая другие недели. Оператор просил уметь завести
-- интервал разово: «в эту среду ещё и утро», не меняя расписание навсегда.
--
-- Стало: specific_date. NULL — обычный шаблон дня недели (как было). Заполнено —
-- слот действует ТОЛЬКО в эту календарную дату.
--
-- day_of_week оставляем NOT NULL и для разовых слотов: он должен соответствовать
-- дню недели указанной даты. Так все существующие выборки «слоты дня недели N»
-- продолжают работать, а разовые отсекаются условием по specific_date. Целостность
-- держим CHECK'ом ниже, чтобы нельзя было записать среду с датой воскресенья.

ALTER TABLE delivery_time_slots ADD COLUMN IF NOT EXISTS specific_date DATE;

COMMENT ON COLUMN delivery_time_slots.specific_date IS
    'NULL — шаблон дня недели (повторяется еженедельно). Дата — разовый слот только на неё.';

-- day_of_week обязан совпадать с днём недели specific_date.
-- EXTRACT(DOW) в Postgres: 0=воскресенье..6=суббота — совпадает с нашей нумерацией.
ALTER TABLE delivery_time_slots DROP CONSTRAINT IF EXISTS delivery_slots_specific_date_dow_chk;
ALTER TABLE delivery_time_slots ADD CONSTRAINT delivery_slots_specific_date_dow_chk
    CHECK (specific_date IS NULL
           OR day_of_week = EXTRACT(DOW FROM specific_date)::int);

-- Выборка слотов конкретной даты идёт по (day_of_week, specific_date):
-- берём шаблоны этого дня недели плюс разовые именно на эту дату.
CREATE INDEX IF NOT EXISTS idx_delivery_slots_specific_date
    ON delivery_time_slots (specific_date)
 WHERE specific_date IS NOT NULL;
