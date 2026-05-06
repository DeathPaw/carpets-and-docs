import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard } from '../api/analytics'

interface Widget {
  key: string
  label: string
  link: string
  /** Подсветка значения, если оно > 0 — например, для просрочки. */
  emphasizeColor?: string
  /** Скрывать карточку, если значение = 0 (например, «просрочка»). */
  hideIfZero?: boolean
}

// Все «активные» статусы — заказ ещё не закрыт.
const ACTIVE_STATUSES = 'LEAD,CREATED,FOR_PICKUP,IN_PROGRESS,PARTIALLY_DONE,DONE'

const TODAY_WIDGETS: Widget[] = [
  { key: 'today_pickups',    label: 'Сегодня забор',    link: '/logistics' },
  { key: 'today_deliveries', label: 'Сегодня доставка', link: '/logistics' },
]

const STATUS_WIDGETS: Widget[] = [
  // «Новых сегодня (47 всего)» — формат собирается ниже специально для этого виджета.
  { key: 'today_leads',        label: 'Новые лиды',      link: '/orders?statuses=LEAD' },
  { key: 'in_progress',        label: 'В работе',        link: '/orders?statuses=IN_PROGRESS,PARTIALLY_DONE' },
  { key: 'ready_for_delivery', label: 'Готовы к доставке', link: '/orders?statuses=DONE' },
  { key: 'total_active',       label: 'Активных всего',  link: `/orders?statuses=${ACTIVE_STATUSES}` },
  { key: 'overdue',            label: 'Просрочено',      link: `/orders?statuses=${ACTIVE_STATUSES}`,
    emphasizeColor: '#c0392b', hideIfZero: true },
  // «Висящие» — заказы старше 7 дней без даты забора. Подсвечиваем оранжевым.
  { key: 'stuck',              label: 'Висят (>7 дней без даты)',
    link: `/orders?statuses=LEAD,CREATED`,
    emphasizeColor: '#d35400', hideIfZero: true },
  // «Без координат» — есть адрес, но lat/lon = NULL: оператор не видит точку на карте,
  // заказ может «потеряться». Красная подсветка, чтобы заметили и поправили адрес.
  { key: 'no_coords',          label: 'Без координат',
    link: `/orders?statuses=${ACTIVE_STATUSES}&noCoords=true`,
    emphasizeColor: '#c0392b', hideIfZero: true },
]

// Виджеты блока «Проблемные заказы» — нижняя часть Главной.
// Все скрываются при значении 0 и подсвечиваются красным (требуют немедленного внимания).
// Ссылки используют флаги-параметры (`overdueActual`, `badAddress`), которые повторяют
// логику бэкенда DashboardRepository — иначе клик по виджету «2 заказа» открывал
// все 4 активных, потому что фильтра на странице не было.
const PROBLEM_WIDGETS: Widget[] = [
  // Фактическая дата уже прошла, а заказ не закрыт.
  { key: 'overdue_actual', label: 'Просрочка по факт. дате',
    link: `/orders?statuses=${ACTIVE_STATUSES}&overdueActual=true`,
    emphasizeColor: '#c0392b', hideIfZero: true },
  // Статус FOR_PICKUP/DONE, но в логистике слот не назначен → ничего не запланировано.
  { key: 'unassigned_logistics', label: 'Не распределено в логистике',
    link: '/logistics',
    emphasizeColor: '#d35400', hideIfZero: true },
  // Пора забирать/доставлять, но адреса вообще нет → не знаем куда ехать.
  { key: 'bad_address', label: 'Без адреса (FOR_PICKUP/DONE)',
    link: `/orders?statuses=FOR_PICKUP,DONE&badAddress=true`,
    emphasizeColor: '#c0392b', hideIfZero: true },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDashboard().then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Загрузка...</div>

  const renderCard = (w: Widget) => {
    const value = data[w.key] ?? 0
    if (w.hideIfZero && value === 0) return null
    const valueColor = w.emphasizeColor && value > 0 ? w.emphasizeColor : '#2c3e50'
    // Для виджета лидов формат «Х новых сегодня (Y всего)» — оператор сразу понимает,
    // сколько новых обращений именно сегодня, и не пугается общей суммы.
    const isLeads = w.key === 'today_leads'
    const totalLeads = data['total_leads'] ?? 0
    return (
      <div
        key={w.key}
        onClick={() => navigate(w.link)}
        className="dashboard-card"
        style={{
          background: '#fff',
          border: '1px solid #e6e9ec',
          borderRadius: 10,
          padding: '24px 20px',
          cursor: 'pointer',
          transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
          textAlign: 'left',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#bcd4e6'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(44, 62, 80, 0.08)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#e6e9ec'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'none'
        }}
      >
        <div style={{ color: '#7f8c8d', fontSize: 13, marginBottom: 8, letterSpacing: 0.2 }}>
          {w.label}
        </div>
        <div style={{
          fontSize: 32, fontWeight: 600, lineHeight: 1.1, color: valueColor,
          fontVariantNumeric: 'tabular-nums',
          display: 'flex', alignItems: 'baseline', gap: 8,
        }}>
          {value}
          {isLeads && totalLeads > value && (
            <span style={{ fontSize: 14, fontWeight: 400, color: '#95a5a6' }}>
              / {totalLeads} всего
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header"><h1>Главная</h1></div>

      {/* Блок 1: «На сегодня» — что физически нужно делать сегодня. */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{
          fontSize: 14, color: '#95a5a6', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 12px 0',
        }}>
          На сегодня
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}>
          {TODAY_WIDGETS.map(renderCard)}
        </div>
      </section>

      {/* Блок 2: «По статусам» — состояние пайплайна. */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{
          fontSize: 14, color: '#95a5a6', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 12px 0',
        }}>
          По статусам
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {STATUS_WIDGETS.map(renderCard)}
        </div>
      </section>

      {/* Блок 3: «Проблемные заказы» — карточки исчезают, когда показывать нечего.
          Если все три счётчика = 0, секция целиком пуста (карточек нет).
          Раздел всегда отрендерен с заголовком — оператор видит, что блок «здоров». */}
      {(() => {
        const visibleProblems = PROBLEM_WIDGETS.filter(w => (data[w.key] ?? 0) > 0)
        return (
          <section>
            <h2 style={{
              fontSize: 14, color: '#c0392b', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 12px 0',
            }}>
              Проблемные заказы
            </h2>
            {visibleProblems.length === 0 ? (
              <div style={{
                padding: '14px 18px', borderRadius: 10,
                background: '#eafaf1', color: '#27ae60', fontSize: 14,
              }}>
                ✓ Проблемных заказов нет
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
              }}>
                {PROBLEM_WIDGETS.map(renderCard)}
              </div>
            )}
          </section>
        )
      })()}
    </div>
  )
}
