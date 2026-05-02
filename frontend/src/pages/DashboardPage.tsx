import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../api/analytics'

interface Widget {
  key: string
  label: string
  color: string
  bgColor: string
  onlyPositive?: boolean
  link: string
}

const WIDGETS: Widget[] = [
  { key: 'today_pickups', label: 'Сегодня забор', color: '#2c3e50', bgColor: '#ebf5fb', link: '/logistics' },
  { key: 'today_deliveries', label: 'Сегодня доставка', color: '#2c3e50', bgColor: '#eafaf1', link: '/logistics' },
  { key: 'in_progress', label: 'В работе', color: '#2c3e50', bgColor: '#fef9e7', link: '/orders?status=IN_PROGRESS' },
  { key: 'ready_for_delivery', label: 'Готовы к доставке', color: '#2c3e50', bgColor: '#eafaf1', link: '/orders?status=DONE' },
  { key: 'overdue', label: 'Просрочено', color: '#922b21', bgColor: '#fdedec', onlyPositive: true, link: '/orders' },
  { key: 'total_active', label: 'Активных заказов', color: '#2c3e50', bgColor: '#f4f6f7', link: '/orders' },
  { key: 'today_revenue', label: 'Выручка сегодня', color: '#1e8449', bgColor: '#eafaf1', link: '/orders' },
  { key: 'today_leads', label: 'Новых лидов', color: '#2c3e50', bgColor: '#ebf5fb', link: '/orders?status=LEAD' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Загрузка...</div>

  const visibleWidgets = WIDGETS.filter(w => !w.onlyPositive || (data[w.key] ?? 0) > 0)

  return (
    <div>
      <div className="page-header"><h1>Главная</h1></div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
      }}>
        {visibleWidgets.map(w => (
          <div
            key={w.key}
            onClick={() => navigate(w.link)}
            style={{
              background: w.bgColor,
              color: w.color,
              borderRadius: 10,
              padding: '24px 20px',
              textAlign: 'center',
              cursor: 'pointer',
              border: '1px solid #e0e0e0',
              transition: 'box-shadow 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>
              {w.key === 'today_revenue'
                ? `${(data[w.key] ?? 0).toLocaleString('ru')} \u20BD`
                : (data[w.key] ?? 0)}
            </div>
            <div style={{ fontSize: 14, marginTop: 8, opacity: 0.7 }}>{w.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
