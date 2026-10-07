-- V53: выездные чистки ковров (ТЗ v2, блок 5).
--
-- Это работа у клиента: ковёр никуда не везут, приезжает бригада. Обычный
-- заказ с позициями, приёмом и доставкой сюда не ложится — нужен свой объект
-- с адресом работ, объёмом в м², ценой и исполнителями.
--
-- Дальше выездная чистка работает по общим правилам: её метры попадают в базу
-- распределения затрат, исполнители получают сдельное начисление и смены,
-- а завершение засчитывается в контрактный факт (блок 6).

CREATE TABLE IF NOT EXISTS onsite_cleanings (
    id           BIGSERIAL PRIMARY KEY,
    client_id    BIGINT REFERENCES clients(id),
    client_name  VARCHAR(255) NOT NULL,
    address      TEXT,
    district     VARCHAR(255),
    -- Дата выезда; completed_at — когда работы фактически закончены.
    cleaning_date DATE NOT NULL,
    area         NUMERIC(10,2),
    -- Цена клиенту. С тарифом сотрудников не связана: это разные деньги.
    price        NUMERIC(12,2) NOT NULL DEFAULT 0,
    status       VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    comment      TEXT,
    completed_at TIMESTAMP,
    created_by   VARCHAR(150),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT onsite_cleanings_status_check CHECK (status IN ('PLANNED', 'DONE', 'CANCELLED')),
    CONSTRAINT onsite_cleanings_area_check CHECK (area IS NULL OR area >= 0)
);

CREATE INDEX IF NOT EXISTS idx_onsite_cleanings_date ON onsite_cleanings(cleaning_date);
CREATE INDEX IF NOT EXISTS idx_onsite_cleanings_completed ON onsite_cleanings(completed_at)
    WHERE completed_at IS NOT NULL;

-- Исполнители выезда и их доли — те же правила, что у ковров в цеху.
CREATE TABLE IF NOT EXISTS onsite_cleaning_workers (
    id          BIGSERIAL PRIMARY KEY,
    cleaning_id BIGINT NOT NULL REFERENCES onsite_cleanings(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    percent     NUMERIC(8,5) NOT NULL DEFAULT 0,
    UNIQUE (cleaning_id, employee_id)
);
