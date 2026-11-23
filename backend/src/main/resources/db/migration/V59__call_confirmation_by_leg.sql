-- V59: прозвон по этапам и история звонков (ПР-010).
--
-- Раньше была одна отметка «клиент подтвердил день выезда», и она снималась
-- после забора и при любом переносе дат — оператор не видел, что клиенту уже
-- звонили, и звонил повторно. Теперь:
--   • client_confirmed* — подтверждение дня ЗАБОРА (колонки V43 остаются);
--   • delivery_confirmed* — подтверждение дня ОТВОЗА;
--   • каждая отметка сбрасывается только при переносе дня своего этапа;
--   • order_calls — журнал звонков: время последнего звонка видно всегда,
--     даже когда отметку сняли из-за переноса.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed_by VARCHAR(150);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS order_calls (
    id         BIGSERIAL PRIMARY KEY,
    order_id   BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    leg        VARCHAR(10) NOT NULL,
    called_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    called_by  VARCHAR(150),
    CONSTRAINT order_calls_leg_check CHECK (leg IN ('PICKUP', 'DELIVERY'))
);
CREATE INDEX IF NOT EXISTS idx_order_calls_order_leg ON order_calls(order_id, leg, called_at DESC);

-- Подтверждения заказов, которые уже прошли забор, относились к отвозу:
-- после забора старая отметка снималась, значит текущая — про доставку.
UPDATE orders
   SET delivery_confirmed = TRUE,
       delivery_confirmed_by = client_confirmed_by,
       delivery_confirmed_at = client_confirmed_at,
       client_confirmed = FALSE,
       client_confirmed_by = NULL,
       client_confirmed_at = NULL
 WHERE client_confirmed
   AND status NOT IN ('LEAD', 'CREATED', 'FOR_PICKUP');

-- Уже стоящие отметки — первые записи журнала звонков.
INSERT INTO order_calls (order_id, leg, called_at, called_by)
SELECT id, 'PICKUP', client_confirmed_at, client_confirmed_by
  FROM orders WHERE client_confirmed AND client_confirmed_at IS NOT NULL;
INSERT INTO order_calls (order_id, leg, called_at, called_by)
SELECT id, 'DELIVERY', delivery_confirmed_at, delivery_confirmed_by
  FROM orders WHERE delivery_confirmed AND delivery_confirmed_at IS NOT NULL;
