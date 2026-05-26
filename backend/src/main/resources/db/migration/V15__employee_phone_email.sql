-- V15: разделяем employees.contact → phone + email.
--
-- В UI сейчас одна колонка «контакт» — у юр.лица там почта, у остальных телефон. Выглядит
-- криво (миксы). Делаем две явные колонки. Существующие contact-значения парсим:
--   содержит '@' → email
--   иначе         → phone (включая «+7 (...)»).
-- Старую колонку оставлять не будем — JDBC RowMapper уже переключим на новые поля.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);

UPDATE employees
   SET email = contact
 WHERE contact IS NOT NULL AND contact LIKE '%@%' AND email IS NULL;

UPDATE employees
   SET phone = contact
 WHERE contact IS NOT NULL AND contact NOT LIKE '%@%' AND phone IS NULL;

ALTER TABLE employees DROP COLUMN IF EXISTS contact;
