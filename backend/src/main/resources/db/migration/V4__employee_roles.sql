-- ============================================================================
-- V4: Роли сотрудников и привязка к типам позиций.
--
-- Бизнес-правило: сотрудник работает не со всеми типами позиций — например,
-- Вася чистит только ковры, Петя — только тюли. При назначении исполнителя
-- к услуге фильтруем по типам, с которыми он умеет работать.
--
-- Реализация:
--   • employee_roles — справочник ролей (например «Чистильщик ковров», «Универсал»);
--   • employee_role_item_types — какие типы позиций входят в роль (M:N);
--   • employees.role_id — каждый сотрудник может иметь одну роль (NULL = «без роли»,
--     может назначаться на любые услуги — обратная совместимость для уже
--     существующих сотрудников).
--
-- Почему «роль», а не «список типов на сотруднике»:
--   • один и тот же набор типов часто повторяется у нескольких сотрудников;
--   • при добавлении нового типа удобно править одну роль, а не каждого сотрудника;
--   • UI становится проще: сотруднику просто выбирают роль из списка.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employee_roles (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    -- Опционально: краткое описание для подсказки в UI.
    description TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Какие типы позиций входят в роль. ON DELETE CASCADE — при удалении роли
-- автоматически чистим связи. Для item_types — RESTRICT, потому что мы
-- их и так soft-delete'им.
CREATE TABLE IF NOT EXISTS employee_role_item_types (
    role_id      BIGINT NOT NULL REFERENCES employee_roles(id) ON DELETE CASCADE,
    item_type_id BIGINT NOT NULL REFERENCES item_types(id),
    PRIMARY KEY (role_id, item_type_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_role_item_types_item_type
    ON employee_role_item_types(item_type_id);

-- Привязка сотрудника к роли. ON DELETE SET NULL — удаление роли не удаляет
-- сотрудников, просто снимает с них роль (они становятся «универсалами»).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS role_id BIGINT
    REFERENCES employee_roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_role_id ON employees(role_id);
