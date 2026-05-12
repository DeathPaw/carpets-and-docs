-- ============================================================================
-- Полная очистка боевой БД перед заливкой демо-данных.
-- Структура (Flyway-миграции) остаётся; чистим только пользовательские данные.
-- Запускать ПЕРЕД 01_core.sql и 02_orders.sql.
-- ============================================================================

BEGIN;

DELETE FROM order_item_service_defects;
DELETE FROM service_assignees;
DELETE FROM order_item_services;
DELETE FROM order_item_photos;
DELETE FROM order_status_history;
DELETE FROM order_modifiers;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM client_modifiers;
DELETE FROM client_events;
DELETE FROM clients;

-- Снимаем FK skus.current_version_id → sku_versions перед удалением версий
UPDATE skus SET current_version_id = NULL;
DELETE FROM sku_versions;
DELETE FROM sku_attributes;
DELETE FROM skus;
DELETE FROM sku_groups;

DELETE FROM employee_role_item_types;
DELETE FROM employees;
DELETE FROM employee_roles;
DELETE FROM item_types;
DELETE FROM price_modifiers;

-- Сбросить sequences
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

COMMIT;

SELECT 'cleaned' AS status;
