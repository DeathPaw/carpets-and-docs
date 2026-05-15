-- ============================================================================
-- V11: Пользователи + lifecycle-поля на SKU
--
-- 1. Таблица users — авторизация операторов/админов/супервизоров.
-- 2. Lifecycle-поля на skus — для auto-add с автоматикой статусов.
-- 3. Attribute definitions: order_amount_min / order_amount_max.
-- 4. Таблица notifications — персональные уведомления.
-- ============================================================================

-- ---------- 1. Пользователи ----------

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(100)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255)  NOT NULL,
    display_name    VARCHAR(255)  NOT NULL,
    -- SUPERVISOR: всё видит. ADMIN: справочники+сотрудники+обращения.
    -- OPERATOR: рабочие разделы. READONLY: моноблок.
    role            VARCHAR(20)   NOT NULL DEFAULT 'OPERATOR',
    -- Привязка к сотруднику (для авто-назначения на «Оформление» и аудита).
    employee_id     BIGINT        REFERENCES employees(id),
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Дефолтный суперпользователь (пароль 'foxy' захэширован BCrypt).
-- BCrypt hash для 'foxy': $2a$10$ + ... — генерируется приложением при первом старте,
-- поэтому здесь ставим заглушку, которую SecurityConfig заменит.
-- Реально: при старте приложения если users пуст → seed из application.yml.

-- ---------- 2. Lifecycle-поля на SKU ----------

ALTER TABLE skus
    ADD COLUMN IF NOT EXISTS auto_complete_on_status VARCHAR(30),
    ADD COLUMN IF NOT EXISTS triggers_order_status   VARCHAR(30),
    ADD COLUMN IF NOT EXISTS exclude_from_status_calc BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- 3. Новые attribute definitions ----------

INSERT INTO attribute_definitions (key, label, value_type, unit, sort_order)
VALUES
    ('order_amount_min', 'Сумма заказа от', 'NUMBER', '₽', 200),
    ('order_amount_max', 'Сумма заказа до', 'NUMBER', '₽', 210)
ON CONFLICT (key) DO NOTHING;

-- ---------- 4. Таблица уведомлений ----------

CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT        NOT NULL,  -- может ссылаться на users.id или employees.id
    type        VARCHAR(50)   NOT NULL,  -- SERVICE_ASSIGNED, ORDER_STATUS_CHANGED, SKU_MISMATCH, ...
    message     TEXT          NOT NULL,
    entity_type VARCHAR(50),             -- ORDER, ORDER_ITEM, SERVICE, ...
    entity_id   BIGINT,
    is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ---------- 5. Обновляем триггер compute_order_status ----------
-- Теперь учитываем exclude_from_status_calc: позиции с auto-add SKU
-- (Доставка/Приём/Оформление) не участвуют в вычислении.

CREATE OR REPLACE FUNCTION compute_order_status(p_order_id BIGINT)
RETURNS VARCHAR AS $$
DECLARE
    v_current_status VARCHAR;
    v_total INTEGER;
    v_done INTEGER;
    v_cancelled INTEGER;
    v_in_progress INTEGER;
    v_partially_done INTEGER;
    v_has_meaningful BOOLEAN;
BEGIN
    SELECT status INTO v_current_status FROM orders WHERE id = p_order_id;
    IF v_current_status IS NULL THEN RETURN NULL; END IF;
    IF v_current_status IN ('LEAD', 'DELIVERED', 'COMPLETED', 'PARTIALLY_DELIVERED') THEN
        RETURN v_current_status;
    END IF;

    -- Сначала пробуем считать только «значимые» позиции (exclude_from_status_calc = FALSE).
    -- Для этого нужно проверить, есть ли у позиции услуга с SKU, у которой exclude=true.
    -- Упрощение: позиция «значима», если НИ ОДНА из её услуг не ссылается на SKU с exclude=true.
    -- Если все позиции «исключённые» — считаем по всем.

    SELECT COUNT(*) > 0 INTO v_has_meaningful
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND NOT EXISTS (
           SELECT 1 FROM order_item_services ois
           JOIN skus s ON s.id = ois.sku_id AND s.exclude_from_status_calc = TRUE
           WHERE ois.order_item_id = oi.id
       );

    IF v_has_meaningful THEN
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE oi.status = 'DONE'),
            COUNT(*) FILTER (WHERE oi.status = 'CANCELLED'),
            COUNT(*) FILTER (WHERE oi.status = 'IN_PROGRESS'),
            COUNT(*) FILTER (WHERE oi.status = 'PARTIALLY_DONE')
        INTO v_total, v_done, v_cancelled, v_in_progress, v_partially_done
          FROM order_items oi
         WHERE oi.order_id = p_order_id
           AND NOT EXISTS (
               SELECT 1 FROM order_item_services ois
               JOIN skus s ON s.id = ois.sku_id AND s.exclude_from_status_calc = TRUE
               WHERE ois.order_item_id = oi.id
           );
    ELSE
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE status = 'DONE'),
            COUNT(*) FILTER (WHERE status = 'CANCELLED'),
            COUNT(*) FILTER (WHERE status = 'IN_PROGRESS'),
            COUNT(*) FILTER (WHERE status = 'PARTIALLY_DONE')
        INTO v_total, v_done, v_cancelled, v_in_progress, v_partially_done
          FROM order_items
         WHERE order_id = p_order_id;
    END IF;

    IF v_total = 0 THEN RETURN v_current_status; END IF;

    IF v_done + v_cancelled = v_total THEN
        IF v_done > 0 THEN RETURN 'DONE'; ELSE RETURN 'CANCELLED'; END IF;
    END IF;

    IF v_done > 0 OR v_partially_done > 0 THEN
        RETURN 'PARTIALLY_DONE';
    END IF;

    IF v_in_progress > 0 THEN
        RETURN 'IN_PROGRESS';
    END IF;

    RETURN v_current_status;
END;
$$ LANGUAGE plpgsql;

-- ---------- 6. Ежемесячные расходы ----------

CREATE TABLE IF NOT EXISTS expense_categories (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255)  NOT NULL,
    is_fixed        BOOLEAN       NOT NULL DEFAULT FALSE,
    default_amount  NUMERIC(12,2),
    sort_order      INT           NOT NULL DEFAULT 100,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_expenses (
    id            BIGSERIAL PRIMARY KEY,
    category_id   BIGINT        NOT NULL REFERENCES expense_categories(id),
    year_month    VARCHAR(7)    NOT NULL,   -- '2026-05'
    amount        NUMERIC(12,2) NOT NULL,
    comment       TEXT,
    created_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
    UNIQUE (category_id, year_month)
);
