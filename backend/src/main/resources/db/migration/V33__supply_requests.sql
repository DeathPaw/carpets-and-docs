-- V33: заявки на закупку расходных материалов (правка №5 от 31.08).
--
-- Производство передавало потребности устно и в мессенджерах — заявки терялись,
-- закупку нельзя было спланировать. Теперь это отдельная сущность со статусами.
--
-- Связь с деньгами (вариант «Б»): при получении материала оператор вносит
-- фактическое количество и сумму. Сумма попадает в существующий раздел «Расходы»
-- за месяц ДАТЫ ЗАКУПКИ (received_on), а не за месяц, к которому просили —
-- деньги должны лечь в тот период, когда их реально потратили.
--
-- Остатки на складе намеренно НЕ ведём: без дисциплины инвентаризации они
-- разъедутся за месяц и будут врать. Храним оборот денег и что нужно докупить.
-- Поля unit и actual_quantity оставлены с прицелом на будущий складской учёт.

CREATE TABLE IF NOT EXISTS supply_requests (
    id              BIGSERIAL PRIMARY KEY,
    /** Что нужно: «Шампунь для шерсти», «Мешки 120л». */
    title           VARCHAR(255)  NOT NULL,
    /** Сколько просят. NULL — «нужно, сколько получится». */
    quantity        NUMERIC(12,2),
    /** Единица измерения: шт, л, кг, упак. */
    unit            VARCHAR(20),
    /** К какой дате нужно. NULL — без срока. */
    needed_by       DATE,
    comment         TEXT,

    /** NEW → APPROVED → ORDERED → RECEIVED, либо CANCELLED на любом шаге. */
    status          VARCHAR(20)   NOT NULL DEFAULT 'NEW',

    /** Кто создал заявку. Имя дублируем — сотрудника могут удалить. */
    created_by_employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    created_by_name        VARCHAR(255),

    /** Факт закупки. received_on — день списания денег. */
    received_on     DATE,
    actual_quantity NUMERIC(12,2),
    actual_amount   NUMERIC(12,2),

    /** Причина отмены — обязательна при переводе в CANCELLED (проверяет сервис). */
    cancel_reason   TEXT,

    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW(),

    CONSTRAINT supply_requests_status_chk
        CHECK (status IN ('NEW','APPROVED','ORDERED','RECEIVED','CANCELLED')),
    -- Полученная заявка обязана иметь дату и сумму: без них расход не попадёт в месяц.
    CONSTRAINT supply_requests_received_chk
        CHECK (status <> 'RECEIVED' OR (received_on IS NOT NULL AND actual_amount IS NOT NULL))
);

-- Открытые заявки на ближайшую неделю — блок на Главной.
CREATE INDEX IF NOT EXISTS idx_supply_requests_open
    ON supply_requests (needed_by) WHERE status IN ('NEW','APPROVED','ORDERED');
-- Пересчёт месячного расхода по дате закупки.
CREATE INDEX IF NOT EXISTS idx_supply_requests_received
    ON supply_requests (received_on) WHERE status = 'RECEIVED';

-- Категория расходов, в которую складываются закупки материалов.
-- Имя фиксировано: сервис ищет её по нему при пересчёте.
INSERT INTO expense_categories (name, is_fixed, default_amount, sort_order)
SELECT 'Расходные материалы', FALSE, 0, 100
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Расходные материалы');
