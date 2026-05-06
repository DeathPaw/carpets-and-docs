-- ============================================================================
-- V2: Триггер автоматического пересчёта orders.base_amount.
--
-- Проблема (см. List 2 п.9 в анализе):
--   total_amount хранится в БД и пересчитывается вручную через recalculateTotalAmount.
--   Если разработчик в новом коде забудет вызвать — рассинхрон между сохранёнными
--   позициями и итоговой суммой заказа.
--
-- Решение:
--   Триггер на order_items, который автоматически держит orders.base_amount = SUM
--   цен НЕ-отменённых позиций. Java-код продолжает считать total_amount с учётом
--   модификаторов и default-позиций (доставка/оформление с free_threshold), но даже
--   если он забудет про base_amount — БД сама подтянет его.
--
-- Что НЕ делает триггер:
--   • Не трогает orders.total_amount (зависит от модификаторов — это бизнес-логика
--     в OrderService.recalculateTotalWithModifiers).
--   • Не пересчитывает default-позиции (доставка с free_threshold) — они тоже
--     зависят от item_types.free_threshold и должны управляться сервисом.
-- ============================================================================

CREATE OR REPLACE FUNCTION recalc_order_base_amount(p_order_id BIGINT)
RETURNS VOID AS $$
BEGIN
    UPDATE orders
       SET base_amount = COALESCE((
             SELECT SUM(price) FROM order_items
              WHERE order_id = p_order_id
                AND status <> 'CANCELLED'
           ), 0),
           updated_at = NOW()
     WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_items_recalc()
RETURNS TRIGGER AS $$
BEGIN
    -- Используем NEW.order_id для INSERT/UPDATE и OLD.order_id для DELETE.
    -- При UPDATE одной позиции order_id не меняется, поэтому одного вызова достаточно.
    IF TG_OP = 'DELETE' THEN
        PERFORM recalc_order_base_amount(OLD.order_id);
        RETURN OLD;
    ELSE
        PERFORM recalc_order_base_amount(NEW.order_id);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_recalc_total ON order_items;
CREATE TRIGGER order_items_recalc_total
AFTER INSERT OR UPDATE OF price, status OR DELETE
ON order_items
FOR EACH ROW
EXECUTE FUNCTION trg_order_items_recalc();
