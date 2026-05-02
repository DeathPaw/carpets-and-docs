import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProductionQueue } from '../api/analytics'

interface QueueItem {
  order_id: number
  client_name: string
  status: string
  created_at: string
  total_amount: number
  pickup_district: string
  items_count: number
  services_count: number
  services_done: number
}

const STATUS_LABELS: Record<string, string> = {
  FOR_PICKUP: 'К забору',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готово',
}

const COLUMN_COLORS: Record<string, string> = {
  FOR_PICKUP: '#17a2b8',
  IN_PROGRESS: '#f39c12',
  PARTIALLY_DONE: '#e67e22',
}

const COLUMNS: string[] = ['FOR_PICKUP', 'IN_PROGRESS', 'PARTIALLY_DONE']

export default function ProductionPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProductionQueue()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Загрузка...</div>

  return (
    <div>
      <div className="page-header"><h1>Производство</h1></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, alignItems: 'flex-start' }}>
        {COLUMNS.map(status => {
          const col = items.filter(i => i.status === status).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          return (
            <div key={status}>
              <div style={{
                background: COLUMN_COLORS[status],
                color: '#fff',
                padding: '10px 16px',
                borderRadius: '8px 8px 0 0',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span>{STATUS_LABELS[status]}</span>
                <span style={{ opacity: 0.8 }}>{col.length}</span>
              </div>
              <div style={{ background: '#f8f9fa', borderRadius: '0 0 8px 8px', padding: 8, minHeight: 200 }}>
                {col.length === 0 ? (
                  <div style={{ color: '#999', textAlign: 'center', padding: 24 }}>Нет заказов</div>
                ) : col.map(item => (
                  <div
                    key={item.order_id}
                    onClick={() => navigate(`/orders/${item.order_id}`)}
                    style={{
                      background: '#fff',
                      borderRadius: 6,
                      padding: '10px 12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      borderLeft: `4px solid ${COLUMN_COLORS[status]}`,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>#{String(item.order_id).padStart(5, '0')}</strong>
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {new Date(item.created_at).toLocaleDateString('ru')}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{item.client_name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                      <span>{item.items_count} поз.</span>
                      <span style={{
                        color: item.services_done === item.services_count ? '#27ae60' : '#f39c12',
                        fontWeight: 600,
                      }}>
                        {item.services_done}/{item.services_count} услуг
                      </span>
                    </div>
                    {item.pickup_district && (
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{item.pickup_district}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
