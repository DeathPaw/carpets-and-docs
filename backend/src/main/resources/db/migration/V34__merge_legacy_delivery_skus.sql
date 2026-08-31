-- V34: схлопываем legacy-услуги доставки в две — «Приём» и «Доставка».
--
-- В каталоге накопились почти одинаковые по смыслу услуги: «Доставка (забор)»,
-- «Доставка (отвоз)», «Приём», «Доставка». В фильтрах «Производства» и в выборе
-- услуги это выглядело как четыре разных варианта одного и того же, оператор
-- путался, какой брать.
--
-- Схлопываем по жизненному циклу, он совпадает один в один:
--   «Доставка (забор)» → IN_PROGRESS  ≡  «Приём»    → IN_PROGRESS
--   «Доставка (отвоз)» → DELIVERED    ≡  «Доставка» → DELIVERED
--
-- Старые SKU не удаляем, а выключаем (is_active = FALSE): на них могут ссылаться
-- строки sku_versions и записи аудита. Выключенные не попадают ни в подбор услуг,
-- ни в фильтры — из интерфейса они исчезают.
--
-- «Самовывоз (привоз/отвоз клиентом)» не трогаем: это пары для свапа платной
-- услуги на бесплатную, они несут отдельный смысл.

DO $$
DECLARE
    pickup_id   BIGINT;   -- «Приём»
    delivery_id BIGINT;   -- «Доставка»
    legacy_pick BIGINT;   -- «Доставка (забор)»
    legacy_del  BIGINT;   -- «Доставка (отвоз)»
    pickup_ver  BIGINT;
    delivery_ver BIGINT;
    pickup_type BIGINT;
    delivery_type BIGINT;
BEGIN
    SELECT id INTO pickup_id   FROM skus WHERE name = 'Приём'            LIMIT 1;
    SELECT id INTO delivery_id FROM skus WHERE name = 'Доставка'         LIMIT 1;
    SELECT id INTO legacy_pick FROM skus WHERE name = 'Доставка (забор)' LIMIT 1;
    SELECT id INTO legacy_del  FROM skus WHERE name = 'Доставка (отвоз)' LIMIT 1;

    -- Целевых услуг нет (база собрана иначе) — выходим, ничего не ломая.
    IF pickup_id IS NULL OR delivery_id IS NULL THEN RETURN; END IF;

    SELECT current_version_id INTO pickup_ver   FROM skus WHERE id = pickup_id;
    SELECT current_version_id INTO delivery_ver FROM skus WHERE id = delivery_id;

    SELECT id INTO pickup_type   FROM item_types WHERE name = 'Приём'    LIMIT 1;
    SELECT id INTO delivery_type FROM item_types WHERE name = 'Доставка' LIMIT 1;

    -- ── «Доставка (забор)» → «Приём» ───────────────────────────────────────
    IF legacy_pick IS NOT NULL THEN
        -- Тип позиции приводим к целевому, иначе позиция осталась бы «Доставка»
        -- с услугой «Приём» — и подбор услуг считал бы её неподходящей.
        IF pickup_type IS NOT NULL THEN
            UPDATE order_items oi SET item_type_id = pickup_type
             WHERE EXISTS (SELECT 1 FROM order_item_services ois
                            WHERE ois.order_item_id = oi.id AND ois.sku_id = legacy_pick);
        END IF;
        -- sku_version_id переводим на версию целевой услуги: имя услуги берётся
        -- из снапшота (COALESCE(sv.name, s.name)), иначе в интерфейсе так и
        -- осталась бы «Доставка (забор)».
        UPDATE order_item_services
           SET sku_id = pickup_id, sku_version_id = pickup_ver
         WHERE sku_id = legacy_pick;
        UPDATE skus SET is_active = FALSE, is_auto_add = FALSE WHERE id = legacy_pick;
    END IF;

    -- ── «Доставка (отвоз)» → «Доставка» ────────────────────────────────────
    IF legacy_del IS NOT NULL THEN
        IF delivery_type IS NOT NULL THEN
            UPDATE order_items oi SET item_type_id = delivery_type
             WHERE EXISTS (SELECT 1 FROM order_item_services ois
                            WHERE ois.order_item_id = oi.id AND ois.sku_id = legacy_del);
        END IF;
        UPDATE order_item_services
           SET sku_id = delivery_id, sku_version_id = delivery_ver
         WHERE sku_id = legacy_del;
        UPDATE skus SET is_active = FALSE, is_auto_add = FALSE WHERE id = legacy_del;
    END IF;

    -- Свап «платная ↔ самовывоз» ищет пару по имени. Legacy-услуги больше не
    -- участвуют, поэтому чистим их привязку к типу позиции — чтобы они не
    -- всплывали в «Только подходящие», если кто-то их снова включит.
    DELETE FROM sku_attributes
     WHERE sku_id IN (legacy_pick, legacy_del) AND attr_key = 'item_type';
END $$;
