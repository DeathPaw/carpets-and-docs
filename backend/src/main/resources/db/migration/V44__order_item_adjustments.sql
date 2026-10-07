-- V44: корректировки ковра производством (правка №2 от 17.09).
--
-- Стирщик на производстве видит ковёр вживую: материал оказывается шерстью,
-- а не синтетикой, размеры — не теми, что назвал клиент. Раньше он правил
-- размеры с телефона, цена пересчитывалась, и оператор видел только новую
-- сумму — объяснить клиенту, почему она изменилась, было нечем.
--
-- Теперь каждая такая правка фиксируется: что было, что стало, кто и когда
-- внёс, и сколько позиция стоила до и после пересчёта.

CREATE TABLE IF NOT EXISTS order_item_adjustments (
    id            BIGSERIAL PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    -- Что правили: DIMENSIONS — размеры, ITEM_TYPE — тип/материал ковра.
    field         VARCHAR(20) NOT NULL,
    old_value     TEXT,
    new_value     TEXT,
    price_before  NUMERIC(12,2),
    price_after   NUMERIC(12,2),
    changed_by    VARCHAR(150),
    -- Кто правил: PRODUCTION — кабинет работника, OPERATOR — карточка заказа.
    source        VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_item_adjustments_item
    ON order_item_adjustments(order_item_id);
