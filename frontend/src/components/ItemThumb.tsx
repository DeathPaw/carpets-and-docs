import { useEffect, useState } from 'react'
import { getItemPhotos, getItemsFirstPhotos, type ItemPhoto } from '../api/orders'

/**
 * Маленькое превью первого фото позиции для списков (Позиции, Заказы свёрнутые).
 * Сам подгружает фото; если их нет — рендерит ничего.
 *
 * Использует кэш в модуле, чтобы один и тот же itemId не качался дважды
 * между ререндерами и на разных страницах.
 */

interface Photo {
  id: number
  content_type: string
  data: string
}

const cache = new Map<number, Photo | null>()
const inflight = new Map<number, Promise<Photo | null>>()

/**
 * Предзагрузить превью для списка позиций одним батч-запросом — кладёт результат
 * в общий кэш ItemThumb. Списочные страницы (ItemsPage) вызывают это после загрузки
 * списка, чтобы каждый ItemThumb взял свой кадрик из кэша без N+1.
 */
export async function prefetchItemThumbs(itemIds: number[]) {
  const missing = itemIds.filter(id => !cache.has(id))
  if (missing.length === 0) return
  try {
    const arr = await getItemsFirstPhotos(missing)
    const byId = new Map<number, ItemPhoto>(arr.map(p => [p.order_item_id, p]))
    missing.forEach(id => {
      const p = byId.get(id)
      cache.set(id, p ? { id: p.id, content_type: p.content_type, data: p.data } : null)
    })
  } catch {
    // Если сервер недоступен — оставим кэш пустым; компонент всё равно сделает fallback-fetch.
  }
}

const fetchFirstPhoto = (orderId: number, itemId: number): Promise<Photo | null> => {
  if (cache.has(itemId)) return Promise.resolve(cache.get(itemId)!)
  const existing = inflight.get(itemId)
  if (existing) return existing
  const p = getItemPhotos(orderId, itemId)
    .then(arr => {
      const first = arr.length > 0 ? arr[0] as Photo : null
      cache.set(itemId, first)
      inflight.delete(itemId)
      return first
    })
    .catch(() => {
      cache.set(itemId, null)
      inflight.delete(itemId)
      return null
    })
  inflight.set(itemId, p)
  return p
}

interface Props {
  orderId: number
  itemId: number
  size?: number
  onClick?: (e: React.MouseEvent) => void
}

export default function ItemThumb({ orderId, itemId, size = 36, onClick }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(cache.get(itemId) ?? null)
  const [loaded, setLoaded] = useState<boolean>(cache.has(itemId))

  useEffect(() => {
    if (cache.has(itemId)) {
      setPhoto(cache.get(itemId)!)
      setLoaded(true)
      return
    }
    let cancelled = false
    fetchFirstPhoto(orderId, itemId).then(p => {
      if (!cancelled) { setPhoto(p); setLoaded(true) }
    })
    return () => { cancelled = true }
  }, [orderId, itemId])

  if (!loaded) {
    return <div style={{ width: size, height: size, background: '#f0f0f0', borderRadius: 4 }} />
  }
  if (!photo) return null
  return (
    <img
      src={`data:${photo.content_type};base64,${photo.data}`}
      alt=""
      onClick={onClick}
      style={{
        width: size, height: size, objectFit: 'cover', borderRadius: 4,
        border: '1px solid #ddd', flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    />
  )
}
