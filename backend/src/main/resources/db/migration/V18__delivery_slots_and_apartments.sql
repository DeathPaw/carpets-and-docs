-- V18: справочник слотов доставки + поле «Квартира» у клиента и заказа.
--
-- #6: оператор просил выкинуть hardcoded слоты "10:00-13:00"/"14:00-18:00" и
--     завести справочник: будни 17:00-20:30, сб 10:00-20:30, вс — без слотов.
--     Хранение по дню недели — фронт по pickup_date/delivery_date выбирает строки
--     с соответствующим day_of_week.
--
-- #7: оператор просил отделить номер квартиры от адреса (в адресе он мешает
--     геокодированию). Храним отдельно: на клиенте — одно поле, на заказе —
--     два (забор и доставка, как с остальными адресами).

-- ---------- Слоты доставки ----------
CREATE TABLE IF NOT EXISTS delivery_time_slots (
    id          BIGSERIAL PRIMARY KEY,
    -- 0=Вс, 1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт, 6=Сб (стандарт getDay()/EXTRACT(DOW))
    day_of_week INT       NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME      NOT NULL,
    end_time    TIME      NOT NULL,
    -- Метка для UI («Вечер», «Утро» и т.п.) — необязательно.
    label       VARCHAR(50),
    is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
    sort_order  INT       NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_delivery_slots_dow ON delivery_time_slots(day_of_week) WHERE is_active = TRUE;

-- Дефолтные слоты: будни (Пн-Пт) 17:00-20:30, Сб 10:00-20:30. Вс — без слотов (выходной).
INSERT INTO delivery_time_slots (day_of_week, start_time, end_time, label, sort_order) VALUES
  (1, '17:00', '20:30', 'Вечер', 1),
  (2, '17:00', '20:30', 'Вечер', 1),
  (3, '17:00', '20:30', 'Вечер', 1),
  (4, '17:00', '20:30', 'Вечер', 1),
  (5, '17:00', '20:30', 'Вечер', 1),
  (6, '10:00', '20:30', 'Весь день', 1);

-- ---------- Поля квартиры ----------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS apartment VARCHAR(50);
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS pickup_apartment   VARCHAR(50);
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS delivery_apartment VARCHAR(50);
