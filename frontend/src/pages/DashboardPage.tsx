import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDashboard, getProblemOrders, type ProblemOrderCard, type ProblemOrdersResponse } from '../api/analytics'
import {
  getUpcomingSupplyRequests, SUPPLY_STATUS_LABELS, type SupplyRequest,
} from '../api/supplyRequests'

/** Период автообновления главной — Спринт B, Миша: «дашборд для руководителя
 *  должен сам обновляться, чтобы быть первым в курсе проблем». */
const AUTO_REFRESH_MS = 60_000

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
  // Плитка считает лидов, созданных СЕГОДНЯ, — ссылка тоже с фильтром по сегодня,
  // иначе в списке оказывались все лиды за всё время (0 на плитке → 6 в списке).
  { key: 'today_leads',        label: 'Новые лиды',
    link: `/orders?statuses=LEAD&dateField=created_at&dateFrom=${new Date().toISOString().slice(0, 10)}&dateTo=${new Date().toISOString().slice(0, 10)}` },
  { key: 'in_progress',        label: 'В работе',        link: '/orders?statuses=IN_PROGRESS,PARTIALLY_DONE' },
  { key: 'ready_for_delivery', label: 'Готовы к доставке', link: '/orders?statuses=DONE' },
  { key: 'total_active',       label: 'Активных всего',  link: `/orders?statuses=${ACTIVE_STATUSES}` },
  { key: 'overdue',            label: 'Просрочено',      link: `/orders?statuses=${ACTIVE_STATUSES}`,
    emphasizeColor: '#c0392b', hideIfZero: true },
  // «Висящие» — заказы старше 7 дней без даты забора. Подсвечиваем оранжевым.
  { key: 'stuck',              label: 'Висят (>7 дней без даты)',
    // stuck=true — тот же критерий, что у counter'а на бэке. Без него ссылка
    // показывала вообще все LEAD/CREATED: на плитке 2, в списке 6.
    link: `/orders?stuck=true`,
    emphasizeColor: '#d35400', hideIfZero: true },
  // «Без координат» — есть адрес, но lat/lon = NULL: оператор не видит точку на карте,
  // заказ может «потеряться». Красная подсветка, чтобы заметили и поправили адрес.
  { key: 'no_coords',          label: 'Без координат',
    link: `/orders?statuses=${ACTIVE_STATUSES}&noCoords=true`,
    emphasizeColor: '#c0392b', hideIfZero: true },
]

// Раньше тут жил PROBLEM_WIDGETS — голые счётчики проблемных заказов
// (просрочка / без даты / без адреса). Спринт B по совету Миши заменил их
// на детальные карточки: вместо «4» — список конкретных заказов с причиной,
// клиентом и адресом. Логика собирается прямо в JSX ниже через renderProblemColumn.

/** Кнопка-ссылка в заголовке секции Главной: «Все заказы», «Все заявки».
 *  Одна ширина — иначе блоки смотрятся сдвинутыми друг относительно друга. */
const dashboardActionBtn: React.CSSProperties = { width: 150, whiteSpace: 'nowrap' }

/** Заголовок секции — единый стиль для всех блоков Главной. */
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 'var(--font-sm)', color: '#95a5a6', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px 0',
}

/** Сколько строк показываем внутри одной проблемной колонки.
 *  Бэк отдаёт до 5, но Главная должна помещаться в экран — остальные
 *  доступны по ссылке «и ещё N». */
const PROBLEM_ROWS = 3

/** Столько же для блока закупок — остальное по ссылке «и ещё N». */
const SUPPLY_ROWS = 3

export default function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<Record<string, number>>({})
  const [problems, setProblems] = useState<ProblemOrdersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  /** V33: открытые заявки на закупку со сроком в ближайшие 7 дней. */
  const [supplyUpcoming, setSupplyUpcoming] = useState<SupplyRequest[]>([])

  useEffect(() => {
    let alive = true

    const fetchAll = async () => {
      try {
        const [d, p, sup] = await Promise.all([
          getDashboard(),
          getProblemOrders(),
          getUpcomingSupplyRequests(7).catch(() => [] as SupplyRequest[]),
        ])
        if (!alive) return
        setData(d)
        setProblems(p)
        setSupplyUpcoming(sup)
        setLastRefresh(new Date())
      } catch {
        // silent — на фоне обновляется; первый промах через 1 минуту попробует снова
      } finally {
        if (alive) setLoading(false)
      }
    }

    void fetchAll()
    // Автообновление раз в минуту — для отображения на отдельном мониторе
    // в офисе («дашборд статуса бизнеса»).
    const id = window.setInterval(fetchAll, AUTO_REFRESH_MS)
    return () => { alive = false; window.clearInterval(id) }
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
          // Компактнее прежнего (было 24/20 и цифра 32px): вся Главная должна
          // помещаться в экран без прокрутки — оператор смотрит её как сводку,
          // а не листает.
          padding: '12px 14px',
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
        <div style={{ color: '#7f8c8d', fontSize: 'var(--font-sm)', marginBottom: 2, letterSpacing: 0.2 }}>
          {w.label}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 600, lineHeight: 1.15, color: valueColor,
          fontVariantNumeric: 'tabular-nums',
          display: 'flex', alignItems: 'baseline', gap: 8,
        }}>
          {value}
          {isLeads && totalLeads > value && (
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 400, color: '#95a5a6' }}>
              / {totalLeads} всего
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 12 }}><h1 style={{ margin: 0 }}>Главная</h1></div>

      {/* Блоки 1 и 2 стоят рядом: «На сегодня» — это всего две плитки, и
          отдельной строкой они съедали высоту, из-за которой Главная не
          помещалась в экран. На узких экранах .dashboard-top разворачивается
          обратно в две строки (см. index.css). */}
      <div className="dashboard-top">
        {/* Блок 1: «На сегодня» — что физически нужно делать сегодня. */}
        <section data-tour="dashboard-today">
          <h2 style={SECTION_TITLE}>На сегодня</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 10,
          }}>
            {TODAY_WIDGETS.map(renderCard)}
          </div>
        </section>

        {/* Блок 2: «По статусам» — состояние пайплайна. */}
        <section data-tour="dashboard-statuses">
          <h2 style={SECTION_TITLE}>По статусам</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
          }}>
            {STATUS_WIDGETS.map(renderCard)}
          </div>
        </section>
      </div>

      {/* Блок 3: «Проблемные заказы» — теперь карточки с деталями (Спринт B).
          Не голые счётчики «4», а список из реальных карточек: номер, клиент,
          причина, дата. Клик — провалиться в заказ. */}
      <section data-tour="dashboard-problems" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 8px 0' }}>
          <h2 style={{ ...SECTION_TITLE, color: '#c0392b', margin: 0 }}>
            Проблемные заказы
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastRefresh && (
              <span style={{ fontSize: 'var(--font-sm)', color: '#95a5a6' }}>
                обновлено в {lastRefresh.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })} · авто-обновление каждую минуту
              </span>
            )}
            <button className="btn-secondary" style={dashboardActionBtn} onClick={() => navigate('/orders')}>
              Все заказы →
            </button>
          </div>
        </div>
        {(() => {
          if (!problems) return null
          const totalProblems =
            problems.overdue_actual.length +
            problems.unassigned_logistics.length +
            problems.bad_address.length +
            (problems.lost_in_delivery?.length ?? 0)
          if (totalProblems === 0) {
            return (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: '#eafaf1', color: '#27ae60', fontSize: 'var(--font-sm)',
              }}>
                ✓ Проблемных заказов нет
              </div>
            )
          }
          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 10,
            }}>
              {renderProblemColumn('Просрочка по факт. дате', problems.overdue_actual, data['overdue_actual'] ?? 0, navigate, '#c0392b',
                `/orders?statuses=${ACTIVE_STATUSES}&overdueActual=true`)}
              {renderProblemColumn('Не распределено в логистике', problems.unassigned_logistics, data['unassigned_logistics'] ?? 0, navigate, '#d35400',
                '/logistics')}
              {renderProblemColumn('Без адреса', problems.bad_address, data['bad_address'] ?? 0, navigate, '#c0392b',
                `/orders?statuses=FOR_PICKUP,DONE&badAddress=true`)}
              {/* V9: «Потеряно в доставке» — заказы с LOST-позициями.
                  Цвет багровый, чтобы отличался от «обычных» проблем (это уже факт),
                  оператор сразу понимает: нужно создать гарантию или согласовать с клиентом. */}
              {renderProblemColumn('Потеряно в доставке', problems.lost_in_delivery ?? [],
                data['lost_in_delivery'] ?? 0, navigate, '#8e44ad',
                `/orders?statuses=PARTIALLY_DELIVERED`)}
            </div>
          )
        })()}
      </section>

      {/* V33: открытые заявки на закупку со сроком в ближайшую неделю.
          Стоят под проблемными заказами — это тоже «горит», но по материалам,
          а не по заказам. Просроченные попадают сюда же и подсвечены красным.
          Блок показываем всегда: раньше он исчезал при пустом списке, и было
          непонятно — заявок нет или раздел куда-то делся. */}
      <section style={{ marginTop: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8, gap: 12, flexWrap: 'wrap',
        }}>
          <h2 style={{ ...SECTION_TITLE, color: '#d35400', margin: 0 }}>
            Закупки на ближайшую неделю
          </h2>
          <button className="btn-secondary" style={dashboardActionBtn} onClick={() => navigate('/supply')}>
            Все заявки →
          </button>
        </div>
        {supplyUpcoming.length === 0 ? (
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: '#eafaf1', color: '#27ae60', fontSize: 'var(--font-sm)',
          }}>
            ✓ Заявок на ближайшую неделю нет
          </div>
        ) : (
          <div className="card" style={{ borderLeft: '4px solid #d35400', padding: '6px 10px', marginBottom: 0 }}>
            {supplyUpcoming.slice(0, SUPPLY_ROWS).map(r => {
              const overdue = r.needed_by != null && r.needed_by < new Date().toISOString().slice(0, 10)
              return (
                <div
                  key={r.id}
                  onClick={() => navigate(`/supply?id=${r.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '5px 8px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', background: overdue ? '#fdedec' : 'transparent',
                    marginBottom: 2,
                  }}
                  title="Открыть эту заявку"
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{r.title}</span>
                    {r.quantity != null && (
                      <span style={{ color: 'var(--c-text-secondary)', marginLeft: 8 }}>
                        {r.quantity}{r.unit ? ' ' + r.unit : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginLeft: 8 }}>
                      {SUPPLY_STATUS_LABELS[r.status]}
                      {r.created_by_name && ` · ${r.created_by_name}`}
                    </span>
                  </div>
                  <div style={{
                    whiteSpace: 'nowrap', fontSize: 'var(--font-sm)',
                    color: overdue ? '#c0392b' : 'var(--c-text-secondary)',
                    fontWeight: overdue ? 600 : 400,
                  }}>
                    {r.needed_by && new Date(r.needed_by).toLocaleDateString('ru')}
                    {overdue && ' · просрочена'}
                  </div>
                </div>
              )
            })}
            {supplyUpcoming.length > SUPPLY_ROWS && (
              <button
                type="button"
                onClick={() => navigate('/supply')}
                style={{
                  background: 'none', border: 'none', color: '#d35400',
                  cursor: 'pointer', fontSize: 'var(--font-sm)', fontWeight: 500, padding: '2px 8px',
                }}
              >
                и ещё {supplyUpcoming.length - SUPPLY_ROWS} — открыть все →
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Колонка-карточка из категории проблемных заказов. Внутри: заголовок,
 * до N мини-строк с конкретными заказами (клик — к заказу), при остатке —
 * ссылка «и ещё X — все →» (клик к отфильтрованному списку).
 */
function renderProblemColumn(
  title: string,
  allRows: ProblemOrderCard[],
  total: number,
  navigate: ReturnType<typeof useNavigate>,
  color: string,
  fallbackLink: string,
) {
  if (allRows.length === 0) return null
  // Показываем не всё, что прислал бэк: Главная должна помещаться в экран.
  const rows = allRows.slice(0, PROBLEM_ROWS)
  const more = Math.max(0, total - rows.length)
  return (
    <div key={title} style={{
      background: '#fff',
      border: `1px solid ${color}33`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 10,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 'var(--font-sm)', fontWeight: 600, color }}>{title}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => navigate(`/orders/${r.id}`)}
            style={{
              textAlign: 'left',
              background: '#fafbfc',
              border: '1px solid #ecf0f1',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f0f6ff')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fafbfc')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--font-sm)', fontWeight: 500, color: '#2c3e50' }}>
                #{r.id} · {r.client_name}
              </span>
              {r.problem_date && (
                <span style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>
                  {new Date(r.problem_date).toLocaleDateString('ru')}
                </span>
              )}
            </div>
            {r.address && (
              <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginTop: 2, lineHeight: 1.2 }}>
                {r.address.length > 60 ? r.address.slice(0, 57) + '…' : r.address}
              </div>
            )}
          </button>
        ))}
      </div>
      {more > 0 && (
        <button
          type="button"
          onClick={() => navigate(fallbackLink)}
          style={{
            marginTop: 6,
            background: 'none',
            border: 'none',
            color,
            cursor: 'pointer',
            fontSize: 'var(--font-sm)',
            fontWeight: 500,
            padding: 0,
          }}
        >
          и ещё {more} — открыть все →
        </button>
      )}
    </div>
  )
}
