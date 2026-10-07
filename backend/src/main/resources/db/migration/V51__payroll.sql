-- V51: ФОТ — схемы оплаты, выработка, смены и ведомость (ТЗ v2, блоки 3 и 4).
--
-- До сих пор зарплата в системе не считалась вовсе: были услуги с ценой для
-- клиента, но не было ни ставок сотрудников, ни табеля, ни ведомости.
--
-- Все таблицы новые, существующие данные не меняются. Автоматика опирается на
-- уже имеющиеся факты: завершённый ковёр (order_items.completed_at),
-- исполнители услуг (service_assignees) и назначенный водитель заказа.

-- ---------------------------------------------------------------------------
-- Схема оплаты сотрудника. В один момент действует одна; история сохраняется,
-- поэтому закрытые периоды пересчитываются по тем ставкам, что действовали.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_pay_schemes (
    id                BIGSERIAL PRIMARY KEY,
    employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    -- PIECEWORK — сделка за метры, SALARY — оклад,
    -- DRIVER_POINTS — оплата за точки, DRIVER_SHIFT — смена с доплатой сверх порога.
    scheme            VARCHAR(20) NOT NULL,
    valid_from        DATE NOT NULL,
    valid_to          DATE,
    -- Сделка: тариф за м².
    rate_per_sqm      NUMERIC(12,2),
    -- Оклад за месяц.
    salary            NUMERIC(12,2),
    -- Водитель за точки: ставка за одну точку.
    point_rate        NUMERIC(12,2),
    -- Водитель за смену: длительность, фикс, порог точек и ставка сверх порога.
    shift_hours       NUMERIC(5,2),
    shift_fix         NUMERIC(12,2),
    points_included   INTEGER,
    extra_point_rate  NUMERIC(12,2),
    comment           TEXT,
    created_by        VARCHAR(150),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT employee_pay_schemes_scheme_check
        CHECK (scheme IN ('PIECEWORK', 'SALARY', 'DRIVER_POINTS', 'DRIVER_SHIFT')),
    CONSTRAINT employee_pay_schemes_period_check
        CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_pay_schemes_employee ON employee_pay_schemes(employee_id, valid_from);

-- ---------------------------------------------------------------------------
-- Правило распределения долей за ковёр на месяц: поровну или заданные проценты.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_share_rules (
    id          BIGSERIAL PRIMARY KEY,
    year_month  CHAR(7) NOT NULL UNIQUE,
    -- EQUAL — поровну между фактическими участниками, PERCENT — проценты ниже.
    mode        VARCHAR(20) NOT NULL DEFAULT 'EQUAL',
    created_by  VARCHAR(150),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT payroll_share_rules_mode_check CHECK (mode IN ('EQUAL', 'PERCENT'))
);

CREATE TABLE IF NOT EXISTS payroll_share_rule_members (
    id           BIGSERIAL PRIMARY KEY,
    rule_id      BIGINT NOT NULL REFERENCES payroll_share_rules(id) ON DELETE CASCADE,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    percent      NUMERIC(5,2) NOT NULL,
    UNIQUE (rule_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Доли, зафиксированные на конкретном ковре. Сохраняются вместе с версией
-- правила: изменение правила не переписывает задним числом уже посчитанное.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_item_shares (
    id             BIGSERIAL PRIMARY KEY,
    order_item_id  BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    employee_id    BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    percent        NUMERIC(5,2) NOT NULL,
    rule_mode      VARCHAR(20),
    -- MANUAL — доли поправил оператор; тогда автоматика их не перетирает.
    source         VARCHAR(20) NOT NULL DEFAULT 'AUTO',
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (order_item_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- Табель смен. Одна смена сотрудника в день — базовая автоматика; лишние и
-- недостающие оператор правит руками, и ручные записи не затираются.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_shifts (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_date   DATE NOT NULL,
    source       VARCHAR(20) NOT NULL DEFAULT 'AUTO',
    -- Основание: обработка ковра, точки водителя, активность оператора, ручная запись.
    reason       VARCHAR(255),
    created_by   VARCHAR(150),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, shift_date),
    CONSTRAINT work_shifts_source_check CHECK (source IN ('AUTO', 'MANUAL'))
);

-- ---------------------------------------------------------------------------
-- Точки водителя: один забор или один отвоз — одна точка.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_points (
    id           BIGSERIAL PRIMARY KEY,
    employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    point_date   DATE NOT NULL,
    order_id     BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    leg          VARCHAR(10) NOT NULL,
    source       VARCHAR(20) NOT NULL DEFAULT 'AUTO',
    created_by   VARCHAR(150),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Перенос и смена водителя обновляют запись, а не плодят дубли.
    UNIQUE (order_id, leg),
    CONSTRAINT driver_points_leg_check CHECK (leg IN ('PICKUP', 'DELIVERY'))
);

CREATE INDEX IF NOT EXISTS idx_driver_points_employee_date ON driver_points(employee_id, point_date);

-- ---------------------------------------------------------------------------
-- Начисления ведомости. Одна строка — одна исходная работа (ковёр, смена,
-- точки дня) или ручная добавка. Повторный расчёт обновляет строку по
-- источнику и не создаёт дубль; ручная правка помечается и переживает пересчёт.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_entries (
    id                BIGSERIAL PRIMARY KEY,
    employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year_month        CHAR(7) NOT NULL,
    entry_date        DATE NOT NULL,
    -- PIECEWORK | SALARY | SHIFT | POINTS | MANUAL
    kind              VARCHAR(20) NOT NULL,
    -- ITEM | SHIFT | POINTS_DAY | MONTH | MANUAL — что послужило источником.
    source_type       VARCHAR(20) NOT NULL,
    source_id         BIGINT,
    amount            NUMERIC(12,2) NOT NULL,
    -- Что посчитала автоматика до ручной правки — показываем обе величины.
    auto_amount       NUMERIC(12,2),
    details           TEXT,
    corrected_by      VARCHAR(150),
    corrected_at      TIMESTAMP,
    correction_reason TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Уникальность источника: пересчёт обновляет ту же строку. NULL source_id
-- (ручные добавки) под ограничение не попадают — их может быть несколько.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_entries_source
    ON payroll_entries(employee_id, year_month, source_type, source_id)
    WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_entries_month ON payroll_entries(year_month);

-- ---------------------------------------------------------------------------
-- Месяц ведомости: норма рабочих дней и признак закрытия. Закрытый месяц
-- автоматикой не трогается — изменение ставки не меняет закрытую ведомость.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_months (
    year_month  CHAR(7) PRIMARY KEY,
    norm_days   INTEGER,
    closed      BOOLEAN NOT NULL DEFAULT FALSE,
    closed_by   VARCHAR(150),
    closed_at   TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
