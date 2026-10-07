-- V45: возвраты и компенсации по заказам (правка №3 от 19.09).
--
-- В системе были «перестирка» и «гарантия», но не было случая, когда компания
-- возвращает клиенту деньги или платит за испорченный ковёр. Такие истории
-- нигде не учитывались, и вопрос «сколько мы теряем на претензиях» отвечался
-- по памяти.
--
-- Одна запись — одно событие по заказу: вернули деньги, вернули часть,
-- компенсировали стоимость ковра. Сумма всегда положительная: это потеря
-- компании, знак задаёт сам тип события.

CREATE TABLE IF NOT EXISTS order_refunds (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    -- FULL_REFUND — полный возврат средств, PARTIAL_REFUND — частичный,
    -- ITEM_COMPENSATION — компенсация стоимости ковра, OTHER — прочее.
    kind        VARCHAR(30) NOT NULL,
    amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason      VARCHAR(255) NOT NULL,
    comment     TEXT,
    -- Когда деньги фактически отдали: может отличаться от даты записи.
    occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by  VARCHAR(150),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_refunds_order ON order_refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_order_refunds_date  ON order_refunds(occurred_on);
