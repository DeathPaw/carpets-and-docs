import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { createFeedback } from '../api/feedback'
import { ALL_FEEDBACK_TOPICS, FEEDBACK_TOPIC_LABELS } from '../constants/feedback'
import { useToast } from './Toast'
import Tiles from './Tiles'
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
  // V27: несколько скриншотов на обращение — одной картинки не хватало, чтобы
  // показать последовательность действий. base64 хранится без data:-префикса.
  const [shots, setShots] = useState<{ data: string; contentType: string; name: string }[]>([])
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const MAX_SHOTS = 10

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
        setShots(prev => prev.length >= MAX_SHOTS
          ? prev
          : [...prev, { data: b64, contentType: file.type || 'image/png', name: file.name || 'скриншот' }])
        resolve()
      }
      reader.onerror = () => resolve()
      reader.readAsDataURL(file)
    })
  }

  /** Поддерживаем выбор сразу нескольких файлов (input multiple). */
  const onFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const free = MAX_SHOTS - shots.length
    if (files.length > free) {
      showToast(`Можно приложить не больше ${MAX_SHOTS} скриншотов`, 'error')
    }
    for (const f of files.slice(0, Math.max(free, 0))) await loadFile(f)
    // Сбрасываем input, иначе повторный выбор того же файла не сработает.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeShot = (idx: number) => setShots(prev => prev.filter((_, i) => i !== idx))

  const reset = () => {
    setTopic('SUGGESTION_HOW')
    setBody('')
    setShots([])
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
        screenshots: shots.map(s => ({ data: s.data, content_type: s.contentType })),
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
              <Tiles<FeedbackTopic>
                options={ALL_FEEDBACK_TOPICS.map(t => ({ value: t, label: FEEDBACK_TOPIC_LABELS[t] }))}
                value={topic}
                onChange={setTopic}
              />
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
              <label>Скриншоты (необязательно) {shots.length > 0 && `· ${shots.length} из ${MAX_SHOTS}`}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onFileInput}
                  disabled={shots.length >= MAX_SHOTS}
                  style={{ width: 'auto' }}
                />
                {shots.length > 0 && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setShots([])}>
                    Убрать все
                  </button>
                )}
              </div>
              {shots.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {shots.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'relative', padding: 4, border: '1px solid #ddd',
                        borderRadius: 4, background: '#fff',
                      }}
                    >
                      <img
                        src={`data:${s.contentType};base64,${s.data}`}
                        alt={s.name}
                        style={{ width: 120, height: 84, objectFit: 'cover', display: 'block', borderRadius: 2 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeShot(i)}
                        title="Удалить этот скриншот"
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 22, height: 22, borderRadius: '50%',
                          border: '1px solid #e74c3c', background: '#fff', color: '#e74c3c',
                          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
                        }}
                      >&times;</button>
                      <div style={{
                        fontSize: '0.7em', color: '#95a5a6', marginTop: 2, maxWidth: 120,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{s.name}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '0.78em', color: '#7f8c8d', marginTop: 4 }}>
                Можно выбрать сразу несколько файлов или добавлять по одному.
                Либо сделайте скриншот (Cmd+Shift+4 на Mac, Win+Shift+S на Windows)
                и нажмите Ctrl/Cmd+V в этом окне — он добавится к списку.
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
