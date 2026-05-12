-- ============================================================================
-- ЗАКАЗЫ ПОД СЦЕНАРИЙ DEMO.md
-- IDs клиентов: 1=Astoria, 2=Park Inn, 3=Иванова, 4=Петров, 5=Сидорова, 6=Кузьмин, 7=Морозова
-- IDs SKU: 1 Доставка, 2 Приём, 3 Стирка 5-15, 4 Стирка 15-30, 5 Полотенца,
--          6 Стирка штор, 7 Глажка штучно, 8 Глажка штор, 9 Сушка, 10 Химчистка,
--          11 Антипятенная, 12 Упаковка
-- IDs item_types: 1 Доставка, 2 Приём, 3 Пододеяльник, 4 Простыня, 5 Наволочка,
--          6 Полотенце банное, 7 Полотенце для лица, 8 Покрывало, 9 Шторы,
--          10 Плед, 11 Скатерть, 12 Халат
-- ============================================================================

BEGIN;

-- ---------- ЗАКАЗ 1: Astoria — большая партия, IN_PROGRESS ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, actual_pickup_date, actual_pickup_time_slot,
                    comment, discount_percent, base_amount, total_amount)
VALUES (1, 'Отель Astoria 5*', 'IN_PROGRESS',
        'Большая Морская ул., 39 (служ. вход)', 'Большая Морская ул., 39 (склад)',
        'Центральный', 'Центральный', 59.9329, 30.3083, 59.9329, 30.3083,
        CURRENT_DATE - INTERVAL '1 day', '08:00-12:00',
        CURRENT_DATE - INTERVAL '1 day', '08:00-12:00',
        'Партия от понедельника, как обычно. Контакт — Елена, прачечная.',
        10.00, 0, 0)
RETURNING id \gset astoria1_

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES
  (:astoria1_id, 1, '', 'CREATED', 0, NULL),
  (:astoria1_id, 2, '', 'CREATED', 0, NULL);

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:astoria1_id, 3, 'Партия 50 шт, белые', 'IN_PROGRESS', 0, 22.00)
RETURNING id \gset astoria1_p3_

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:astoria1_id, 4, 'Партия 50 шт, белые', 'IN_PROGRESS', 0, 18.00)
RETURNING id \gset astoria1_p4_

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:astoria1_id, 6, 'Партия 80 шт', 'IN_PROGRESS', 0, 24.00)
RETURNING id \gset astoria1_p6_

INSERT INTO order_items (order_id, item_type_id, description, defects, status, price)
VALUES (:astoria1_id, 11, 'Льняная, банкетная',
        'Жёлтое пятно 3×4 см в правом углу — кофе, замечено при приёмке',
        'IN_PROGRESS', 0)
RETURNING id \gset astoria1_p11_

INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price, is_manual_price)
VALUES
  (:astoria1_p3_id, 4, 4, 'DONE',        4840, FALSE),
  (:astoria1_p3_id, 7, 7, 'IN_PROGRESS', 3000, TRUE);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, CASE WHEN sku_id = 4 THEN 1 ELSE 2 END
  FROM order_item_services WHERE order_item_id = :astoria1_p3_id;
UPDATE order_items SET price = 7840 WHERE id = :astoria1_p3_id;

INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price, is_manual_price)
VALUES
  (:astoria1_p4_id, 4, 4, 'DONE',        3960, FALSE),
  (:astoria1_p4_id, 7, 7, 'IN_PROGRESS', 3000, TRUE);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, CASE WHEN sku_id = 4 THEN 1 ELSE 2 END
  FROM order_item_services WHERE order_item_id = :astoria1_p4_id;
UPDATE order_items SET price = 6960 WHERE id = :astoria1_p4_id;

INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES
  (:astoria1_p6_id, 5, 5, 'DONE', 5760),
  (:astoria1_p6_id, 9, 9, 'DONE', 1200);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 3 FROM order_item_services WHERE order_item_id = :astoria1_p6_id;
UPDATE order_items SET price = 6960 WHERE id = :astoria1_p6_id;

INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES
  (:astoria1_p11_id, 10, 10, 'IN_PROGRESS', 1200),
  (:astoria1_p11_id, 11, 11, 'IN_PROGRESS', 500);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 3 FROM order_item_services WHERE order_item_id = :astoria1_p11_id;
UPDATE order_items SET price = 1700 WHERE id = :astoria1_p11_id;

-- Доставка обнулилась (порог 3000 пройден)
UPDATE order_items SET price = 0 WHERE order_id = :astoria1_id AND item_type_id = 1;

-- Модификатор «Постоянный клиент -10%»
INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent)
VALUES (:astoria1_id, 1, 'Постоянный клиент', -10.00);

-- base = 7840+6960+6960+1700 = 23460; total = 23460 × 0.9 = 21114
UPDATE orders SET base_amount = 23460, total_amount = 21114 WHERE id = :astoria1_id;

-- ---------- ЗАКАЗ 2: Astoria — DONE (готов к выдаче, для сцены 5) ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, actual_pickup_date, actual_pickup_time_slot,
                    delivery_date, delivery_time_slot, discount_percent, base_amount, total_amount)
VALUES (1, 'Отель Astoria 5*', 'DONE',
        'Большая Морская ул., 39', 'Большая Морская ул., 39',
        'Центральный', 'Центральный', 59.9329, 30.3083, 59.9329, 30.3083,
        CURRENT_DATE - INTERVAL '3 days', '08:00-12:00',
        CURRENT_DATE - INTERVAL '3 days', '08:00-12:00',
        CURRENT_DATE, '12:00-18:00', 10.00, 0, 0)
RETURNING id \gset astoria2_

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES
  (:astoria2_id, 1, '', 'CREATED', 0, NULL),
  (:astoria2_id, 2, '', 'CREATED', 0, NULL);

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:astoria2_id, 3, 'Партия 30 шт', 'DONE', 0, 13.00)
RETURNING id \gset astoria2_p3_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:astoria2_p3_id, 3, 3, 'DONE', 3250);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 1 FROM order_item_services WHERE order_item_id = :astoria2_p3_id;
UPDATE order_items SET price = 3250 WHERE id = :astoria2_p3_id;
UPDATE order_items SET price = 0 WHERE order_id = :astoria2_id AND item_type_id = 1;
INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent)
VALUES (:astoria2_id, 1, 'Постоянный клиент', -10.00);
UPDATE orders SET base_amount = 3250, total_amount = 2925 WHERE id = :astoria2_id;

-- ---------- ЗАКАЗ 3: Park Inn — IN_PROGRESS ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, actual_pickup_date, actual_pickup_time_slot,
                    base_amount, total_amount)
VALUES (2, 'Park Inn Невский', 'IN_PROGRESS',
        'Невский пр., 89', 'Невский пр., 89',
        'Центральный', 'Центральный', 59.9311, 30.3609, 59.9311, 30.3609,
        CURRENT_DATE - INTERVAL '1 day', '12:00-18:00',
        CURRENT_DATE - INTERVAL '1 day', '12:00-18:00', 0, 0)
RETURNING id \gset pi_

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES
  (:pi_id, 1, '', 'CREATED', 0, NULL),
  (:pi_id, 2, '', 'CREATED', 0, NULL);

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:pi_id, 4, 'Партия 40 шт', 'IN_PROGRESS', 0, 16.00)
RETURNING id \gset pi_p4_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:pi_p4_id, 4, 4, 'IN_PROGRESS', 3520);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 1 FROM order_item_services WHERE order_item_id = :pi_p4_id;
UPDATE order_items SET price = 3520 WHERE id = :pi_p4_id;

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
VALUES (:pi_id, 7, 'Партия 60 шт', 'IN_PROGRESS', 0, 6.00)
RETURNING id \gset pi_p7_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:pi_p7_id, 5, 5, 'IN_PROGRESS', 1440);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 3 FROM order_item_services WHERE order_item_id = :pi_p7_id;
UPDATE order_items SET price = 1440 WHERE id = :pi_p7_id;

UPDATE order_items SET price = 0 WHERE order_id = :pi_id AND item_type_id = 1;
UPDATE orders SET base_amount = 4960, total_amount = 4960 WHERE id = :pi_id;

-- ---------- ЗАКАЗ 4: Иванова — CREATED, маленький, на доставку ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, base_amount, total_amount)
VALUES (3, 'Иванова Анна Петровна', 'CREATED',
        'Невский пр., д. 100, кв. 5', 'Невский пр., д. 100, кв. 5',
        'Центральный', 'Центральный', 59.9311, 30.3609, 59.9311, 30.3609,
        CURRENT_DATE + INTERVAL '1 day', '12:00-18:00', 0, 0)
RETURNING id \gset iv_

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES
  (:iv_id, 1, '', 'CREATED', 500),
  (:iv_id, 2, '', 'CREATED', 0);

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES (:iv_id, 10, 'Плед серый, шерсть', 'CREATED', 0)
RETURNING id \gset iv_p10_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:iv_p10_id, 10, 10, 'CREATED', 1200);
UPDATE order_items SET price = 1200 WHERE id = :iv_p10_id;
UPDATE orders SET base_amount = 1700, total_amount = 1700 WHERE id = :iv_id;

-- ---------- ЗАКАЗ 5: Сидорова — FOR_PICKUP завтра, шторы ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, base_amount, total_amount)
VALUES (5, 'Сидорова Елена Михайловна', 'FOR_PICKUP',
        'Большой пр. П.С., д. 80, кв. 12', 'Большой пр. П.С., д. 80, кв. 12',
        'Петроградский', 'Петроградский', 59.9650, 30.2900, 59.9650, 30.2900,
        CURRENT_DATE + INTERVAL '1 day', '12:00-18:00', 0, 0)
RETURNING id \gset sd_

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES
  (:sd_id, 1, '', 'CREATED', 500),
  (:sd_id, 2, '', 'CREATED', 0);

INSERT INTO order_items (order_id, item_type_id, description, status, price, weight, area, length, width)
VALUES (:sd_id, 9, 'Гостиная, бежевые', 'CREATED', 0, 4.00, 6.00, 3.00, 2.00)
RETURNING id \gset sd_p9_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES
  (:sd_p9_id, 6, 6, 'CREATED', 1120),
  (:sd_p9_id, 8, 8, 'CREATED', 480);
UPDATE order_items SET price = 1600 WHERE id = :sd_p9_id;
UPDATE orders SET base_amount = 2100, total_amount = 2100 WHERE id = :sd_id;

-- ---------- ЗАКАЗ 6: Морозова — DONE, доставка сегодня ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, actual_pickup_date, actual_pickup_time_slot,
                    delivery_date, delivery_time_slot, base_amount, total_amount)
VALUES (7, 'Морозова Татьяна Игоревна', 'DONE',
        'ул. Савушкина, д. 119, кв. 7', 'ул. Савушкина, д. 119, кв. 7',
        'Приморский', 'Приморский', 59.9885, 30.2447, 59.9885, 30.2447,
        CURRENT_DATE - INTERVAL '2 days', '12:00-18:00',
        CURRENT_DATE - INTERVAL '2 days', '12:00-18:00',
        CURRENT_DATE, '18:00-22:00', 0, 0)
RETURNING id \gset mz_

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES
  (:mz_id, 1, '', 'CREATED', 500),
  (:mz_id, 2, '', 'CREATED', 0);

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES (:mz_id, 8, 'Покрывало велюр зелёное', 'DONE', 0)
RETURNING id \gset mz_p8_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:mz_p8_id, 10, 10, 'DONE', 1200);
INSERT INTO service_assignees (order_item_service_id, employee_id)
SELECT id, 3 FROM order_item_services WHERE order_item_id = :mz_p8_id;
UPDATE order_items SET price = 1200 WHERE id = :mz_p8_id;
UPDATE orders SET base_amount = 1700, total_amount = 1700 WHERE id = :mz_id;

-- ---------- ЗАКАЗ 7: Петров — В ПРОСРОЧКЕ (FOR_PICKUP 4 дня назад) ----------
INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                    pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, base_amount, total_amount)
VALUES (4, 'Петров Сергей Викторович', 'FOR_PICKUP',
        'ул. Фурштатская, д. 12, кв. 3', 'ул. Фурштатская, д. 12, кв. 3',
        'Центральный', 'Центральный', 59.9410, 30.3540, 59.9410, 30.3540,
        CURRENT_DATE - INTERVAL '4 days', '08:00-12:00', 0, 0)
RETURNING id \gset pt_

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES
  (:pt_id, 1, '', 'CREATED', 500),
  (:pt_id, 2, '', 'CREATED', 0);

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES (:pt_id, 4, 'Простыня 1 шт', 'CREATED', 0)
RETURNING id \gset pt_p4_
INSERT INTO order_item_services (order_item_id, sku_id, sku_version_id, status, price)
VALUES (:pt_p4_id, 3, 3, 'CREATED', 250);
UPDATE order_items SET price = 250 WHERE id = :pt_p4_id;
UPDATE orders SET base_amount = 750, total_amount = 750 WHERE id = :pt_id;

-- ---------- ЗАКАЗ 8: Кузьмин — LEAD ----------
INSERT INTO orders (client_id, client_name, status, base_amount, total_amount)
VALUES (6, 'Кузьмин Олег Андреевич', 'LEAD', 500, 500)
RETURNING id \gset kz_

INSERT INTO order_items (order_id, item_type_id, description, status, price)
VALUES
  (:kz_id, 1, '', 'CREATED', 500),
  (:kz_id, 2, '', 'CREATED', 0);

-- ---------- ЗАКАЗЫ 9-15: «Без даты» для сцены 6 ----------
WITH new_orders AS (
  INSERT INTO orders (client_id, client_name, status, pickup_address, pickup_district, pickup_lat, pickup_lon, base_amount, total_amount)
  VALUES
    (3, 'Иванова Анна Петровна',     'CREATED', 'Невский пр., д. 100, кв. 5',         'Центральный',   59.9311, 30.3609, 800,  800),
    (4, 'Петров Сергей Викторович',  'CREATED', 'ул. Фурштатская, д. 12, кв. 3',     'Центральный',   59.9410, 30.3540, 1200, 1200),
    (5, 'Сидорова Елена Михайловна', 'CREATED', 'Большой пр. П.С., д. 80, кв. 12',   'Петроградский', 59.9650, 30.2900, 950,  950),
    (6, 'Кузьмин Олег Андреевич',    'LEAD',    'пр. Просвещения, д. 25, кв. 18',    'Выборгский',    60.0500, 30.3500, 700,  700),
    (7, 'Морозова Татьяна Игоревна', 'LEAD',    'ул. Савушкина, д. 119, кв. 7',      'Приморский',    59.9885, 30.2447, 1500, 1500),
    (3, 'Иванова Анна Петровна',     'CREATED', 'Невский пр., д. 100, кв. 5',         'Центральный',   59.9311, 30.3609, 600,  600),
    (5, 'Сидорова Елена Михайловна', 'LEAD',    'Большой пр. П.С., д. 80, кв. 12',   'Петроградский', 59.9650, 30.2900, 1800, 1800)
  RETURNING id
)
INSERT INTO order_items (order_id, item_type_id, description, status, price)
SELECT no.id, t.item_type_id, '', 'CREATED', t.price
  FROM new_orders no, (VALUES (1, 500), (2, 0)) AS t(item_type_id, price);

-- ---------- ЗАКАЗЫ 16-22: COMPLETED исторические для аналитики ----------
WITH archived AS (
  INSERT INTO orders (client_id, client_name, status, pickup_address, delivery_address,
                      pickup_district, delivery_district, pickup_lat, pickup_lon, delivery_lat, delivery_lon,
                      pickup_date, actual_pickup_date, delivery_date, actual_delivery_date,
                      payment_type, paid, payment_date, base_amount, total_amount, discount_percent)
  VALUES
    (1, 'Отель Astoria 5*',           'COMPLETED', 'Большая Морская ул., 39', 'Большая Морская ул., 39', 'Центральный', 'Центральный', 59.9329, 30.3083, 59.9329, 30.3083, CURRENT_DATE - 14, CURRENT_DATE - 14, CURRENT_DATE - 12, CURRENT_DATE - 12, 'TRANSFER', TRUE, CURRENT_DATE - 12, 35000, 31500, 10),
    (1, 'Отель Astoria 5*',           'COMPLETED', 'Большая Морская ул., 39', 'Большая Морская ул., 39', 'Центральный', 'Центральный', 59.9329, 30.3083, 59.9329, 30.3083, CURRENT_DATE - 21, CURRENT_DATE - 21, CURRENT_DATE - 19, CURRENT_DATE - 19, 'TRANSFER', TRUE, CURRENT_DATE - 19, 28000, 25200, 10),
    (2, 'Park Inn Невский',           'COMPLETED', 'Невский пр., 89',         'Невский пр., 89',         'Центральный', 'Центральный', 59.9311, 30.3609, 59.9311, 30.3609, CURRENT_DATE - 10, CURRENT_DATE - 10, CURRENT_DATE - 8,  CURRENT_DATE - 8,  'TRANSFER', TRUE, CURRENT_DATE - 8,  18500, 18500,  0),
    (3, 'Иванова Анна Петровна',      'COMPLETED', 'Невский пр., д. 100',     'Невский пр., д. 100',     'Центральный', 'Центральный', 59.9311, 30.3609, 59.9311, 30.3609, CURRENT_DATE - 7,  CURRENT_DATE - 7,  CURRENT_DATE - 5,  CURRENT_DATE - 5,  'CARD',     TRUE, CURRENT_DATE - 5,  1700,  1700,   0),
    (5, 'Сидорова Елена Михайловна',  'COMPLETED', 'Большой пр. П.С., 80',    'Большой пр. П.С., 80',    'Петроградский','Петроградский',59.9650, 30.2900, 59.9650, 30.2900, CURRENT_DATE - 6,  CURRENT_DATE - 6,  CURRENT_DATE - 4,  CURRENT_DATE - 4,  'CARD',     TRUE, CURRENT_DATE - 4,  2100,  2100,   0),
    (7, 'Морозова Татьяна Игоревна',  'COMPLETED', 'ул. Савушкина, 119',      'ул. Савушкина, 119',      'Приморский',  'Приморский',  59.9885, 30.2447, 59.9885, 30.2447, CURRENT_DATE - 15, CURRENT_DATE - 15, CURRENT_DATE - 13, CURRENT_DATE - 13, 'CASH',     TRUE, CURRENT_DATE - 13, 1700,  1700,   0),
    (1, 'Отель Astoria 5*',           'COMPLETED', 'Большая Морская ул., 39', 'Большая Морская ул., 39', 'Центральный', 'Центральный', 59.9329, 30.3083, 59.9329, 30.3083, CURRENT_DATE - 32, CURRENT_DATE - 32, CURRENT_DATE - 30, CURRENT_DATE - 30, 'TRANSFER', TRUE, CURRENT_DATE - 30, 42000, 37800, 10)
  RETURNING id, base_amount
)
INSERT INTO order_items (order_id, item_type_id, description, status, price, weight)
SELECT a.id, 4, 'Архив', 'DONE', a.base_amount, 15 FROM archived a;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM order_items) AS items,
  (SELECT COUNT(*) FROM order_item_services) AS services,
  (SELECT COUNT(*) FROM service_assignees) AS assignees;
