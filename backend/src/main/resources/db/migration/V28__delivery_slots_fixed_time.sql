-- V28: слоты с фиксированным временем (правка №4).
--
-- Было: delivery_time_slots всегда интервал, CHECK (end_time > start_time).
-- Просьба оператора: уметь ставить доставку «строго к 15:00» — клиенты, которым
-- нужно точное время, а не окно. Для такого слота end_time не имеет смысла.
--
-- Стало: end_time может быть NULL — это и есть «точное время». Интервальные
-- слоты работают как раньше.

ALTER TABLE delivery_time_slots ALTER COLUMN end_time DROP NOT NULL;

-- Старый CHECK не пропускал NULL-end_time. В Postgres CHECK с NULL даёт UNKNOWN,
-- что трактуется как «прошло», но имя ограничения зависит от того, как его создали,
-- поэтому пересоздаём явно и с понятным именем.
DO $$
DECLARE c_name TEXT;
BEGIN
    SELECT conname INTO c_name
      FROM pg_constraint
     WHERE conrelid = 'delivery_time_slots'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%end_time%start_time%';
    IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE delivery_time_slots DROP CONSTRAINT %I', c_name);
    END IF;
END $$;

ALTER TABLE delivery_time_slots
    ADD CONSTRAINT delivery_time_slots_range_chk
    CHECK (end_time IS NULL OR end_time > start_time);
