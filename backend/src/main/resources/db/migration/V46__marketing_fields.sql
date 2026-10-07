-- V46: маркетинговые поля CRM (правка №3 от 13.09).
--
-- Нужно понимать, откуда приходят клиенты, зачем они обращаются и почему
-- заказы отменяются. Раньше этих данных не было вовсе: причина отмены была
-- свободным текстом и в аналитику не годилась.
--
-- Коды значений (источник, повод) держим в коде фронта — списки заданы
-- договорённостью и меняются релизом. Причины отмены, наоборот, вынесены в
-- справочник: их формулировки правит владелец без разработчика.

-- ---------- клиент ----------
-- Статус относительно перезапуска заполняется один раз и не заменяет
-- автоматическую логику «новый/повторный» — CRM не знает истории до перезапуска.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS restart_status VARCHAR(30);
-- Откуда клиент пришёл; source_note — расшифровка для «Другой источник».
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source      VARCHAR(40);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_note VARCHAR(255);

-- ---------- заказ ----------
-- Повод относится к конкретному заказу, а не к клиенту: сегодня залили ковёр,
-- через полгода — плановая чистка.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_reason      VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_reason_note VARCHAR(255);
-- Код причины отмены из справочника. Текстовое cancellation_reason остаётся:
-- там лежит человеческая формулировка (и уточнение для «Другая причина»).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason_code VARCHAR(40);

-- ---------- справочник причин отмены ----------
CREATE TABLE IF NOT EXISTS cancellation_reasons (
    id            BIGSERIAL PRIMARY KEY,
    code          VARCHAR(40) UNIQUE NOT NULL,
    name          VARCHAR(200) NOT NULL,
    -- TRUE — оператор обязан дописать уточнение («Другая причина»).
    requires_note BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO cancellation_reasons (code, name, requires_note, sort_order) VALUES
    ('PRICE',          'Не устроила итоговая цена',        FALSE, 10),
    ('DELIVERY_PRICE', 'Не устроила стоимость доставки',   FALSE, 20),
    ('LEAD_TIME',      'Не устроил срок выполнения',       FALSE, 30),
    ('OUT_OF_AREA',    'Адрес вне зоны обслуживания',      FALSE, 40),
    ('POSTPONED',      'Клиент отложил заказ',             FALSE, 50),
    ('COMPETITOR',     'Выбрал другую компанию',           FALSE, 60),
    ('NO_CONTACT',     'Не удалось связаться с клиентом',  FALSE, 70),
    ('MISTAKE',        'Ошибочный или тестовый заказ',     FALSE, 80),
    ('DUPLICATE',      'Дублирующий заказ',                FALSE, 90),
    ('NO_REASON',      'Клиент отказался без объяснения',  FALSE, 100),
    ('OTHER',          'Другая причина',                   TRUE,  110)
ON CONFLICT (code) DO NOTHING;
