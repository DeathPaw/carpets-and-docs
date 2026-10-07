-- V47: пол и возраст клиента (правка №1 от 13.09).
--
-- Нужны для портрета базы: кто наши клиенты, какие сегменты приходят чаще.
-- Оба поля необязательные — оператор заполняет, если знает.
--
-- Пол предзаполняется по отчеству («…вна» / «…вич») при заведении клиента,
-- дальше оператор может поправить: автоматика ошибается на редких именах,
-- а данные нужны честные.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS gender VARCHAR(10);
-- Возраст, а не год рождения: оператор чаще знает «лет сорок», чем дату.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS age SMALLINT;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_gender_check;
ALTER TABLE clients ADD CONSTRAINT clients_gender_check
    CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE', 'UNKNOWN'));

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_age_check;
ALTER TABLE clients ADD CONSTRAINT clients_age_check
    CHECK (age IS NULL OR (age > 0 AND age < 120));
