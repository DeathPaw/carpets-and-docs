-- V30: предварительный тип оплаты заказа (правка №10 от 20.08).
--
-- Оператор заранее помечает, чем клиент планирует расплатиться, чтобы водитель
-- видел это в маршрутном листе ещё до выезда. Это ИМЕННО предварительное
-- значение: фактическая оплата по-прежнему фиксируется отдельно при завершении
-- заказа (orders.paid + orders.payment_type) и здесь ничего не перетирает.
--
-- Отдельная колонка, а не переиспользование payment_type, потому что:
--   • payment_type заполняется только по факту оплаты, и наличие значения в нём
--     означает «деньги получены» — смешивать с намерением нельзя;
--   • набор значений шире: кроме способов оплаты нужны «уже оплачено» и
--     «бесплатно / гарантийное обслуживание».
--
-- Значения: CASH | CARD | TRANSFER | PAID | FREE. NULL — оператор не указал.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS preliminary_payment_type VARCHAR(20);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_preliminary_payment_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_preliminary_payment_type_check
    CHECK (preliminary_payment_type IS NULL
           OR preliminary_payment_type IN ('CASH', 'CARD', 'TRANSFER', 'PAID', 'FREE'));

-- Заказы, которые уже оплачены, задним числом помечаем как PAID: иначе в
-- маршрутном листе у архивных развозок колонка «Оплата» была бы пустой.
UPDATE orders SET preliminary_payment_type = 'PAID'
 WHERE paid = TRUE AND preliminary_payment_type IS NULL;
