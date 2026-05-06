import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createFeedback } from '../api/feedback'
import { ALL_FEEDBACK_TOPICS, FEEDBACK_TOPIC_LABELS } from '../constants/feedback'
import { useToast } from './Toast'
import type { FeedbackTopic } from '../types'

/**
 * Плавающая кнопка «Связь с разработчиком», видна на всех страницах в правом нижнем углу.
 *
 * <p>Расположена так чтобы быть «всегда под рукой, но не отвлекала»:
 *   • в углу — не перекрывает контент;
 *   • полупрозрачная пока не наведён курсор;
 *   • при клике — модалка с выбором темы, текстом и опциональным скриншотом
 *     (paste из буфера обмена или загрузка файлом).
 *
 * <p>Сохраняет путь страницы (location.pathname + search) автоматически —
 * разработчик увидит, на какой странице с какими параметрами оператор писал.
 */
export default function FeedbackButton() {
  const location = useLocation()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState<FeedbackTopic>('SUGGESTION_HOW')
  const [body, setBody] = useState('')
  // Скриншот хранится в base64 (без префикса `data:image/png;base64,`),
  // mime — в screenshotType. На отправке улетают вместе.
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [screenshotType, setScreenshotType] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Закрытие по Escape — стандарт для модалок.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Слушатель paste, активен только при открытой модалке. Если в буфере есть картинка
  // (например, из инструмента «Ножницы» или Cmd+Shift+4) — кладём её в state.
  useEffect(() => {
    if (!open) return
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          e.preventDefault()
          const file = it.getAsFile()
          if (file) await loadFile(file)
          return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open])

  const loadFile = async (file: File) => {
    return new Promise<void>(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        // dataUrl = "data:image/png;base64,iVBORw0..."  — отрезаем mime-префикс.
        const comma = dataUrl.indexOf(',')
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
        setScreenshot(b64)
        setScreenshotType(file.type)
        resolve()
      }
      reader.onerror = () => resolve()
      reader.readAsDataURL(file)
    })
  }

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
  }

  const reset = () => {
    setTopic('SUGGESTION_HOW')
    setBody('')
    setScreenshot(null)
    setScreenshotType(null)
  }

  const submit = async () => {
    if (!body.trim()) {
      showToast('Опишите обращение текстом', 'error')
      return
    }
    setSending(true)
    try {
      const path = location.pathname + (location.search || '')
      await createFeedback({
        topic,
        body: body.trim(),
        page_path: path,
        screenshot,
        screenshot_type: screenshotType,
      })
      showToast('Обращение отправлено разработчику', 'success')
      setOpen(false)
      reset()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Не удалось отправить обращение'
      showToast(msg, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Плавающая кнопка в углу. Стиль повторяет тёмную палитру левого sidebar'а:
          фон #2c3e50 (как .app-sidebar), светлый текст, лёгкое свечение при hover.
          В покое opacity 0.7 — заметно, но не отвлекает; при наведении становится ярче. */}
      <button
        onClick={() => setOpen(true)}
        title="Связь с разработчиком"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 100,
          background: '#2c3e50', color: '#ecf0f1',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '8px 14px',
          fontSize: '0.9em', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
          opacity: 0.7, transition: 'opacity 0.12s, background 0.12s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = '1'
          // Оранжевый при hover — гармонирует с цветом супервизорских пунктов меню
          // и тематически выделяет «связь с разработчиком» как сервисную функцию.
          e.currentTarget.style.background = '#e67e22'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '0.7'
          e.currentTarget.style.background = '#2c3e50'
          e.currentTarget.style.color = '#ecf0f1'
        }}
      >
        💬 Связь с разработчиком
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => !sending && setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
            <h2>Связь с разработчиком</h2>
            <p style={{ color: '#7f8c8d', fontSize: '0.9em', marginTop: 0 }}>
              Опишите проблему или идею. Адрес страницы добавится автоматически — разработчик
              увидит, где это произошло. Можно вставить скриншот <kbd>Ctrl/Cmd+V</kbd> или загрузить файл.
            </p>

            <div className="form-group">
              <label>Тема *</label>
              <select value={topic} onChange={e => setTopic(e.target.value as FeedbackTopic)}>
                {ALL_FEEDBACK_TOPICS.map(t => (
                  <option key={t} value={t}>{FEEDBACK_TOPIC_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Описание *</label>
              <textarea
                ref={textareaRef}
                rows={5}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Опишите подробнее..."
              />
            </div>

            <div className="form-group">
              <label>Скриншот (необязательно)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept="image/*" onChange={onFileInput} style={{ width: 'auto' }} />
                {screenshot && (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => { setScreenshot(null); setScreenshotType(null) }}
                  >Убрать</button>
                )}
              </div>
              {screenshot && screenshotType && (
                <div style={{ marginTop: 8, padding: 4, border: '1px solid #ddd', borderRadius: 4, display: 'inline-block' }}>
                  <img
                    src={`data:${screenshotType};base64,${screenshot}`}
                    alt="Скриншот"
                    style={{ maxWidth: 360, maxHeight: 200, display: 'block' }}
                  />
                </div>
              )}
              <div style={{ fontSize: '0.78em', color: '#7f8c8d', marginTop: 4 }}>
                Подсказка: сделайте скриншот (Cmd+Shift+4 на Mac, Win+Shift+S на Windows)
                и нажмите Ctrl/Cmd+V в этом окне.
              </div>
            </div>

            <div style={{ fontSize: '0.78em', color: '#95a5a6', marginBottom: 8 }}>
              Будет отправлено: страница <code>{location.pathname + (location.search || '')}</code>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setOpen(false)} disabled={sending}>Отмена</button>
              <button className="btn-primary" onClick={submit} disabled={sending}>
                {sending ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
