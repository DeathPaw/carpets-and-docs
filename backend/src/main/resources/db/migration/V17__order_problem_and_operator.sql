-- V17: проблемные заказы и закрепление оформляющего оператора.
--
-- 1) is_problem + problem_reason — оператор может пометить заказ как проблемный
--    (что-то пошло не так: спор с клиентом, повреждение, потеря, и т.п.). По
--    флагу шлём уведомление админам. Когда оператор снимает флаг — помечаем
--    соответствующие уведомления прочитанными для админов.
-- 2) assigned_operator_id — кто из операторов оформлял заказ. Заполняется
--    автоматически при создании, если у создателя role=OPERATOR/SUPERVISOR
--    и есть привязка к employee. По этому полю шлём операторские уведомления
--    о смене статуса в «его» заказе.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_problem      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS problem_reason  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_operator_id BIGINT REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_problem ON orders(is_problem) WHERE is_problem = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_assigned_operator ON orders(assigned_operator_id)
  WHERE assigned_operator_id IS NOT NULL;
