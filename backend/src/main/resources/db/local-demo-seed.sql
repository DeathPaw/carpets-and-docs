-- ============================================================================
-- DEMO SEED for local development. НЕ ДЛЯ ПРОДА.
--
-- Запуск:
--   psql -U glebramazanov -d carpet_db -f backend/src/main/resources/db/local-demo-seed.sql
--
-- Что делает:
--  1. Чистит transactional-таблицы (orders, items, services, clients, users,
--     employees, notifications, audit, history). Каталог (item_types, skus,
--     sku_groups, sku_attributes, employee_roles, price_modifiers, districts)
--     сохраняется из V12.
--  2. Заливает 10 сотрудников, 3 веб-пользователя (foxy/foxy, admin/super,
--     operator/user), 15 клиентов, 28 заказов разных статусов и месяцев,
--     назначенные услуги, уведомления, аудит — чтобы аналитика, логистика
--     и красивые виджеты были не пустыми.
-- ============================================================================

BEGIN;

-- Отключаем триггеры base_amount/total_amount и автостатус-пересчёт на время сидинга,
-- чтобы ручные значения price/status не были перезаписаны при INSERT'ах.
SET session_replication_role = replica;

-- ---------- 1. Чистим transactional-таблицы ----------
TRUNCATE TABLE notifications RESTART IDENTITY CASCADE;
TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE error_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE order_status_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE client_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE order_modifiers RESTART IDENTITY CASCADE;
TRUNCATE TABLE service_assignees RESTART IDENTITY CASCADE;
TRUNCATE TABLE order_item_services RESTART IDENTITY CASCADE;
TRUNCATE TABLE order_items RESTART IDENTITY CASCADE;
TRUNCATE TABLE orders RESTART IDENTITY CASCADE;
TRUNCATE TABLE client_modifiers RESTART IDENTITY CASCADE;
TRUNCATE TABLE clients RESTART IDENTITY CASCADE;
DELETE FROM users;
ALTER SEQUENCE users_id_seq RESTART WITH 1;
DELETE FROM employees;
ALTER SEQUENCE employees_id_seq RESTART WITH 1;

-- ---------- 2. Сотрудники ----------
-- ID 1-2 — администрация (для логина с employee_id).
-- ID 3-5 — стирщики (role_id=1).
-- ID 6-7 — водители (role_id=2).
-- ID 8 — универсал без роли.
-- ID 9-10 — подрядчики (юр.лица).
-- ⚡ ДЕМО-PIN'ы для запоминания:
--   Иванов Сергей  (Стирщик) → PIN 1234
--   Кузнецов Дмитрий (Водитель) → PIN 5678
-- V15: контакты разнесены на phone/email.
INSERT INTO employees (id, name, phone, email, active, role_id, pin) VALUES
  (1,  'Поляков Никита',        '+7 (911) 100-10-10', NULL,                  TRUE, NULL, NULL),
  (2,  'Поляков Дмитрий',       '+7 (911) 100-10-11', NULL,                  TRUE, NULL, NULL),
  (3,  'Иванов Сергей',         '+7 (921) 222-33-44', NULL,                  TRUE, 1,    '1234'),
  (4,  'Петров Алексей',        '+7 (921) 222-33-45', NULL,                  TRUE, 1,    '2222'),
  (5,  'Сидоров Михаил',        '+7 (921) 222-33-46', NULL,                  TRUE, 1,    '3333'),
  (6,  'Кузнецов Дмитрий',      '+7 (931) 444-55-66', NULL,                  TRUE, 2,    '5678'),
  (7,  'Морозов Олег',          '+7 (931) 444-55-67', NULL,                  TRUE, 2,    '5555'),
  (8,  'Васильев Антон',        '+7 (905) 777-88-99', 'vasilyev@example.ru', TRUE, NULL, '6666'),
  (9,  'ООО "Возрождение"',     NULL,                  'manager@vozr.ru',    TRUE, 1,    NULL),
  (10, 'Прачечная (Виктория)',  '+7 (812) 555-44-33', 'admin@laundry-v.ru',  TRUE, 1,    NULL);
SELECT setval('employees_id_seq', 10);

-- ---------- 3. Веб-пользователи ----------
-- BCrypt cost 10. Пароли:
--   foxy     / foxy   — SUPERVISOR (полный доступ, без привязки к employee)
--   admin    / super  — ADMIN (управление пользователями/SKU)
--   operator / user   — OPERATOR (обычный оператор-приёмщик)
-- Плюс рабочие учётки для Поляковых (заходить из аналитики «своими» глазами).
INSERT INTO users (username, password_hash, display_name, role, employee_id, is_active) VALUES
  ('foxy',     '$2b$10$ZacUBGv.2FKv5o8f3FTc4OrUV1l0zWwRJ7f0jQiOd7u1CTw73XEBq', 'Foxy (демо-админ)', 'SUPERVISOR', NULL, TRUE),
  ('admin',    '$2b$10$3GevrfxPfZ660uYdcbQM..O4lQhGlJdMwJ/EwP1UwAbXT8JvFPX7S', 'Администратор',     'ADMIN',      NULL, TRUE),
  ('operator', '$2b$10$EkhoeCjUppvvdkQ.KcrpFuEV.WI6JU0fSKa4tQRXopE7kt.adVqQK', 'Оператор приёма',   'OPERATOR',   2,    TRUE),
  ('nikita',   '$2b$10$ZacUBGv.2FKv5o8f3FTc4OrUV1l0zWwRJ7f0jQiOd7u1CTw73XEBq', 'Поляков Никита',    'SUPERVISOR', 1,    TRUE),
  -- Web-учётки для двух демо-работников. Им нужны user-записи, чтобы
  -- получать персональные уведомления SERVICE_ASSIGNED. Параллельно работают
  -- через мобильник по PIN (employees.pin).
  ('ivanov',   '$2b$10$ysZH4tpMHWEv20NdIiBLie8HJdwgpvb3CM2A7Z7zKzTj.pkUY/xaC', 'Иванов Сергей (стирщик)',    'OPERATOR', 3, TRUE),
  ('kuznetsov','$2b$10$9/PDQ6FA3BwMADGV9hw.6eDOLG6LwB9V9T6oQpV8E.r0MK61a4FaG', 'Кузнецов Дмитрий (водитель)','OPERATOR', 6, TRUE);

-- ---------- 4. Клиенты (15 шт, разные районы СПб, разные тэги) ----------
INSERT INTO clients (id, client_type, name, first_name, last_name, phone, email,
                     address, district, lat, lon,
                     is_pensioner, is_problem, is_regular, comment) VALUES
  (1,  'INDIVIDUAL', 'Смирнова Елена Сергеевна',   'Елена',   'Смирнова',   '+7 (911) 111-11-01', 'smirnova@mail.ru',
       'Невский пр., 100, кв. 25',         'Центральный',       59.9311, 30.3609, FALSE, FALSE, TRUE,  'Постоянный клиент, всегда оплачивает картой'),
  (2,  'INDIVIDUAL', 'Кузнецова Татьяна Ивановна', 'Татьяна', 'Кузнецова',  '+7 (911) 111-11-02', NULL,
       'Большой пр. В.О., 45, кв. 12',     'Василеостровский',  59.9436, 30.2533, TRUE,  FALSE, FALSE, 'Пенсионерка, скидка'),
  (3,  'INDIVIDUAL', 'Михайлов Андрей Петрович',   'Андрей',  'Михайлов',   '+7 (911) 111-11-03', 'mikhailov@gmail.com',
       'Каменноостровский пр., 30, кв. 5', 'Петроградский',     59.9614, 30.3142, FALSE, FALSE, FALSE, NULL),
  (4,  'INDIVIDUAL', 'Захарова Ольга Викторовна',  'Ольга',   'Захарова',   '+7 (911) 111-11-04', NULL,
       'пр. Просвещения, 10, кв. 88',      'Выборгский',        60.0397, 30.3358, FALSE, FALSE, TRUE,  'Постоянный клиент с 2022'),
  (5,  'INDIVIDUAL', 'Новиков Илья Дмитриевич',    'Илья',    'Новиков',    '+7 (911) 111-11-05', 'novikov@yandex.ru',
       'ул. Бабушкина, 22, кв. 41',        'Невский',           59.9189, 30.4753, FALSE, TRUE,  FALSE, 'Проблемный — жалуется на сроки'),
  (6,  'INDIVIDUAL', 'Соколова Мария Александровна','Мария',  'Соколова',   '+7 (911) 111-11-06', NULL,
       'пр. Ветеранов, 90, кв. 17',        'Кировский',         59.8786, 30.2670, TRUE,  FALSE, FALSE, NULL),
  (7,  'INDIVIDUAL', 'Лебедев Виктор Николаевич',  'Виктор',  'Лебедев',    '+7 (911) 111-11-07', 'lebedev@mail.ru',
       'Московский пр., 220, кв. 30',      'Московский',        59.8636, 30.3186, FALSE, FALSE, FALSE, NULL),
  (8,  'INDIVIDUAL', 'Орлова Наталья Юрьевна',     'Наталья', 'Орлова',     '+7 (911) 111-11-08', NULL,
       'ул. Савушкина, 12, кв. 4',         'Приморский',        60.0033, 30.2978, FALSE, FALSE, TRUE,  'Любит ковры с длинным ворсом'),
  (9,  'INDIVIDUAL', 'Зайцев Павел Сергеевич',     'Павел',   'Зайцев',     '+7 (911) 111-11-09', 'zaitsev@gmail.com',
       'Богатырский пр., 55, кв. 200',     'Приморский',        60.0102, 30.2522, FALSE, FALSE, FALSE, NULL),
  (10, 'INDIVIDUAL', 'Волкова Анна Олеговна',      'Анна',    'Волкова',    '+7 (911) 111-11-10', NULL,
       'Гражданский пр., 100, кв. 56',     'Калининский',       60.0167, 30.4000, FALSE, FALSE, FALSE, NULL),
  (11, 'INDIVIDUAL', 'Григорьев Максим Андреевич', 'Максим',  'Григорьев',  '+7 (911) 111-11-11', 'grigoriev@yandex.ru',
       'ул. Будапештская, 14, кв. 78',     'Фрунзенский',       59.8736, 30.3733, FALSE, FALSE, FALSE, NULL),
  (12, 'INDIVIDUAL', 'Романова Ирина Михайловна',  'Ирина',   'Романова',   '+7 (911) 111-11-12', NULL,
       'пр. Энгельса, 130, кв. 6',         'Выборгский',        60.0397, 30.3358, TRUE,  FALSE, TRUE,  'Регулярный клиент, пенсионерка'),
  (13, 'LEGAL_ENTITY','ООО "Уют"',                 NULL,      NULL,         '+7 (812) 333-44-55', 'office@uyut.spb.ru',
       'Лиговский пр., 50, БЦ "Северный"', 'Центральный',       59.9197, 30.3548, FALSE, FALSE, TRUE,  'Юр. лицо — стирка ковров в офис ежемесячно'),
  (14, 'INDIVIDUAL', 'Дмитриев Сергей Олегович',   'Сергей',  'Дмитриев',   '+7 (911) 111-11-14', NULL,
       'ул. Седова, 78, кв. 33',           'Невский',           59.8786, 30.4225, FALSE, FALSE, FALSE, NULL),
  (15, 'INDIVIDUAL', 'Степанова Юлия Викторовна',  'Юлия',    'Степанова',  '+7 (911) 111-11-15', 'stepanova@mail.ru',
       'Стачек пр., 84, кв. 12',           'Кировский',         59.8517, 30.2622, FALSE, FALSE, FALSE, NULL);
SELECT setval('clients_id_seq', 15);

-- ИНН + контактное лицо для юр. лица
UPDATE clients SET inn = '7813123456', contact_person = 'Никитина Е.А.',
                   contact_person_phone = '+7 (812) 333-44-56' WHERE id = 13;

-- Привязки модификаторов к клиентам (пенсионеры, постоянные)
INSERT INTO client_modifiers (client_id, modifier_id) VALUES
  (2, 5),  -- Кузнецова → Пенсионер
  (6, 5),  -- Соколова → Пенсионер
  (12,5),  -- Романова → Пенсионер
  (1, 6),  -- Смирнова → Постоянный
  (4, 6),  -- Захарова → Постоянный
  (8, 6),  -- Орлова → Постоянный
  (12,6),  -- Романова → Постоянный + Пенсионер
  (13,6);  -- ООО Уют → Постоянный

-- ---------- 5. Заказы ----------
-- Раскидываем по 6 месяцам для аналитики «Выручка по месяцам».
-- Текущая дата по дефолту = 2026-05-25 (из CLAUDE.md). Берём NOW() для гибкости.
-- Используем макросы в комментариях для читаемости; реальные даты NOW() - N days.

-- Helper: вставляем 28 заказов одним блоком, потом отдельно ставим даты/статусы/доставки.
-- Каждый заказ имеет client_name (denorm snapshot) и client_id.

-- === Свежие LEAD'ы (только что позвонили, не сформированы) ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    pickup_date, pickup_time_slot, comment, created_at) VALUES
  (1, 3,  'Михайлов Андрей Петрович',   'LEAD', 0, 0,
       'Каменноостровский пр., 30, кв. 5',  'Петроградский',    59.9614, 30.3142,
       (CURRENT_DATE + INTERVAL '2 days')::date, '10:00-13:00',
       'Звонил, ковёр 3×2, шерсть. Перезвонить.', NOW() - INTERVAL '2 hours'),
  (2, 9,  'Зайцев Павел Сергеевич',     'LEAD', 0, 0,
       'Богатырский пр., 55, кв. 200',      'Приморский',       60.0102, 30.2522,
       (CURRENT_DATE + INTERVAL '3 days')::date, '14:00-18:00',
       'Спросил цену по тюлям 2 шт.', NOW() - INTERVAL '5 hours'),
  (3, 14, 'Дмитриев Сергей Олегович',   'LEAD', 0, 0,
       'ул. Седова, 78, кв. 33',            'Невский',          59.8786, 30.4225,
       NULL, NULL,
       'Уточняет, можно ли акрил с длинным ворсом', NOW() - INTERVAL '20 minutes');

-- === Только что сформированы (CREATED) — ждут водителя ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, delivery_date, delivery_time_slot,
                    created_at) VALUES
  (4, 1,  'Смирнова Елена Сергеевна',   'CREATED', 3000, 3000,
       'Невский пр., 100, кв. 25',          'Центральный',       59.9311, 30.3609,
       'Невский пр., 100, кв. 25',          'Центральный',       59.9311, 30.3609,
       (CURRENT_DATE + INTERVAL '1 day')::date, '10:00-13:00',
       (CURRENT_DATE + INTERVAL '8 days')::date, '14:00-18:00',
       NOW() - INTERVAL '3 hours'),
  (5, 4,  'Захарова Ольга Викторовна',  'CREATED', 2400, 2400,
       'пр. Просвещения, 10, кв. 88',       'Выборгский',        60.0397, 30.3358,
       'пр. Просвещения, 10, кв. 88',       'Выборгский',        60.0397, 30.3358,
       (CURRENT_DATE + INTERVAL '1 day')::date, '14:00-18:00',
       (CURRENT_DATE + INTERVAL '9 days')::date, '10:00-13:00',
       NOW() - INTERVAL '1 day'),
  (6, 7,  'Лебедев Виктор Николаевич',  'CREATED', 4800, 4800,
       'Московский пр., 220, кв. 30',       'Московский',        59.8636, 30.3186,
       'Московский пр., 220, кв. 30',       'Московский',        59.8636, 30.3186,
       (CURRENT_DATE + INTERVAL '2 days')::date, '10:00-13:00',
       (CURRENT_DATE + INTERVAL '10 days')::date, '14:00-18:00',
       NOW() - INTERVAL '6 hours'),
  (7, 11, 'Григорьев Максим Андреевич', 'CREATED', 5500, 5500,
       'ул. Будапештская, 14, кв. 78',      'Фрунзенский',       59.8736, 30.3733,
       'ул. Будапештская, 14, кв. 78',      'Фрунзенский',       59.8736, 30.3733,
       (CURRENT_DATE + INTERVAL '2 days')::date, '14:00-18:00',
       (CURRENT_DATE + INTERVAL '12 days')::date, '10:00-13:00',
       NOW() - INTERVAL '2 days'),
  (8, 15, 'Степанова Юлия Викторовна',  'CREATED', 1200, 1200,
       'Стачек пр., 84, кв. 12',            'Кировский',         59.8517, 30.2622,
       'Стачек пр., 84, кв. 12',            'Кировский',         59.8517, 30.2622,
       (CURRENT_DATE + INTERVAL '3 days')::date, '10:00-13:00',
       (CURRENT_DATE + INTERVAL '11 days')::date, '14:00-18:00',
       NOW() - INTERVAL '4 hours');

-- === Назначены водителю, в работе по логистике (FOR_PICKUP / IN_PROGRESS) ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, delivery_date, delivery_time_slot,
                    assigned_driver_id, created_at) VALUES
  (9, 8,  'Орлова Наталья Юрьевна',     'FOR_PICKUP', 4000, 4000,
       'ул. Савушкина, 12, кв. 4',          'Приморский',        60.0033, 30.2978,
       'ул. Савушкина, 12, кв. 4',          'Приморский',        60.0033, 30.2978,
       CURRENT_DATE, '10:00-13:00',
       (CURRENT_DATE + INTERVAL '7 days')::date, '14:00-18:00',
       6, NOW() - INTERVAL '2 days'),
  (10, 10, 'Волкова Анна Олеговна',     'FOR_PICKUP', 2800, 2800,
       'Гражданский пр., 100, кв. 56',      'Калининский',       60.0167, 30.4000,
       'Гражданский пр., 100, кв. 56',      'Калининский',       60.0167, 30.4000,
       CURRENT_DATE, '14:00-18:00',
       (CURRENT_DATE + INTERVAL '8 days')::date, '10:00-13:00',
       6, NOW() - INTERVAL '3 days'),
  (11, 12, 'Романова Ирина Михайловна', 'FOR_PICKUP', 3200, 3040,  -- -5% постоянный
       'пр. Энгельса, 130, кв. 6',          'Выборгский',        60.0397, 30.3358,
       'пр. Энгельса, 130, кв. 6',          'Выборгский',        60.0397, 30.3358,
       (CURRENT_DATE + INTERVAL '1 day')::date, '10:00-13:00',
       (CURRENT_DATE + INTERVAL '9 days')::date, '14:00-18:00',
       7, NOW() - INTERVAL '1 day'),
  (12, 6,  'Соколова Мария Александровна', 'IN_PROGRESS', 1800, 1620,  -- -10% пенсионер
       'пр. Ветеранов, 90, кв. 17',         'Кировский',         59.8786, 30.2670,
       'пр. Ветеранов, 90, кв. 17',         'Кировский',         59.8786, 30.2670,
       CURRENT_DATE - INTERVAL '1 day', '10:00-13:00',
       (CURRENT_DATE + INTERVAL '6 days')::date, '14:00-18:00',
       6, NOW() - INTERVAL '4 days'),
  (13, 2,  'Кузнецова Татьяна Ивановна', 'IN_PROGRESS', 2400, 2160,  -- -10% пенсионер
       'Большой пр. В.О., 45, кв. 12',      'Василеостровский',  59.9436, 30.2533,
       'Большой пр. В.О., 45, кв. 12',      'Василеостровский',  59.9436, 30.2533,
       CURRENT_DATE - INTERVAL '2 days', '14:00-18:00',
       (CURRENT_DATE + INTERVAL '5 days')::date, '10:00-13:00',
       7, NOW() - INTERVAL '5 days'),
  (14, 13, 'ООО "Уют"',                 'IN_PROGRESS', 12000, 11400, -- -5% постоянный
       'Лиговский пр., 50, БЦ "Северный"',  'Центральный',       59.9197, 30.3548,
       'Лиговский пр., 50, БЦ "Северный"',  'Центральный',       59.9197, 30.3548,
       CURRENT_DATE - INTERVAL '3 days', '10:00-13:00',
       (CURRENT_DATE + INTERVAL '4 days')::date, '14:00-18:00',
       6, NOW() - INTERVAL '7 days');

-- === PARTIALLY_DONE — часть позиций готова ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, delivery_date, delivery_time_slot,
                    actual_pickup_date, actual_pickup_time_slot,
                    assigned_driver_id, created_at) VALUES
  (15, 1,  'Смирнова Елена Сергеевна',  'PARTIALLY_DONE', 5400, 5130, -- -5% постоянный
       'Невский пр., 100, кв. 25',          'Центральный',       59.9311, 30.3609,
       'Невский пр., 100, кв. 25',          'Центральный',       59.9311, 30.3609,
       CURRENT_DATE - INTERVAL '5 days',  '10:00-13:00',
       (CURRENT_DATE + INTERVAL '3 days')::date, '14:00-18:00',
       CURRENT_DATE - INTERVAL '5 days', '10:00-13:00',
       6, NOW() - INTERVAL '8 days'),
  (16, 5,  'Новиков Илья Дмитриевич',   'PARTIALLY_DONE', 3600, 3960, -- +10% сильное загрязнение
       'ул. Бабушкина, 22, кв. 41',         'Невский',           59.9189, 30.4753,
       'ул. Бабушкина, 22, кв. 41',         'Невский',           59.9189, 30.4753,
       CURRENT_DATE - INTERVAL '6 days',  '14:00-18:00',
       (CURRENT_DATE + INTERVAL '2 days')::date, '10:00-13:00',
       CURRENT_DATE - INTERVAL '6 days', '14:00-18:00',
       7, NOW() - INTERVAL '9 days');

-- === DONE — готовы, ждут отвоза ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    pickup_date, pickup_time_slot, delivery_date, delivery_time_slot,
                    actual_pickup_date, actual_pickup_time_slot,
                    assigned_driver_id, created_at) VALUES
  (17, 4,  'Захарова Ольга Викторовна', 'DONE', 4200, 3990, -- -5% постоянный
       'пр. Просвещения, 10, кв. 88',       'Выборгский',        60.0397, 30.3358,
       'пр. Просвещения, 10, кв. 88',       'Выборгский',        60.0397, 30.3358,
       CURRENT_DATE - INTERVAL '8 days',  '10:00-13:00',
       CURRENT_DATE,                            '10:00-13:00',
       CURRENT_DATE - INTERVAL '8 days', '10:00-13:00',
       6, NOW() - INTERVAL '10 days'),
  (18, 7,  'Лебедев Виктор Николаевич', 'DONE', 2880, 2880,
       'Московский пр., 220, кв. 30',       'Московский',        59.8636, 30.3186,
       'Московский пр., 220, кв. 30',       'Московский',        59.8636, 30.3186,
       CURRENT_DATE - INTERVAL '9 days',  '14:00-18:00',
       CURRENT_DATE,                            '14:00-18:00',
       CURRENT_DATE - INTERVAL '9 days', '14:00-18:00',
       7, NOW() - INTERVAL '11 days'),
  (19, 8,  'Орлова Наталья Юрьевна',    'DONE', 6000, 5700, -- -5% постоянный
       'ул. Савушкина, 12, кв. 4',          'Приморский',        60.0033, 30.2978,
       'ул. Савушкина, 12, кв. 4',          'Приморский',        60.0033, 30.2978,
       CURRENT_DATE - INTERVAL '10 days', '10:00-13:00',
       (CURRENT_DATE + INTERVAL '1 day')::date, '14:00-18:00',
       CURRENT_DATE - INTERVAL '10 days','10:00-13:00',
       6, NOW() - INTERVAL '12 days');

-- === DELIVERED — закрытые заказы за последние 6 месяцев (для аналитики) ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    pickup_date, delivery_date,
                    actual_pickup_date, actual_delivery_date,
                    paid, payment_type, payment_date,
                    assigned_driver_id, created_at) VALUES
  -- Прошлый месяц
  (20, 1, 'Смирнова Елена Сергеевна',  'DELIVERED', 3000, 2850,
       'Невский пр., 100, кв. 25', 'Центральный', 59.9311, 30.3609,
       'Невский пр., 100, кв. 25', 'Центральный', 59.9311, 30.3609,
       (NOW() - INTERVAL '25 days')::date, (NOW() - INTERVAL '15 days')::date,
       (NOW() - INTERVAL '25 days')::date, (NOW() - INTERVAL '15 days')::date,
       TRUE, 'CARD', NOW() - INTERVAL '15 days',
       6, NOW() - INTERVAL '28 days'),
  (21, 2, 'Кузнецова Татьяна Ивановна', 'DELIVERED', 1800, 1620,
       'Большой пр. В.О., 45, кв. 12', 'Василеостровский', 59.9436, 30.2533,
       'Большой пр. В.О., 45, кв. 12', 'Василеостровский', 59.9436, 30.2533,
       (NOW() - INTERVAL '20 days')::date, (NOW() - INTERVAL '10 days')::date,
       (NOW() - INTERVAL '20 days')::date, (NOW() - INTERVAL '10 days')::date,
       TRUE, 'CASH', NOW() - INTERVAL '10 days',
       7, NOW() - INTERVAL '22 days'),
  -- 2 месяца назад
  (22, 4, 'Захарова Ольга Викторовна', 'DELIVERED', 5400, 5130,
       'пр. Просвещения, 10, кв. 88', 'Выборгский', 60.0397, 30.3358,
       'пр. Просвещения, 10, кв. 88', 'Выборгский', 60.0397, 30.3358,
       (NOW() - INTERVAL '55 days')::date, (NOW() - INTERVAL '48 days')::date,
       (NOW() - INTERVAL '55 days')::date, (NOW() - INTERVAL '48 days')::date,
       TRUE, 'TRANSFER', NOW() - INTERVAL '48 days',
       6, NOW() - INTERVAL '58 days'),
  (23, 13,'ООО "Уют"',                 'DELIVERED', 18000, 17100,
       'Лиговский пр., 50, БЦ "Северный"', 'Центральный', 59.9197, 30.3548,
       'Лиговский пр., 50, БЦ "Северный"', 'Центральный', 59.9197, 30.3548,
       (NOW() - INTERVAL '50 days')::date, (NOW() - INTERVAL '42 days')::date,
       (NOW() - INTERVAL '50 days')::date, (NOW() - INTERVAL '42 days')::date,
       TRUE, 'TRANSFER', NOW() - INTERVAL '42 days',
       7, NOW() - INTERVAL '52 days'),
  -- 3 месяца назад
  (24, 8, 'Орлова Наталья Юрьевна',    'DELIVERED', 7200, 6840,
       'ул. Савушкина, 12, кв. 4', 'Приморский', 60.0033, 30.2978,
       'ул. Савушкина, 12, кв. 4', 'Приморский', 60.0033, 30.2978,
       (NOW() - INTERVAL '85 days')::date, (NOW() - INTERVAL '78 days')::date,
       (NOW() - INTERVAL '85 days')::date, (NOW() - INTERVAL '78 days')::date,
       TRUE, 'CARD', NOW() - INTERVAL '78 days',
       6, NOW() - INTERVAL '88 days'),
  -- 4 месяца назад
  (25, 3, 'Михайлов Андрей Петрович',  'DELIVERED', 2400, 2400,
       'Каменноостровский пр., 30, кв. 5', 'Петроградский', 59.9614, 30.3142,
       'Каменноостровский пр., 30, кв. 5', 'Петроградский', 59.9614, 30.3142,
       (NOW() - INTERVAL '115 days')::date, (NOW() - INTERVAL '108 days')::date,
       (NOW() - INTERVAL '115 days')::date, (NOW() - INTERVAL '108 days')::date,
       TRUE, 'CARD', NOW() - INTERVAL '108 days',
       7, NOW() - INTERVAL '118 days'),
  -- 5 месяцев назад
  (26, 11,'Григорьев Максим Андреевич','DELIVERED', 3600, 3600,
       'ул. Будапештская, 14, кв. 78', 'Фрунзенский', 59.8736, 30.3733,
       'ул. Будапештская, 14, кв. 78', 'Фрунзенский', 59.8736, 30.3733,
       (NOW() - INTERVAL '145 days')::date, (NOW() - INTERVAL '138 days')::date,
       (NOW() - INTERVAL '145 days')::date, (NOW() - INTERVAL '138 days')::date,
       TRUE, 'CASH', NOW() - INTERVAL '138 days',
       6, NOW() - INTERVAL '148 days');

-- === CANCELLED ===
INSERT INTO orders (id, client_id, client_name, status, base_amount, total_amount,
                    pickup_address, pickup_district, cancellation_reason,
                    pickup_date, pickup_time_slot, created_at) VALUES
  (27, 5, 'Новиков Илья Дмитриевич', 'CANCELLED', 1200, 1200,
       'ул. Бабушкина, 22, кв. 41', 'Невский',
       'Клиент передумал — нашёл химчистку ближе к дому. Договорились на следующий раз.',
       (NOW() - INTERVAL '7 days')::date, '10:00-13:00',
       NOW() - INTERVAL '8 days'),
  (28, 14,'Дмитриев Сергей Олегович',  'CANCELLED', 0, 0,
       'ул. Седова, 78, кв. 33', 'Невский',
       'Уехал в командировку, перенесёт сам, когда вернётся.',
       NULL, NULL, NOW() - INTERVAL '12 days');

SELECT setval('orders_id_seq', 28);

-- V17: закрепляем оформителя заказов на оператора (employee_id=2, Поляков Дмитрий = user "operator").
-- Это сделает уведомления о смене статуса этих заказов адресными — прилетят только ему.
UPDATE orders SET assigned_operator_id = 2 WHERE id IN (4, 5, 9, 12, 13, 14, 15, 16, 17, 20, 21);
-- Заказы Никиты (foxy/nikita) — закрепляем за Поляковым Никитой (id=1).
UPDATE orders SET assigned_operator_id = 1 WHERE id IN (6, 7, 8, 10, 11, 18, 19, 22, 23, 24, 25, 26);

-- V17: пара проблемных заказов — для демонстрации алерта админам.
UPDATE orders SET is_problem = TRUE,
                  problem_reason = 'Клиент жалуется на запах после стирки, нужно перестирывать за наш счёт'
              WHERE id = 16;  -- Новиков PARTIALLY_DONE
UPDATE orders SET is_problem = TRUE,
                  problem_reason = 'Возможна потеря пледа — не нашли при пересчёте, проверяем камеры'
              WHERE id = 15;  -- Смирнова PARTIALLY_DONE

-- V19: гарантийные заказы — для виджета «Гарантийная статистика» (клик → список).
INSERT INTO orders (client_id, client_name, status, base_amount, total_amount,
                    is_warranty, parent_order_id, comment,
                    pickup_address, pickup_district, pickup_lat, pickup_lon,
                    delivery_address, delivery_district, delivery_lat, delivery_lon,
                    created_at, assigned_operator_id)
SELECT client_id, client_name, 'CREATED', 0, 0,
       TRUE, id,
       CASE id
         WHEN 20 THEN 'Гарантийный возврат: запах после стирки, перестираем за счёт компании'
         WHEN 21 THEN 'Гарантийный возврат: пятно не отошло, повторная обработка'
       END,
       pickup_address, pickup_district, pickup_lat, pickup_lon,
       delivery_address, delivery_district, delivery_lat, delivery_lon,
       NOW() - INTERVAL '5 days', 2
FROM orders WHERE id IN (20, 21);

-- ---------- 6. Позиции заказов (order_items) + услуги ----------
-- LEAD'ы (1-3) — без позиций (только заявка).

-- Заказ 4: Смирнова — ковер шерсть 2.5×1.5
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (1, 4, 3, 'Ковёр шерстяной, бежевый, гостиная', 'CREATED', 2700, 2.5, 1.5, 3.75),
  (2, 4, 12, 'Доставка', 'CREATED', 300, NULL, NULL, NULL);
-- услуги
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (1, 1, 3, 3, 'CREATED', 1800, FALSE),  -- стирка шерсть 480 × 3.75 = 1800
  (2, 1, 8, 8, 'CREATED', 900,  TRUE),   -- доп. услуга: ручная цена (пример)
  (3, 2, 12, 12, 'CREATED', 300, FALSE), -- забор
  (4, 2, 13, 13, 'CREATED', 300, FALSE); -- отвоз

-- Заказ 5: Захарова — синтетика 3×2 (площадь 6 м²)
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (3, 5, 2, 'Синтетический ковёр 3×2, спальня', 'CREATED', 2880, 3, 2, 6),
  (4, 5, 12, 'Доставка', 'CREATED', 0, NULL, NULL, NULL);  -- free_threshold
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (5, 3, 2, 2, 'CREATED', 2880, FALSE),    -- 480 × 6
  (6, 4, 12, 12, 'CREATED', 0, FALSE),
  (7, 4, 13, 13, 'CREATED', 0, FALSE);

-- Заказ 6: Лебедев — 2 ковра + длинный ворс
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (5, 6, 4, 'Ковёр с длинным ворсом 2×3', 'CREATED', 3300, 2, 3, 6),
  (6, 6, 2, 'Синтетика 1.5×2', 'CREATED', 1440, 1.5, 2, 3),
  (7, 6, 12, 'Доставка', 'CREATED', 0, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (8,  5, 4, 4, 'CREATED', 3300, FALSE), -- 550 × 6
  (9,  6, 2, 2, 'CREATED', 1440, FALSE), -- 480 × 3
  (10, 7, 12, 12, 'CREATED', 0, FALSE),
  (11, 7, 13, 13, 'CREATED', 0, FALSE);

-- Заказ 7: Григорьев — 3 позиции
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (8,  7, 3, 'Шерстяной 2.5×1.8',  'CREATED', 2160, 2.5, 1.8, 4.5),
  (9,  7, 5, 'Акрил 2×1.5',         'CREATED', 1650, 2, 1.5, 3),
  (10, 7, 6, 'Вискоза 1.5×1',       'CREATED', 975, 1.5, 1, 1.5),
  (11, 7, 12,'Доставка',            'CREATED', 0, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (12, 8,  3, 3, 'CREATED', 2160, FALSE),
  (13, 9,  5, 5, 'CREATED', 1650, FALSE),
  (14, 10, 6, 6, 'CREATED', 975,  FALSE),
  (15, 11, 12,12,'CREATED', 0, FALSE),
  (16, 11, 13,13,'CREATED', 0, FALSE);

-- Заказ 8: Степанова — тюль 4 м²
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (12, 8, 10, 'Тюль кухонный 2×2', 'CREATED', 400, 2, 2, 4),
  (13, 8, 11, 'Шторы зал, длинные 4 м²', 'CREATED', 400, NULL, NULL, 4),
  (14, 8, 12, 'Доставка', 'CREATED', 400, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (17, 12, 10, 10,'CREATED', 400, FALSE),
  (18, 13, 11, 11,'CREATED', 400, FALSE),
  (19, 14, 12, 12,'CREATED', 200, FALSE),
  (20, 14, 13, 13,'CREATED', 200, FALSE);

-- Заказ 9: Орлова FOR_PICKUP — водитель Кузнецов взял
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (15, 9, 4, 'Ковёр с длинным ворсом 2.5×1.5', 'CREATED', 2062.50, 2.5, 1.5, 3.75),
  (16, 9, 8, 'Плед шерсть 4 кг', 'CREATED', 1500, NULL, NULL, NULL),
  (17, 9, 12,'Доставка', 'CREATED', 300, NULL, NULL, NULL);
UPDATE order_items SET weight = 4 WHERE id = 16;
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (21, 15, 4, 4, 'CREATED', 2062.50, FALSE), -- 550 × 3.75
  (22, 16, 8, 8, 'CREATED', 1000, FALSE),    -- 250 × 4 = 1000... плюс ручная корректировка
  (23, 16, 8, 8, 'CREATED', 500,  TRUE),     -- доп ручная позиция 500р (демо)
  (24, 17, 12,12,'CREATED', 150, FALSE),
  (25, 17, 13,13,'CREATED', 150, FALSE);

-- Заказ 10: Волкова FOR_PICKUP
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (18, 10, 1, 'Ковролин 4×3', 'CREATED', 2400, 4, 3, 12),
  (19, 10, 12,'Доставка', 'CREATED', 400, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (26, 18, 1, 1, 'CREATED', 5400, FALSE), -- 450 × 12 — но цену задаём вручную (стирщик договорился)
  (27, 19, 12,12,'CREATED', 200, FALSE),
  (28, 19, 13,13,'CREATED', 200, FALSE);
-- Корректируем цену услуги на 2400 (ручная)
UPDATE order_item_services SET price = 2400, is_manual_price = TRUE WHERE id = 26;

-- Заказ 11: Романова FOR_PICKUP
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (20, 11, 3, 'Шерстяной ковёр 2×2', 'CREATED', 1920, 2, 2, 4),
  (21, 11, 8, 'Плед детский 1.5 кг', 'CREATED', 375, NULL, NULL, NULL),
  (22, 11, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL); -- бесплатно (от 4000)
UPDATE order_items SET weight = 1.5 WHERE id = 21;
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (29, 20, 3, 3, 'CREATED', 1920, FALSE), -- 480 × 4
  (30, 21, 8, 8, 'CREATED', 375,  FALSE), -- 250 × 1.5
  (31, 22, 12,12,'CREATED', 0, FALSE),
  (32, 22, 13,13,'CREATED', 0, FALSE);

-- Заказ 12: Соколова IN_PROGRESS — забрали, стирают
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (23, 12, 2, 'Синтетика 1.5×2',  'IN_PROGRESS', 1440, 1.5, 2, 3),
  (24, 12, 12,'Доставка', 'CREATED', 300, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (33, 23, 2, 2, 'IN_PROGRESS', 1440, FALSE),
  (34, 24, 12,12,'DONE', 150, FALSE), -- забор уже сделан
  (35, 24, 13,13,'CREATED', 150, FALSE);

-- Заказ 13: Кузнецова IN_PROGRESS
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (25, 13, 3, 'Шерсть 2.5×2',  'IN_PROGRESS', 2400, 2.5, 2, 5),
  (26, 13, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (36, 25, 3, 3, 'IN_PROGRESS', 2400, FALSE),
  (37, 26, 12,12,'DONE', 0, FALSE),
  (38, 26, 13,13,'CREATED', 0, FALSE);

-- Заказ 14: ООО Уют IN_PROGRESS — большой заказ на офис
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (27, 14, 2, 'Офисный ковёр 5×4', 'IN_PROGRESS', 9600, 5, 4, 20),
  (28, 14, 11,'Шторы офисные ×2',  'CREATED', 800, NULL, NULL, 8),
  (29, 14, 8, 'Пледы (на диванах) 6 кг', 'CREATED', 1500, NULL, NULL, NULL),
  (30, 14, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
UPDATE order_items SET weight = 6 WHERE id = 29;
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (39, 27, 2, 2, 'IN_PROGRESS', 9600, FALSE),
  (40, 28, 11,11,'CREATED', 800,  FALSE),
  (41, 29, 8, 8, 'CREATED', 1500, FALSE),
  (42, 30, 12,12,'DONE', 0, FALSE),
  (43, 30, 13,13,'CREATED', 0, FALSE);

-- Заказ 15: Смирнова PARTIALLY_DONE — 1 готов, 1 еще нет
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (31, 15, 3, 'Шерсть гостиная 2.5×1.5', 'DONE', 1800, 2.5, 1.5, 3.75),
  (32, 15, 6, 'Вискоза детская 2×1.5',   'IN_PROGRESS', 1950, 2, 1.5, 3),
  (33, 15, 8, 'Плед 6 кг',               'DONE', 1500, NULL, NULL, NULL),
  (34, 15, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
UPDATE order_items SET weight = 6 WHERE id = 33;
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (44, 31, 3, 3, 'DONE', 1800, FALSE),
  (45, 32, 6, 6, 'IN_PROGRESS', 1950, FALSE),
  (46, 33, 8, 8, 'DONE', 1500, FALSE),
  (47, 34, 12,12,'DONE', 0, FALSE),
  (48, 34, 13,13,'CREATED', 0, FALSE);

-- Заказ 16: Новиков PARTIALLY_DONE + сильное загрязнение
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area, defects) VALUES
  (35, 16, 5, 'Акрил 2×2',  'DONE', 2200, 2, 2, 4, 'Пятна от кофе по центру'),
  (36, 16, 7, 'Ковёр тип не понятен 1.5×2', 'IN_PROGRESS', 1590, 1.5, 2, 3, NULL),
  (37, 16, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (49, 35, 5, 5, 'DONE', 2200, FALSE), -- 550 × 4
  (50, 36, 7, 7, 'IN_PROGRESS', 1590, FALSE), -- 530 × 3
  (51, 37, 12,12,'DONE', 0, FALSE),
  (52, 37, 13,13,'CREATED', 0, FALSE);

-- Заказ 17: Захарова DONE
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (38, 17, 4, 'Длинный ворс 2×2',     'DONE', 2200, 2, 2, 4),
  (39, 17, 6, 'Вискоза 1.5×1.5',       'DONE', 1462.50, 1.5, 1.5, 2.25),
  (40, 17, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (53, 38, 4, 4, 'DONE', 2200, FALSE),
  (54, 39, 6, 6, 'DONE', 1462.50, FALSE),
  (55, 40, 12,12,'DONE', 0, FALSE),
  (56, 40, 13,13,'CREATED', 0, FALSE);

-- Заказ 18: Лебедев DONE
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (41, 18, 3, 'Шерсть 2×1.5', 'DONE', 1440, 2, 1.5, 3),
  (42, 18, 10,'Тюль', 'DONE', 1200, NULL, NULL, 12),
  (43, 18, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (57, 41, 3, 3, 'DONE', 1440, FALSE),
  (58, 42, 10,10,'DONE', 1200, FALSE),
  (59, 43, 12,12,'DONE', 0, FALSE),
  (60, 43, 13,13,'CREATED', 0, FALSE);

-- Заказ 19: Орлова DONE
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (44, 19, 4, 'Длинный ворс 2.5×2',   'DONE', 2750, 2.5, 2, 5),
  (45, 19, 4, 'Длинный ворс 1.5×2',   'DONE', 1650, 1.5, 2, 3),
  (46, 19, 8, 'Плед 6 кг',            'DONE', 1500, NULL, NULL, NULL),
  (47, 19, 12,'Доставка', 'CREATED', 0, NULL, NULL, NULL);
UPDATE order_items SET weight = 6 WHERE id = 46;
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (61, 44, 4, 4, 'DONE', 2750, FALSE),
  (62, 45, 4, 4, 'DONE', 1650, FALSE),
  (63, 46, 8, 8, 'DONE', 1500, FALSE),
  (64, 47, 12,12,'DONE', 0, FALSE),
  (65, 47, 13,13,'CREATED', 0, FALSE);

-- Заказ 20-26: DELIVERED (для аналитики, статусы услуг DONE)
-- Чтобы не разводить много строк — у каждого 1-2 позиции.
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area) VALUES
  (48, 20, 3, 'Шерсть', 'DONE', 2700, 2.5, 1.5, 3.75),
  (49, 20, 12, 'Доставка', 'DONE', 300, NULL, NULL, NULL),
  (50, 21, 2, 'Синтетика', 'DONE', 1500, 2, 1, 2),  -- 480×2 = 960? пусть будет ручная 1500
  (51, 21, 12, 'Доставка', 'DONE', 300, NULL, NULL, NULL),
  (52, 22, 4, 'Длинный ворс', 'DONE', 4500, 3, 2, 6),  -- 550×6=3300, ручная 4500
  (53, 22, 11, 'Шторы', 'DONE', 900, NULL, NULL, 9),
  (54, 22, 12, 'Доставка', 'DONE', 0, NULL, NULL, NULL),
  (55, 23, 2, 'Большой ковёр в офис', 'DONE', 12000, 5, 5, 25),
  (56, 23, 8, 'Пледы офисные', 'DONE', 3000, NULL, NULL, NULL),
  (57, 23, 11, 'Шторы офисные', 'DONE', 3000, NULL, NULL, 30),
  (58, 23, 12, 'Доставка', 'DONE', 0, NULL, NULL, NULL),
  (59, 24, 3, 'Шерсть гостиная', 'DONE', 4320, 3, 3, 9),
  (60, 24, 4, 'Длинный ворс спальня', 'DONE', 2880, 2.4, 2.2, 5.28),  -- ~2904
  (61, 24, 12, 'Доставка', 'DONE', 0, NULL, NULL, NULL),
  (62, 25, 2, 'Синтетика', 'DONE', 2400, 2.5, 2, 5),
  (63, 25, 12, 'Доставка', 'DONE', 0, NULL, NULL, NULL),
  (64, 26, 3, 'Шерсть', 'DONE', 1920, 2, 2, 4),
  (65, 26, 4, 'Длинный ворс', 'DONE', 1650, 1.5, 2, 3),
  (66, 26, 12, 'Доставка', 'DONE', 0, NULL, NULL, NULL);
UPDATE order_items SET weight = 12 WHERE id = 56;
UPDATE order_items SET weight = 6 WHERE id = 60;

INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price) VALUES
  (66, 48, 3, 3, 'DONE', 1800, FALSE),  (67, 48, 8, 8, 'DONE', 900, TRUE),
  (68, 49, 12,12,'DONE', 150, FALSE),   (69, 49, 13,13,'DONE', 150, FALSE),
  (70, 50, 2, 2, 'DONE', 1500, TRUE),
  (71, 51, 12,12,'DONE', 150, FALSE),   (72, 51, 13,13,'DONE', 150, FALSE),
  (73, 52, 4, 4, 'DONE', 4500, TRUE),
  (74, 53, 11,11,'DONE', 900, FALSE),
  (75, 54, 12,12,'DONE', 0, FALSE),     (76, 54, 13,13,'DONE', 0, FALSE),
  (77, 55, 2, 2, 'DONE', 12000, FALSE),
  (78, 56, 8, 8, 'DONE', 3000, FALSE),
  (79, 57, 11,11,'DONE', 3000, FALSE),
  (80, 58, 12,12,'DONE', 0, FALSE),     (81, 58, 13,13,'DONE', 0, FALSE),
  (82, 59, 3, 3, 'DONE', 4320, FALSE),
  (83, 60, 4, 4, 'DONE', 2880, FALSE),
  (84, 61, 12,12,'DONE', 0, FALSE),     (85, 61, 13,13,'DONE', 0, FALSE),
  (86, 62, 2, 2, 'DONE', 2400, FALSE),
  (87, 63, 12,12,'DONE', 0, FALSE),     (88, 63, 13,13,'DONE', 0, FALSE),
  (89, 64, 3, 3, 'DONE', 1920, FALSE),
  (90, 65, 4, 4, 'DONE', 1650, FALSE),
  (91, 66, 12,12,'DONE', 0, FALSE),     (92, 66, 13,13,'DONE', 0, FALSE);

-- Заказ 27: CANCELLED — 1 позиция, тоже CANCELLED
INSERT INTO order_items (id, order_id, item_type_id, description, status, price, length, width, area, cancellation_reason) VALUES
  (67, 27, 2, 'Синтетика 1.5×1.5', 'CANCELLED', 1080, 1.5, 1.5, 2.25, 'Заказ отменён клиентом до забора'),
  (68, 27, 12,'Доставка', 'CANCELLED', 300, NULL, NULL, NULL, 'Заказ отменён клиентом');
INSERT INTO order_item_services (id, order_item_id, sku_id, sku_version_id, status, price, is_manual_price, cancellation_reason) VALUES
  (93, 67, 2, 2, 'CANCELLED', 1080, FALSE, 'Заказ отменён клиентом'),
  (94, 68, 12,12,'CANCELLED', 150, FALSE, 'Заказ отменён клиентом'),
  (95, 68, 13,13,'CANCELLED', 150, FALSE, 'Заказ отменён клиентом');

-- Заказ 28: CANCELLED — без позиций (отменили до формирования)

SELECT setval('order_items_id_seq',          (SELECT MAX(id) FROM order_items));
SELECT setval('order_item_services_id_seq',  (SELECT MAX(id) FROM order_item_services));

-- ---------- 7. Назначения исполнителей ----------
-- Стирщики на стирку, водители на доставку.
INSERT INTO service_assignees (order_item_service_id, employee_id) VALUES
  -- Заказ 12 (Соколова, IN_PROGRESS): стирщик Иванов + водитель Кузнецов
  (33, 3), (34, 6), (35, 6),
  -- Заказ 13 (Кузнецова, IN_PROGRESS): стирщик Петров + водитель Морозов
  (36, 4), (37, 7), (38, 7),
  -- Заказ 14 (ООО Уют, IN_PROGRESS): большой — Иванов+Сидоров на стирку, Кузнецов на доставку
  (39, 3), (39, 5), (40, 4), (41, 3), (42, 6), (43, 6),
  -- Заказ 15 (Смирнова PARTIALLY): Иванов
  (44, 3), (45, 5), (46, 4), (47, 6), (48, 6),
  -- Заказ 16 (Новиков PARTIALLY): Петров
  (49, 4), (50, 5), (51, 7), (52, 7),
  -- Заказ 17 (Захарова DONE): Иванов
  (53, 3), (54, 5), (55, 6), (56, 6),
  -- Заказ 18 (Лебедев DONE): Петров + Морозов
  (57, 4), (58, 5), (59, 7), (60, 7),
  -- Заказ 19 (Орлова DONE): Иванов + Сидоров + Кузнецов
  (61, 3), (62, 5), (63, 4), (64, 6), (65, 6),
  -- Заказ 9 (Орлова FOR_PICKUP): Кузнецов
  (24, 6), (25, 6),
  -- Заказ 10 (Волкова FOR_PICKUP): Кузнецов
  (27, 6), (28, 6),
  -- Заказ 11 (Романова FOR_PICKUP): Морозов
  (31, 7), (32, 7),
  -- DELIVERED orders 20-26: распределяем
  (66, 3), (67, 5), (68, 6), (69, 6),
  (70, 4), (71, 7), (72, 7),
  (73, 3), (74, 4), (75, 6), (76, 6),
  (77, 5), (78, 3), (79, 4), (80, 7), (81, 7),
  (82, 3), (83, 4), (84, 6), (85, 6),
  (86, 5), (87, 6), (88, 6),
  (89, 4), (90, 3), (91, 7), (92, 7);

-- ---------- 8. Модификаторы на заказах ----------
INSERT INTO order_modifiers (order_id, modifier_id, modifier_name, percent) VALUES
  (11, 6, 'Постоянный клиент', -5.00),
  (12, 5, 'Пенсионер',        -10.00),
  (13, 5, 'Пенсионер',        -10.00),
  (14, 6, 'Постоянный клиент', -5.00),
  (15, 6, 'Постоянный клиент', -5.00),
  (16, 1, 'Сильное загрязнение', 10.00),
  (17, 6, 'Постоянный клиент', -5.00),
  (19, 6, 'Постоянный клиент', -5.00),
  (20, 6, 'Постоянный клиент', -5.00),
  (21, 5, 'Пенсионер',        -10.00),
  (22, 6, 'Постоянный клиент', -5.00),
  (23, 6, 'Постоянный клиент', -5.00),
  (24, 6, 'Постоянный клиент', -5.00);

-- ---------- 9. История статусов ----------
INSERT INTO order_status_history (order_id, old_status, new_status, changed_at) VALUES
  -- Заказ 9: LEAD → CREATED → FOR_PICKUP
  (9,  NULL,         'LEAD',         NOW() - INTERVAL '3 days'),
  (9,  'LEAD',       'CREATED',      NOW() - INTERVAL '2 days'),
  (9,  'CREATED',    'FOR_PICKUP',   NOW() - INTERVAL '1 day'),
  -- Заказ 12: CREATED → IN_PROGRESS
  (12, NULL,         'CREATED',      NOW() - INTERVAL '4 days'),
  (12, 'CREATED',    'FOR_PICKUP',   NOW() - INTERVAL '2 days'),
  (12, 'FOR_PICKUP', 'IN_PROGRESS',  NOW() - INTERVAL '1 day'),
  -- Заказ 14: длинная история (большой клиент)
  (14, NULL,         'LEAD',         NOW() - INTERVAL '8 days'),
  (14, 'LEAD',       'CREATED',      NOW() - INTERVAL '7 days'),
  (14, 'CREATED',    'FOR_PICKUP',   NOW() - INTERVAL '5 days'),
  (14, 'FOR_PICKUP', 'IN_PROGRESS',  NOW() - INTERVAL '3 days'),
  -- Заказ 15: PARTIALLY_DONE
  (15, NULL,         'CREATED',      NOW() - INTERVAL '8 days'),
  (15, 'CREATED',    'IN_PROGRESS',  NOW() - INTERVAL '5 days'),
  (15, 'IN_PROGRESS','PARTIALLY_DONE', NOW() - INTERVAL '1 day'),
  -- Заказ 20-26: финальные
  (20, NULL, 'CREATED', NOW() - INTERVAL '28 days'),
  (20, 'CREATED', 'IN_PROGRESS', NOW() - INTERVAL '25 days'),
  (20, 'IN_PROGRESS', 'DONE', NOW() - INTERVAL '17 days'),
  (20, 'DONE', 'DELIVERED', NOW() - INTERVAL '15 days'),
  (23, NULL, 'CREATED', NOW() - INTERVAL '52 days'),
  (23, 'CREATED', 'IN_PROGRESS', NOW() - INTERVAL '50 days'),
  (23, 'IN_PROGRESS', 'DONE', NOW() - INTERVAL '44 days'),
  (23, 'DONE', 'DELIVERED', NOW() - INTERVAL '42 days'),
  -- Заказ 27: CANCELLED
  (27, NULL, 'LEAD', NOW() - INTERVAL '8 days'),
  (27, 'LEAD', 'CANCELLED', NOW() - INTERVAL '7 days');

-- ---------- 10. Уведомления ----------
-- foxy (user_id=1) — несколько свежих и одно прочитанное.
-- admin (user_id=2) — одно непрочитанное.
-- operator (user_id=3) — много, чтобы видеть значок-счётчик.
INSERT INTO notifications (user_id, type, message, entity_type, entity_id, is_read, created_at) VALUES
  -- foxy
  (1, 'ORDER_CREATED',          'Новый заказ #00004 от Смирновой Е.С.',     'ORDER', 4,  FALSE, NOW() - INTERVAL '3 hours'),
  (1, 'ORDER_STATUS_CHANGED',   'Заказ #00015 → ЧАСТИЧНО ГОТОВ',            'ORDER', 15, FALSE, NOW() - INTERVAL '1 day'),
  (1, 'SERVICE_DONE',           'Услуга "Стирка длинного ворса" выполнена', 'SERVICE', 61, TRUE,  NOW() - INTERVAL '3 days'),
  -- admin
  (2, 'SKU_MISMATCH',           'У позиции #36 не подходит SKU после смены размеров', 'ORDER_ITEM', 36, FALSE, NOW() - INTERVAL '6 hours'),
  -- operator (employee_id=2, user_id=3)
  (3, 'ORDER_ASSIGNED',         'Вам назначен заказ #00009 (забор сегодня)','ORDER', 9,  FALSE, NOW() - INTERVAL '2 hours'),
  (3, 'ORDER_CREATED',          'Новый LEAD от Михайлова А.П.',             'ORDER', 1,  FALSE, NOW() - INTERVAL '2 hours'),
  (3, 'ORDER_CREATED',          'Новый LEAD от Зайцева П.С.',               'ORDER', 2,  FALSE, NOW() - INTERVAL '5 hours'),
  (3, 'ORDER_STATUS_CHANGED',   'Заказ #00012 → В работе',                  'ORDER', 12, FALSE, NOW() - INTERVAL '1 day'),
  (3, 'ORDER_STATUS_CHANGED',   'Заказ #00014 → В работе (ООО "Уют")',     'ORDER', 14, FALSE, NOW() - INTERVAL '3 days'),
  (3, 'SERVICE_DONE',           'Стирка офисного ковра завершена (ООО Уют)','SERVICE', 39, TRUE,  NOW() - INTERVAL '2 days'),
  (3, 'CLIENT_FLAGGED',         'Клиент Новиков И.Д. помечен как проблемный', 'CLIENT', 5, TRUE,  NOW() - INTERVAL '4 days'),
  -- V17: проблемные заказы — алерт админам (foxy, admin)
  (1, 'ORDER_PROBLEM', 'ПРОБЛЕМА на заказе #00016: запах после стирки, перестирать', 'ORDER', 16, FALSE, NOW() - INTERVAL '1 hour'),
  (1, 'ORDER_PROBLEM', 'ПРОБЛЕМА на заказе #00015: возможная потеря пледа',          'ORDER', 15, FALSE, NOW() - INTERVAL '4 hours'),
  (2, 'ORDER_PROBLEM', 'ПРОБЛЕМА на заказе #00016: запах после стирки, перестирать', 'ORDER', 16, FALSE, NOW() - INTERVAL '1 hour'),
  (2, 'ORDER_PROBLEM', 'ПРОБЛЕМА на заказе #00015: возможная потеря пледа',          'ORDER', 15, FALSE, NOW() - INTERVAL '4 hours');

-- ---------- 11. События клиентов ----------
INSERT INTO client_events (client_id, event_type, description, created_at) VALUES
  (1,  'ORDER_PLACED', 'Заказ #00004 размещён', NOW() - INTERVAL '3 hours'),
  (1,  'ORDER_PLACED', 'Заказ #00020 завершён, оплачен картой', NOW() - INTERVAL '15 days'),
  (5,  'FLAGGED', 'Помечен как проблемный (жалоба на сроки)', NOW() - INTERVAL '4 days'),
  (5,  'ORDER_CANCELLED', 'Заказ #00027 отменён клиентом', NOW() - INTERVAL '7 days'),
  (13, 'ORDER_PLACED', 'Крупный регулярный клиент — ежемесячная стирка офиса', NOW() - INTERVAL '90 days'),
  (13, 'ORDER_PLACED', 'Заказ #00023 завершён (18000 руб, безнал)', NOW() - INTERVAL '42 days');

-- ---------- 12. Audit log (немного для красоты) ----------
INSERT INTO audit_log (entity_type, entity_id, action, description, occurred_at) VALUES
  ('ORDER',      4,  'CREATE', 'Заказ #00004 создан оператором Поляковым Дмитрием', NOW() - INTERVAL '3 hours'),
  ('ORDER',      12, 'STATUS_CHANGE', 'Статус заказа #00012 изменён: FOR_PICKUP → IN_PROGRESS', NOW() - INTERVAL '1 day'),
  ('ORDER_ITEM', 23, 'UPDATE', 'Изменены размеры позиции #23 (1.5×2)', NOW() - INTERVAL '1 day'),
  ('SERVICE',    39, 'STATUS_CHANGE', 'Услуга #39 → IN_PROGRESS, назначен Иванов', NOW() - INTERVAL '3 days'),
  ('CLIENT',     5,  'UPDATE', 'Клиент #5 помечен как проблемный', NOW() - INTERVAL '4 days'),
  ('ORDER',      27, 'STATUS_CHANGE', 'Статус заказа #00027 изменён: LEAD → CANCELLED', NOW() - INTERVAL '7 days');

-- ---------- ЗАКЛЮЧЕНИЕ ----------
SET session_replication_role = DEFAULT;

-- Принудительно пересчитаем base_amount/total_amount у всех заказов на случай,
-- если триггеры что-то пересчитали бы в нашем seed'е некорректно.
-- (Мы вставляли base_amount/total_amount явно — они должны быть верными.)

COMMIT;

-- Проверочный отчёт после сидинга
\echo '=== СВОДКА ==='
SELECT
  (SELECT COUNT(*) FROM users)        AS users,
  (SELECT COUNT(*) FROM employees)    AS employees,
  (SELECT COUNT(*) FROM clients)      AS clients,
  (SELECT COUNT(*) FROM orders)       AS orders,
  (SELECT COUNT(*) FROM order_items)  AS items,
  (SELECT COUNT(*) FROM order_item_services) AS services,
  (SELECT COUNT(*) FROM service_assignees)   AS assignees,
  (SELECT COUNT(*) FROM notifications) AS notifications;

\echo '=== ЗАКАЗЫ ПО СТАТУСАМ ==='
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY 1;
