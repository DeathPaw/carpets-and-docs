-- V27: несколько скриншотов на одно обращение (правка №10).
--
-- Было: feedback_messages.screenshot / screenshot_type — ровно одна картинка.
-- Для описания последовательности действий одного экрана не хватает.
--
-- Стало: отдельная таблица feedback_screenshots (1:N). Старые колонки НЕ удаляем —
-- переносим данные и оставляем как есть, чтобы откат релиза не потерял вложения
-- уже принятых обращений. Новые обращения пишут только в feedback_screenshots.

CREATE TABLE IF NOT EXISTS feedback_screenshots (
    id           BIGSERIAL PRIMARY KEY,
    feedback_id  BIGINT NOT NULL REFERENCES feedback_messages(id) ON DELETE CASCADE,
    screenshot   TEXT NOT NULL,          -- base64 без data:-префикса
    content_type VARCHAR(50),            -- mime, например "image/png"
    sort_order   INT NOT NULL DEFAULT 0, -- порядок, в котором оператор их приложил
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_screenshots_feedback
    ON feedback_screenshots(feedback_id, sort_order);

-- Переносим уже приложенные одиночные скриншоты, чтобы во вкладке «Обращения»
-- старые вложения продолжали показываться после перехода на новый формат.
INSERT INTO feedback_screenshots (feedback_id, screenshot, content_type, sort_order)
SELECT id, screenshot, screenshot_type, 0
  FROM feedback_messages
 WHERE screenshot IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM feedback_screenshots fs WHERE fs.feedback_id = feedback_messages.id);
