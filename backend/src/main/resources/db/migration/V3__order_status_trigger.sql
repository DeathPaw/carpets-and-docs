-- ============================================================================
-- V3: Триггер автоматического пересчёта orders.status на основе статусов позиций.
--
-- Проблема (см. List 2 п.10 в анализе):
--   recalculateOrderStatus в OrderService вызывается «откуда надо» — если в новом
--   коде разработчик забудет вызвать, статус застрянет.
--
-- Решение:
--   Триггер на order_items, который при UPDATE статуса позиции пересчитывает
--   статус заказа по тем же правилам, что и OrderService.computeOrderStatus.
--
-- Правила (повторяют Java-логику для согласованности):
--   • LEAD / DELIVERED / COMPLETED — никогда не меняем (управляются вручную).
--   • Дефолтные позиции (item_types.is_default = TRUE) — игнорируются при
--     вычислении статуса (доставка/оформление сами не двигают заказ).
--   • Все позиции CANCELLED → CANCELLED.
--   • Все позиции DONE или CANCELLED, есть хоть одна DONE → DONE.
--   • Есть хоть одна IN_PROGRESS / PARTIALLY_DONE / DONE → IN_PROGRESS или
--     PARTIALLY_DONE (если есть DONE среди не-завершённых, но не все).
--   • Иначе оставляем как есть (CREATED → CREATED, FOR_PICKUP → FOR_PICKUP).
--
-- Что НЕ делает триггер:
--   • Не пишет в order_status_history (это делает Java, который ведёт также
--     audit_log с детализацией). Триггер — только защита от рассинхрона.
-- ============================================================================

CREATE OR REPLACE FUNCTION compute_order_status(p_order_id BIGINT)
RETURNS VARCHAR AS $$
DECLARE
    v_current_status VARCHAR;
    v_total INTEGER;
    v_done INTEGER;
    v_cancelled INTEGER;
    v_in_progress INTEGER;
    v_partially_done INTEGER;
    v_use_meaningful BOOLEAN;
BEGIN
    SELECT status INTO v_current_status FROM orders WHERE id = p_order_id;
    IF v_current_status IS NULL THEN RETURN NULL; END IF;
    -- Эти статусы — финальные/начальные, не трогаем.
    IF v_current_status IN ('LEAD', 'DELIVERED', 'COMPLETED') THEN
        RETURN v_current_status;
    END IF;

    -- Считаем сначала только «значимые» позиции (без дефолтных).
    -- Если значимых нет вообще — пересчитываем по всем позициям заказа.
    SELECT COUNT(*) > 0 INTO v_use_meaningful
      FROM order_items oi
      JOIN item_types it ON it.id = oi.item_type_id
     WHERE oi.order_id = p_order_id AND it.is_default = FALSE;

    IF v_use_meaningful THEN
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE oi.status = 'DONE'),
            COUNT(*) FILTER (WHERE oi.status = 'CANCELLED'),
            COUNT(*) FILTER (WHERE oi.status = 'IN_PROGRESS'),
            COUNT(*) FILTER (WHERE oi.status = 'PARTIALLY_DONE')
        INTO v_total, v_done, v_cancelled, v_in_progress, v_partially_done
          FROM order_items oi
          JOIN item_types it ON it.id = oi.item_type_id
         WHERE oi.order_id = p_order_id AND it.is_default = FALSE;
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

    -- Все позиции в финальных статусах (DONE/CANCELLED) — заказ DONE или CANCELLED.
    IF v_done + v_cancelled = v_total THEN
        IF v_done > 0 THEN RETURN 'DONE'; ELSE RETURN 'CANCELLED'; END IF;
    END IF;

    -- Есть хоть одна готовая или частично готовая — PARTIALLY_DONE.
    IF v_done > 0 OR v_partially_done > 0 THEN
        RETURN 'PARTIALLY_DONE';
    END IF;

    -- Что-то в работе — IN_PROGRESS.
    IF v_in_progress > 0 THEN
        RETURN 'IN_PROGRESS';
    END IF;

    -- Иначе оставляем текущий (CREATED/FOR_PICKUP — управляются вручную).
    RETURN v_current_status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_items_status_recalc()
RETURNS TRIGGER AS $$
DECLARE
    v_new_status VARCHAR;
    v_current_status VARCHAR;
    v_order_id BIGINT;
BEGIN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
    SELECT status INTO v_current_status FROM orders WHERE id = v_order_id;
    v_new_status := compute_order_status(v_order_id);

    IF v_new_status IS NOT NULL AND v_new_status <> v_current_status THEN
        UPDATE orders
           SET status = v_new_status,
               version = version + 1,
               updated_at = NOW()
         WHERE id = v_order_id;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_recalc_status ON order_items;
CREATE TRIGGER order_items_recalc_status
AFTER INSERT OR UPDATE OF status OR DELETE
ON order_items
FOR EACH ROW
EXECUTE FUNCTION trg_order_items_status_recalc();
