import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getOrderItemById, getOrder, getItemPhotos } from '../api/orders'
import { getItemServices } from '../api/services'
import type { OrderItem, OrderItemService, Order } from '../types'

const ITEM_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана', IN_PROGRESS: 'В работе', PARTIALLY_DONE: 'Частично готова',
  DONE: 'Готова', CANCELLED: 'Отменена',
}
const SERVICE_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана', IN_PROGRESS: 'В работе', DONE: 'Готова', CANCELLED: 'Отменена',
}

interface Photo {
  id: number
  filename: string
  content_type: string
  data: string
  created_at: string
}

/**
 * Страница одной позиции — компактная карточка для оператора/мастера, кому
 * не нужен весь контекст заказа: только этот ковер.
 * Кнопка «В заказ» — для перехода в полную карточку заказа.
 */
export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const itemId = Number(id)
  const navigate = useNavigate()

  const [item, setItem] = useState<OrderItem | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [services, setServices] = useState<OrderItemService[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    let cancelled = false

    ;(async () => {
      try {
        const it = await getOrderItemById(itemId)
        if (cancelled) return
        setItem(it)
        const [ord, srv, pts] = await Promise.all([
          getOrder(it.order_id),
          getItemServices(it.order_id, it.id),
          getItemPhotos(it.order_id, it.id).catch(() => []),
        ])
        if (cancelled) return
        setOrder(ord)
        setServices(srv)
        setPhotos(pts as Photo[])
      } catch (e: unknown) {
        if (!cancelled) setError((e as any)?.response?.data?.message || 'Не удалось загрузить позицию')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [itemId])

  if (loading) return <div className="loading">Загрузка...</div>
  if (error) return <div className="error-msg">{error}</div>
  if (!item) return <div className="error-msg">Позиция не найдена</div>

  const dimensions: string[] = []
  if (item.length != null && item.width != null) dimensions.push(`${item.length} × ${item.width} м`)
  else if (item.length != null) dimensions.push(`${item.length} м`)
  if (item.weight != null) dimensions.push(`${item.weight} кг`)
  if (item.area != null && (item.length == null || item.width == null)) dimensions.push(`${item.area} м²`)
  if (item.running_meters != null) dimensions.push(`${item.running_meters} пог.м`)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Позиция #{item.id}</h1>
        <span className={`badge badge-${item.status.toLowerCase()}`}>
          {ITEM_STATUS_LABELS[item.status] ?? item.status}
        </span>
        <button
          className="btn-primary"
          onClick={() => navigate(`/orders/${item.order_id}`)}
          style={{ marginLeft: 'auto' }}
        >
          → Перейти в заказ #{String(item.order_id).padStart(5, '0')}
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <div style={{ color: '#666', fontSize: '0.85em', marginBottom: 4 }}>Тип</div>
            <div style={{ fontSize: '1.1em' }}>{item.item_type_name || `Тип #${item.item_type_id}`}</div>
          </div>
          <div>
            <div style={{ color: '#666', fontSize: '0.85em', marginBottom: 4 }}>Размеры</div>
            <div style={{ fontSize: '1.1em' }}>{dimensions.length > 0 ? dimensions.join(' · ') : '(не указаны)'}</div>
          </div>
          {order && (
            <>
              <div>
                <div style={{ color: '#666', fontSize: '0.85em', marginBottom: 4 }}>Клиент</div>
                <div style={{ fontSize: '1.1em' }}>{order.client_name}</div>
              </div>
              <div>
                <div style={{ color: '#666', fontSize: '0.85em', marginBottom: 4 }}>Заказ создан</div>
                <div style={{ fontSize: '1.1em' }}>{new Date(order.created_at).toLocaleDateString('ru')}</div>
              </div>
            </>
          )}
        </div>

        {item.description && (
          <div style={{ marginBottom: 8 }}>
            <strong>Описание:</strong> {item.description}
          </div>
        )}
        {item.defects && (
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: '#e67e22' }}>Дефекты:</strong> {item.defects}
          </div>
        )}
        <div>
          <strong>Стоимость позиции:</strong> {Number(item.price).toFixed(2)} ₽
        </div>
      </div>

      {/* Услуги по позиции */}
      <div className="card">
        <h2>Услуги</h2>
        {services.length === 0 ? (
          <div className="empty">Услуг нет</div>
        ) : (
          <table>
            <thead>
              <tr><th>Услуга</th><th>Статус</th><th>Цена</th><th>Исполнители</th></tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id}>
                  <td>{s.service_def_name}</td>
                  <td>
                    <span className={`badge badge-${s.status.toLowerCase()}`}>
                      {SERVICE_STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </td>
                  <td>{Number(s.price).toFixed(2)} ₽</td>
                  <td>
                    {s.assignees && s.assignees.length > 0
                      ? s.assignees.map(a => a.name).join(', ')
                      : <span style={{ color: '#888' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Фото */}
      <div className="card">
        <h2>Фото ({photos.length})</h2>
        {photos.length === 0 ? (
          <div className="empty">Фото нет</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {photos.map(p => (
              <img
                key={p.id}
                src={`data:${p.content_type};base64,${p.data}`}
                alt={p.filename}
                style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
              />
            ))}
          </div>
        )}
        <div style={{ marginTop: 8, color: '#888', fontSize: '0.85em' }}>
          Добавление и удаление фото — в карточке заказа.
        </div>
      </div>
    </div>
  )
}
