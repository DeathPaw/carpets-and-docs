import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'

interface Notification {
  id: number
  type: string
  message: string
  entity_type: string
  entity_id: number
  is_read: boolean
  created_at: string
}

/**
 * V11: колокольчик уведомлений — фиксированный в правом верхнем углу.
 * Подписывается на SSE /api/events, при new_notification инкрементирует счётчик.
 * Клик → dropdown со списком непрочитанных.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Initial load
  const loadNotifications = async () => {
    try {
      const res = await client.get<{ items: Notification[]; unread_count: number }>('/api/notifications')
      setItems(res.data.items)
      setCount(res.data.unread_count)
    } catch {}
  }

  useEffect(() => {
    void loadNotifications()
    // SSE subscription
    const token = sessionStorage.getItem('auth')
    if (!token) return
    const es = new EventSource(`/api/events`)
    es.addEventListener('new_notification', () => {
      setCount(c => c + 1)
      void loadNotifications()
    })
    es.addEventListener('data_changed', () => {
      // Broadcast: другой пользователь изменил данные — можно refetch
    })
    return () => es.close()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markRead = async (id: number) => {
    await client.post(`/api/notifications/${id}/read`)
    setItems(prev => prev.filter(n => n.id !== id))
    setCount(c => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    await client.post('/api/notifications/read-all')
    setItems([])
    setCount(0)
  }

  const navigate_to = (n: Notification) => {
    void markRead(n.id)
    setOpen(false)
    if (n.entity_type === 'ORDER' && n.entity_id) navigate(`/orders/${n.entity_id}`)
  }

  return (
    <div ref={ref} style={{ position: 'fixed', top: 12, right: 70, zIndex: 1100 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', background: 'transparent', border: 'none',
          width: 40, height: 40, cursor: 'pointer', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Уведомления"
      >
        🔔
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: '#e74c3c', color: '#fff', fontSize: 'var(--font-sm)', fontWeight: 700,
            borderRadius: '50%', minWidth: 16, height: 16, lineHeight: '16px',
            textAlign: 'center', padding: '0 4px',
          }}>{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 48, right: 0, width: 360,
          background: '#fff', border: '1px solid #ddd', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)', maxHeight: 400, overflowY: 'auto',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderBottom: '1px solid #eee',
          }}>
            <strong>Уведомления</strong>
            {items.length > 0 && (
              <button onClick={markAllRead} style={{
                background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', fontSize: 'var(--font-sm)',
              }}>Прочитать все</button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Нет новых уведомлений</div>
          ) : items.map(n => (
            <div
              key={n.id}
              onClick={() => navigate_to(n)}
              style={{
                padding: '10px 14px', borderBottom: '1px solid #f5f5f5',
                cursor: 'pointer', fontSize: 'var(--font-sm)',
              }}
            >
              <div>{n.message}</div>
              <div style={{ fontSize: 'var(--font-sm)', color: '#888', marginTop: 2 }}>
                {new Date(n.created_at).toLocaleString('ru')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
