-- V57: пометка откатов в истории статусов.
--
-- Кнопка «Откатить» берёт предыдущий статус из order_status_history. Раньше это
-- был old_status последней записи, а откат сам пишет запись (текущий → предыдущий),
-- поэтому второй откат подряд возвращал заказ туда, откуда его только что
-- откатили. С откатом из «Завершён» это стало опасно: второй откат перевёл бы
-- заказ обратно в COMPLETED без оплаты. Флаг позволяет пропускать пары
-- «переход + его откат» и откатываться дальше по цепочке.

ALTER TABLE order_status_history
    ADD COLUMN IF NOT EXISTS is_rollback BOOLEAN NOT NULL DEFAULT FALSE;

-- Уже сделанные откаты опознаём по записи журнала действий: обе записи пишутся
-- в одной транзакции, поэтому NOW() у них совпадает до микросекунды.
UPDATE order_status_history h
SET is_rollback = TRUE
FROM audit_log a
WHERE a.entity_type = 'ORDER'
  AND a.action = 'STATUS_ROLLBACK'
  AND a.entity_id = h.order_id
  AND a.occurred_at = h.changed_at
  AND a.description LIKE '%: ' || h.old_status || ' → ' || h.new_status || ' %';
