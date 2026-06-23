-- V24: employee-роли «Оператор» и «Админ» с доступом к типу «Оформление».
--
-- Зачем: услугу «Оформление» (V22) должен оформлять оператор-создатель заказа
-- (автоназначение в OrderService уже работает). Но если оператор/админ захочет
-- ПЕРЕНАЗНАЧИТЬ исполнителя — селектор исполнителей фильтрует по
-- employee_role_item_types, а у employees, привязанных к operator/admin user'ам,
-- role_id = NULL. Никто из «своих» в селекторе не появляется.
--
-- Решение: завести роли «Оператор» и «Админ» (как employee_roles, рядом со
-- «Стирщик»/«Водитель»), привязать обе к типу «Оформление». Существующим
-- сотрудникам, у которых висит user'овская роль OPERATOR/ADMIN/SUPERVISOR,
-- проставить соответствующий role_id — но только если он сейчас NULL, чтобы не
-- затереть случайный «Водитель»/«Стирщик» (такой человек одновременно и
-- водитель и оператор — крайне маловероятно, но руками затирать не будем).
--
-- Супервайзер по уровню = админ, ему даём ту же роль «Админ».

-- 1. Новые роли.
INSERT INTO employee_roles (name, description) VALUES
  ('Оператор', 'Оформление заказов в системе, работа с клиентами'),
  ('Админ',    'Полный доступ: оформление, управление, настройки')
ON CONFLICT (name) DO NOTHING;

-- 2. Доступ обеих к типу «Оформление».
INSERT INTO employee_role_item_types (role_id, item_type_id)
SELECT er.id, it.id
  FROM employee_roles er, item_types it
 WHERE er.name IN ('Оператор', 'Админ')
   AND it.name = 'Оформление'
ON CONFLICT DO NOTHING;

-- 3. Существующим сотрудникам подсунуть роль по их user.role.
--    Только там, где employees.role_id IS NULL — не затираем явных Водителей/Стирщиков.
UPDATE employees e
   SET role_id = (SELECT id FROM employee_roles WHERE name = 'Оператор')
  FROM users u
 WHERE u.employee_id = e.id
   AND u.role = 'OPERATOR'
   AND e.role_id IS NULL;

UPDATE employees e
   SET role_id = (SELECT id FROM employee_roles WHERE name = 'Админ')
  FROM users u
 WHERE u.employee_id = e.id
   AND u.role IN ('ADMIN', 'SUPERVISOR')
   AND e.role_id IS NULL;
