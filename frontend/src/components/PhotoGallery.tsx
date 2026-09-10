import { useEffect, useState } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'

export interface GalleryPhoto {
  id: number
  content_type: string
  data: string
  filename?: string
}

/**
 * Правка №8 (09.09): фото ковра в полном размере.
 *
 * Производство открывает его из превью на карточке — не заходя в заказ. Фото
 * любого этапа (до обработки, в процессе, после) лежат в одном списке, листаются
 * стрелками ← → и лентой миниатюр внизу. Esc или клик мимо окна — закрыть.
 */
export default function PhotoGallery({ title, photos, loading, onClose }: {
  title: string
  photos: GalleryPhoto[]
  loading?: boolean
  onClose: () => void
}) {
  const [index, setIndex] = useState(0)
  useEscapeClose(true, onClose)

  // Новый набор фото — с первого кадра.
  useEffect(() => { setIndex(0) }, [photos])

  useEffect(() => {
    if (photos.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex(i => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setIndex(i => (i - 1 + photos.length) % photos.length)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [photos.length])

  const current = photos[index]
  const step = (d: number) => setIndex(i => (i + d + photos.length) % photos.length)

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1400 }}>
      <div className="photo-gallery" onClick={e => e.stopPropagation()}>
        <div className="photo-gallery-head">
          <strong>{title}</strong>
          {photos.length > 1 && <span className="photo-gallery-count">{index + 1} из {photos.length}</span>}
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
        <div className="photo-gallery-stage">
          {loading ? (
            <span className="photo-gallery-empty">Загрузка…</span>
          ) : !current ? (
            <span className="photo-gallery-empty">Фото нет</span>
          ) : (
            <img src={`data:${current.content_type};base64,${current.data}`} alt={current.filename || ''} />
          )}
          {photos.length > 1 && (
            <>
              <button className="photo-nav prev" onClick={() => step(-1)} aria-label="Предыдущее фото">‹</button>
              <button className="photo-nav next" onClick={() => step(1)} aria-label="Следующее фото">›</button>
            </>
          )}
        </div>
        {photos.length > 1 && (
          <div className="photo-gallery-strip">
            {photos.map((p, i) => (
              <img
                key={p.id}
                src={`data:${p.content_type};base64,${p.data}`}
                alt=""
                className={i === index ? 'active' : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
