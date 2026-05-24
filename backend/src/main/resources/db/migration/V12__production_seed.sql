-- ============================================================================
-- V12: Production seed для ковровой прачечной.
--
-- 1. Удаляет ВСЕ пользовательские данные (заказы, клиенты, сотрудники, SKU…).
--    Структура (Flyway-миграции V1-V11) остаётся.
--    Справочные данные attribute_definitions и districts тоже остаются.
-- 2. Заливает справочники из Excel «Ковры_справочник»:
--    - 12 типов позиций (Ковролин, Синтетический, Шерсть, … + Плед/Одеяло/Тюль/Штора + Доставка)
--    - 11 SKU стирки (по типу) + 4 SKU доставки (Забор/Отвоз — auto-add 300₽ free от 4000, Самовывоз — 0₽)
--    - 6 модификаторов цены (наценки, скидки)
--    - 2 роли сотрудников: Стирщик, Водитель
--    - 9 сотрудников: 2 супер-админа (Поляковы), 2 оператора, 2 стирщика, 1 водитель, 2 подрядчика
--    - 5 веб-пользователей (foxy + Поляковы + операторы)
-- ============================================================================

BEGIN;

-- ---------- 1. Очистка ----------

-- Снимаем FK skus.current_version_id перед удалением версий
UPDATE skus SET current_version_id = NULL;

DELETE FROM order_item_service_defects;
DELETE FROM service_assignees;
DELETE FROM notifications;
DELETE FROM order_item_services;
DELETE FROM order_item_photos;
DELETE FROM order_status_history;
DELETE FROM order_modifiers;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM client_modifiers;
DELETE FROM client_events;
DELETE FROM clients;
DELETE FROM monthly_expenses;
DELETE FROM expense_categories;
DELETE FROM sku_versions;
DELETE FROM sku_attributes;
DELETE FROM skus;
DELETE FROM sku_groups;
DELETE FROM employee_role_item_types;
DELETE FROM users;
DELETE FROM employees;
DELETE FROM employee_roles;
DELETE FROM item_types;
DELETE FROM price_modifiers;

-- Reset sequences
ALTER SEQUENCE clients_id_seq             RESTART WITH 1;
ALTER SEQUENCE orders_id_seq              RESTART WITH 1;
ALTER SEQUENCE order_items_id_seq         RESTART WITH 1;
ALTER SEQUENCE order_item_services_id_seq RESTART WITH 1;
ALTER SEQUENCE item_types_id_seq          RESTART WITH 1;
ALTER SEQUENCE skus_id_seq                RESTART WITH 1;
ALTER SEQUENCE sku_groups_id_seq          RESTART WITH 1;
ALTER SEQUENCE sku_versions_id_seq        RESTART WITH 1;
ALTER SEQUENCE employees_id_seq           RESTART WITH 1;
ALTER SEQUENCE employee_roles_id_seq      RESTART WITH 1;
ALTER SEQUENCE price_modifiers_id_seq     RESTART WITH 1;
ALTER SEQUENCE users_id_seq               RESTART WITH 1;
ALTER SEQUENCE notifications_id_seq       RESTART WITH 1;

-- ---------- 2. Типы позиций ----------

INSERT INTO item_types (id, name) VALUES
  (1,  'Ковролин'),
  (2,  'Синтетический ковёр'),
  (3,  'Шерстяной ковёр'),
  (4,  'Ковёр с длинным ворсом'),
  (5,  'Акриловый ковёр'),
  (6,  'Вискозный ковёр'),
  (7,  'Тип не определён'),
  (8,  'Плед'),
  (9,  'Одеяло'),
  (10, 'Тюль'),
  (11, 'Штора'),
  (12, 'Доставка');
SELECT setval('item_types_id_seq', 12);

-- ---------- 3. Группы SKU ----------

INSERT INTO sku_groups (id, name, sort_order) VALUES
  (1, 'Стирка',   10),
  (2, 'Доставка', 20);
SELECT setval('sku_groups_id_seq', 2);

-- ---------- 4. SKU каталог ----------
-- Цены из Excel «Ковры_справочник»

INSERT INTO skus (id, group_id, name, pricing_type, price, cost_price, is_auto_add, free_threshold,
                  auto_complete_on_status, triggers_order_status, exclude_from_status_calc, is_active) VALUES
  -- Стирка (по типам)
  (1,  1, 'Стирка ковролина',                  'BY_AREA',   450.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (2,  1, 'Стирка синтетического ковра',       'BY_AREA',   480.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (3,  1, 'Стирка шерстяного ковра',           'BY_AREA',   480.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (4,  1, 'Стирка ковра с длинным ворсом',     'BY_AREA',   550.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (5,  1, 'Стирка акрилового ковра',           'BY_AREA',   550.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (6,  1, 'Стирка вискозного ковра',           'BY_AREA',   650.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (7,  1, 'Стирка ковра (тип не определён)',   'BY_AREA',   530.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (8,  1, 'Стирка пледа',                      'BY_WEIGHT', 250.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (9,  1, 'Стирка одеяла',                     'BY_WEIGHT', 250.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (10, 1, 'Стирка тюля',                       'BY_AREA',   100.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  (11, 1, 'Стирка шторы',                      'BY_AREA',   100.00, NULL, FALSE, NULL, NULL, NULL, FALSE, TRUE),
  -- Доставка
  -- Забор: auto-add 300₽, free от 4000₽. Когда водитель завершает «забор» — заказ переходит в работу.
  -- exclude_from_status_calc=true — доставка не блокирует общий статус DONE.
  (12, 2, 'Доставка (забор)',                  'FIXED',     300.00, NULL, TRUE,  4000.00, NULL,        'IN_PROGRESS', TRUE, TRUE),
  -- Отвоз: auto-add 300₽, при завершении — заказ в «Доставлен».
  (13, 2, 'Доставка (отвоз)',                  'FIXED',     300.00, NULL, TRUE,  4000.00, NULL,        'DELIVERED',   TRUE, TRUE),
  -- Самовывоз: НЕ auto-add. Оператор удаляет «Забор»/«Отвоз» и добавляет «Самовывоз» если клиент сам везёт.
  (14, 2, 'Самовывоз (привоз клиентом)',       'FIXED',       0.00, NULL, FALSE, NULL,    NULL,        'IN_PROGRESS', TRUE, TRUE),
  (15, 2, 'Самовывоз (отвоз клиентом)',        'FIXED',       0.00, NULL, FALSE, NULL,    NULL,        'DELIVERED',   TRUE, TRUE);

SELECT setval('skus_id_seq', 15);

-- ---------- 5. Атрибуты SKU (item_type) ----------

INSERT INTO sku_attributes (sku_id, attr_key, attr_value) VALUES
  (1,  'item_type', '1'),   -- Стирка ковролина → Ковролин
  (2,  'item_type', '2'),   -- → Синтетический
  (3,  'item_type', '3'),   -- → Шерстяной
  (4,  'item_type', '4'),   -- → Длинный ворс
  (5,  'item_type', '5'),   -- → Акрил
  (6,  'item_type', '6'),   -- → Вискоза
  (7,  'item_type', '7'),   -- → Тип не определён
  (8,  'item_type', '8'),   -- → Плед
  (9,  'item_type', '9'),   -- → Одеяло
  (10, 'item_type', '10'),  -- → Тюль
  (11, 'item_type', '11'),  -- → Штора
  (12, 'item_type', '12'),  -- Доставка
  (13, 'item_type', '12'),
  (14, 'item_type', '12'),
  (15, 'item_type', '12');

-- ---------- 6. Версии SKU (v1) ----------

INSERT INTO sku_versions (master_id, version_num, name, group_id, pricing_type, price, cost_price,
                          is_auto_add, free_threshold, attributes_snapshot, changed_by) VALUES
  (1,  1, 'Стирка ковролина',                  1, 'BY_AREA',   450.00, NULL, FALSE, NULL,    '{"item_type":["1"]}'::jsonb,  'seed'),
  (2,  1, 'Стирка синтетического ковра',       1, 'BY_AREA',   480.00, NULL, FALSE, NULL,    '{"item_type":["2"]}'::jsonb,  'seed'),
  (3,  1, 'Стирка шерстяного ковра',           1, 'BY_AREA',   480.00, NULL, FALSE, NULL,    '{"item_type":["3"]}'::jsonb,  'seed'),
  (4,  1, 'Стирка ковра с длинным ворсом',     1, 'BY_AREA',   550.00, NULL, FALSE, NULL,    '{"item_type":["4"]}'::jsonb,  'seed'),
  (5,  1, 'Стирка акрилового ковра',           1, 'BY_AREA',   550.00, NULL, FALSE, NULL,    '{"item_type":["5"]}'::jsonb,  'seed'),
  (6,  1, 'Стирка вискозного ковра',           1, 'BY_AREA',   650.00, NULL, FALSE, NULL,    '{"item_type":["6"]}'::jsonb,  'seed'),
  (7,  1, 'Стирка ковра (тип не определён)',   1, 'BY_AREA',   530.00, NULL, FALSE, NULL,    '{"item_type":["7"]}'::jsonb,  'seed'),
  (8,  1, 'Стирка пледа',                      1, 'BY_WEIGHT', 250.00, NULL, FALSE, NULL,    '{"item_type":["8"]}'::jsonb,  'seed'),
  (9,  1, 'Стирка одеяла',                     1, 'BY_WEIGHT', 250.00, NULL, FALSE, NULL,    '{"item_type":["9"]}'::jsonb,  'seed'),
  (10, 1, 'Стирка тюля',                       1, 'BY_AREA',   100.00, NULL, FALSE, NULL,    '{"item_type":["10"]}'::jsonb, 'seed'),
  (11, 1, 'Стирка шторы',                      1, 'BY_AREA',   100.00, NULL, FALSE, NULL,    '{"item_type":["11"]}'::jsonb, 'seed'),
  (12, 1, 'Доставка (забор)',                  2, 'FIXED',     300.00, NULL, TRUE,  4000.00, '{"item_type":["12"]}'::jsonb, 'seed'),
  (13, 1, 'Доставка (отвоз)',                  2, 'FIXED',     300.00, NULL, TRUE,  4000.00, '{"item_type":["12"]}'::jsonb, 'seed'),
  (14, 1, 'Самовывоз (привоз клиентом)',       2, 'FIXED',       0.00, NULL, FALSE, NULL,    '{"item_type":["12"]}'::jsonb, 'seed'),
  (15, 1, 'Самовывоз (отвоз клиентом)',        2, 'FIXED',       0.00, NULL, FALSE, NULL,    '{"item_type":["12"]}'::jsonb, 'seed');

UPDATE skus s SET current_version_id = v.id
  FROM sku_versions v
 WHERE v.master_id = s.id AND v.version_num = 1;

-- ---------- 7. Модификаторы цены ----------

INSERT INTO price_modifiers (id, name, percent) VALUES
  (1, 'Сильное загрязнение', 10.00),
  (2, 'Питомцы',              5.00),
  (3, 'Мокрый',              10.00),
  (4, 'Срочность',           10.00),
  (5, 'Пенсионер',          -10.00),
  (6, 'Постоянный клиент',   -5.00);
SELECT setval('price_modifiers_id_seq', 6);

-- ---------- 8. Роли сотрудников ----------

INSERT INTO employee_roles (id, name, description) VALUES
  (1, 'Стирщик',  'Стирка ковров, пледов, тюлей и т.п.'),
  (2, 'Водитель', 'Забор и доставка заказов клиентам');
SELECT setval('employee_roles_id_seq', 2);

-- Стирщик умеет работать со ВСЕМИ типами кроме «Доставка»
INSERT INTO employee_role_item_types (role_id, item_type_id) VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7),
  (1, 8), (1, 9), (1, 10), (1, 11);
-- Водитель — только Доставка
INSERT INTO employee_role_item_types (role_id, item_type_id) VALUES
  (2, 12);

-- ---------- 9. Сотрудники ----------
-- Поляковы — супер-админы, без PIN (только веб).
-- Операторы — без role_id (универсалы), PIN из Excel.
-- Стирщики/Водитель — role_id, PIN.
-- Подрядчики (Возрождение, Прачечная) — role_id Стирщик, без PIN/контакта.

INSERT INTO employees (id, name, contact, active, role_id, pin) VALUES
  (1, 'Поляков Никита',      NULL, TRUE, NULL, NULL),
  (2, 'Поляков Дмитрий',     NULL, TRUE, NULL, NULL),
  (3, 'Федулова Марина',     NULL, TRUE, NULL, '1565'),
  (4, 'Когтева Елизавета',   NULL, TRUE, NULL, '4652'),
  (5, 'Каненов Мухаммет',    NULL, TRUE, 1,    '9894'),
  (6, 'Тихомандров Даниил',  NULL, TRUE, 1,    '8498'),
  (7, 'Холиев Асрор',        NULL, TRUE, 2,    '3218'),
  (8, 'ООО "Возрождение"',   NULL, TRUE, 1,    NULL),
  (9, 'Прачечная (Виктория)',NULL, TRUE, 1,    NULL);
SELECT setval('employees_id_seq', 9);

-- ---------- 10. Веб-пользователи ----------
-- Пароли в Excel открытым текстом → захэшированы BCrypt cost 10.
-- foxy/foxy — отдельный супер-админ для бэкапного входа (без employee).
-- Поляковы — SUPERVISOR. Операторы — OPERATOR.
-- Стирщики и Водитель — без user (входят только через мобилку с PIN).

INSERT INTO users (username, password_hash, display_name, role, employee_id, is_active) VALUES
  ('foxy',           '$2b$10$mKaJjcmYKQaf8lw967NcWul5RQ5S0Y41pmfpDyvvFEd20/MTCGM.m', 'Администратор (foxy)',  'SUPERVISOR', NULL, TRUE),
  ('pnkotsobaka31',  '$2b$10$ln67AV4B2qyogrT4rAu.Vu1ZINECjB3Uf9myqKy7eZvY8Du4q67fO', 'Поляков Никита',         'SUPERVISOR', 1,    TRUE),
  ('pdkotsobaka84',  '$2b$10$UxdNchbyMZy6CiWvikGUseoPgouI4aSqSIOdjgF7fUii8w5mASEwC', 'Поляков Дмитрий',        'SUPERVISOR', 2,    TRUE),
  ('fmkotsobaka51',  '$2b$10$4FRjcwvXFKeHs4b8Px2fMuH28BP/x.do3nCuas2apynvzl0ZY9aFW', 'Федулова Марина',        'OPERATOR',   3,    TRUE),
  ('kekotsobaka28',  '$2b$10$4ZIA4.iQ3BEpr8Kdi2Pcv.Mk1gD1FSvk95C0C5fazzmD4GWtyCvsy', 'Когтева Елизавета',      'OPERATOR',   4,    TRUE);

COMMIT;
