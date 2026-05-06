-- ============================================================================
-- V5: Обратная связь от оператора («связь с разработчиком»).
--
-- На любой странице у оператора есть плавающая кнопка — он выбирает тему,
-- пишет текст, опционально прикладывает скриншот (paste из буфера или загрузка).
-- Сохраняем путь страницы (`page_path`) и параметры (например, ID заказа) —
-- разработчику не нужно гадать, на какой странице это произошло.
--
-- Скриншоты хранятся в bytea, как фото позиций (см. V1) — небольшие, base64
-- разворачивается на бэке только при отдаче списка супервизору.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_messages (
    id              BIGSERIAL PRIMARY KEY,
    -- Тема: SUGGESTION_HOW | FEATURE_REQUEST | LOGIC_BUG | VISUAL_BUG | UNCLEAR
    -- Хранится как VARCHAR (без ENUM): чтобы добавить новую тему без миграции схемы.
    topic           VARCHAR(40) NOT NULL,
    body            TEXT NOT NULL,
    -- Полный путь страницы с query-параметрами (например, "/orders/123" или "/items?status=DONE").
    page_path       TEXT NOT NULL,
    -- Опциональный скриншот: base64 в TEXT. NULL если оператор не прикладывал.
    -- (Решили хранить как TEXT — см. комментарий у order_item_photos.data в V1.)
    screenshot      TEXT,
    screenshot_type VARCHAR(50),  -- mime, например "image/png" — для отдачи в data:url
    -- Имя пользователя из Basic Auth — для дев-режима всегда "admin", но оставляем
    -- готовый столбец под полноценные роли в будущем.
    submitted_by    VARCHAR(100),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_topic      ON feedback_messages(topic);
