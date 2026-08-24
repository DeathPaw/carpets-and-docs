import { useEffect, useState } from 'react'
import { getActiveBanners, type UpdateBanner } from '../api/updateBanners'
import { useEscapeClose } from '../hooks/useEscapeClose'

/**
 * V32: кнопка «Обновления» рядом с «Что делать?».
 *
 * Показывает баннеры из справочника: что починили, что появилось нового.
 * Содержимое настраивается в Справочниках → «Баннеры обновлений», поэтому
 * релизные заметки можно менять без правки кода.
 *
 * Точка на кнопке — если есть непрочитанные баннеры. «Прочитано» хранится
 * в localStorage по id: это подсказка одному человеку на его рабочем месте,
 * тащить ради неё таблицу на сервер незачем.
 */
const SEEN_KEY = 'updates_seen_ids'

function readSeen(): number[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] }
}

export default function UpdatesButton() {
  const [open, setOpen] = useState(false)
  const [banners, setBanners] = useState<UpdateBanner[]>([])
  const [seen, setSeen] = useState<number[]>(readSeen)
  useEscapeClose(open, () => setOpen(false))

  useEffect(() => {
    getActiveBanners().then(setBanners).catch(() => setBanners([]))
  }, [])

  const unread = banners.filter(b => !seen.includes(b.id)).length

  const openPopup = async () => {
    setOpen(true)
    // Перечитываем список при открытии: он грузится при монтировании Layout,
    // и баннер, добавленный в Справочниках позже, иначе не появлялся до перезагрузки
    // страницы — выглядело как «показывается только один».
    let fresh = banners
    try {
      fresh = await getActiveBanners()
      setBanners(fresh)
    } catch { /* оставляем то, что уже загружено */ }
    // Всё показанное считаем прочитанным — точка гаснет до следующего баннера.
    const ids = fresh.map(b => b.id)
    setSeen(ids)
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)) } catch { /* приватный режим */ }
  }

  return (
    <>
      <button
        onClick={() => void openPopup()}
        title="Что нового и что исправлено"
        style={{
          position: 'fixed', right: 358, bottom: 16, zIndex: 100,
          background: '#2980b9', color: '#fff',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '8px 14px',
          fontSize: '0.9em', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)', cursor: 'pointer',
          opacity: 0.85, transition: 'opacity 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.85' }}
      >
        🔔 Обновления
        {unread > 0 && (
          <span style={{
            display: 'inline-block', marginLeft: 6, minWidth: 18, padding: '0 5px',
            background: '#e74c3c', borderRadius: 9, fontSize: '0.8em', lineHeight: '18px',
          }}>{unread}</span>
        )}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)} style={{ zIndex: 1500 }}>
          {/* Заголовок и кнопка закреплены, прокручивается только список:
              баннеров может быть много, и «Понятно» не должно уезжать за экран. */}
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 640, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h2 style={{ margin: 0 }}>Обновления</h2>
              {banners.length > 1 && (
                <span style={{ color: 'var(--c-text-muted)', fontSize: '0.85em' }}>
                  {banners.length} сообщения
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', margin: '12px 0', minHeight: 0 }}>
              {banners.length === 0 ? (
                <div style={{ color: 'var(--c-text-muted)', padding: '16px 0' }}>
                  Пока нечего показать. Новые сообщения появятся здесь автоматически.
                </div>
              ) : banners.map(b => (
                <div key={b.id} style={{
                  border: '1px solid var(--c-border)', borderRadius: 'var(--radius)',
                  padding: '12px 14px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '1.02em' }}>{b.title}</strong>
                    {b.starts_on && (
                      <span style={{ color: 'var(--c-text-muted)', fontSize: '0.82em', whiteSpace: 'nowrap' }}>
                        {new Date(b.starts_on).toLocaleDateString('ru')}
                      </span>
                    )}
                  </div>
                  {/* Текст баннера — обычный многострочный текст из справочника,
                      переносы сохраняем как есть. */}
                  <div style={{
                    marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.55,
                    fontSize: '0.93em', color: 'var(--c-text)',
                  }}>{b.body}</div>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button className="btn-primary" onClick={() => setOpen(false)}>Понятно</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
