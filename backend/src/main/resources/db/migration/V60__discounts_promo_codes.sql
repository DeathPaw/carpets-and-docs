-- V60: настройки скидок и промокоды в существующем конструкторе (ПР-004, ПР-018).
--
-- Не отдельная система промокодов, а расширение price_modifiers:
--   • kind — PERCENT (процент, как раньше), FIXED (минус сумма с заказа),
--     FREE_DELIVERY (обнуляет позиции приёма/доставки);
--   • promo_code — кодовое слово, по которому скидку применяет оператор;
--   • auto_assign_to_client — при первом применении к заказу скидка сама
--     закрепляется за клиентом (пенсионер, многодетные, постоянный клиент);
--     разовые (первый заказ, за отзыв, промокоды) — выключено;
--   • valid_from/valid_to, usage_limit, is_active — условия применения.

ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'PERCENT';
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS auto_assign_to_client BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS valid_to DATE;
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS usage_limit INTEGER;
ALTER TABLE price_modifiers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
    ALTER TABLE price_modifiers ADD CONSTRAINT price_modifiers_kind_check
        CHECK (kind IN ('PERCENT', 'FIXED', 'FREE_DELIVERY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Промокод уникален без учёта регистра: «LETO» и «leto» — один код.
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_modifiers_promo_code
    ON price_modifiers (UPPER(promo_code)) WHERE promo_code IS NOT NULL;

-- Постоянные льготы, которые и так ставили на карточку клиента, — закрепляются сами.
UPDATE price_modifiers SET auto_assign_to_client = TRUE
 WHERE name ILIKE '%пенсион%' OR name ILIKE '%многодет%' OR name ILIKE '%постоян%';

-- Снимок в заказе: какая скидка и с каким кодом действовала, даже если её
-- потом выключат или поменяют. discount_amount — фактический эффект в рублях
-- (отрицательный — скидка, положительный — надбавка), для отчётов.
ALTER TABLE order_modifiers ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'PERCENT';
ALTER TABLE order_modifiers ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2);
ALTER TABLE order_modifiers ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);
ALTER TABLE order_modifiers ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2);
CREATE INDEX IF NOT EXISTS idx_order_modifiers_promo ON order_modifiers (UPPER(promo_code)) WHERE promo_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_modifiers_modifier ON order_modifiers (modifier_id);
