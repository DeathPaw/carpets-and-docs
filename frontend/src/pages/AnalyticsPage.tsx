import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getOrdersByDistrict, getOrdersByStatus, getItemsByType, getEmployeeStats, getRevenueByMonth, getTopClients, getWarrantyStats, getMarginAnalysis } from '../api/analytics'
import { getEmployeeServices } from '../api/employees'
import SpbDistrictMap from '../components/SpbDistrictMap'
import { ORDER_STATUS_LABELS } from '../constants/statuses'

// На графике «активных» статусов используем общий справочник переводов из constants/statuses.
// Раньше был локальный неполный — для COMPLETED не было перевода и в pie-chart
// светилось английское «COMPLETED: 1».
const STATUS_LABELS: Record<string, string> = ORDER_STATUS_LABELS

const STATUS_COLORS: Record<string, string> = {
  LEAD: '#b0bec5', CREATED: '#7fb8e8', FOR_PICKUP: '#7ec8d4',
  IN_PROGRESS: '#f0c87a', PARTIALLY_DONE: '#e8b87a', DONE: '#7fd4a8',
}

const PIE_COLORS = ['#7fb8e8', '#e8a0a0', '#7fd4a8', '#f0c87a', '#c4a0d8', '#7fd8cc', '#e8b87a', '#8a9baa']

const LABEL_TO_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_LABELS).map(([k, v]) => [v, k])
)

const MONTH_LABELS: Record<string, string> = {
  '01': 'Янв', '02': 'Фев', '03': 'Мар', '04': 'Апр', '05': 'Май', '06': 'Июн',
  '07': 'Июл', '08': 'Авг', '09': 'Сен', '10': 'Окт', '11': 'Ноя', '12': 'Дек',
}

export default function AnalyticsPage() {
  const [districtData, setDistrictData] = useState<{district: string, count: number, total: number}[]>([])
  const [statusData, setStatusData] = useState<{status: string, count: number}[]>([])
  const [typeData, setTypeData] = useState<{type_name: string, count: number}[]>([])
  const [employeeData, setEmployeeData] = useState<{employee_id: number, name: string, services_done: number, total_earned: number}[]>([])
  // V7: модалка «карточка сотрудника» — клик по столбцу открывает список услуг за период.
  const [employeeCard, setEmployeeCard] = useState<{ employeeId: number, name: string } | null>(null)
  const [employeeCardServices, setEmployeeCardServices] = useState<any[]>([])
  const [employeeCardLoading, setEmployeeCardLoading] = useState(false)
  const [revenueData, setRevenueData] = useState<{month: string, orders_count: number, revenue: number}[]>([])
  const [topClients, setTopClients] = useState<{client_id: number, name: string, client_type: string, orders_count: number, total_spent: number}[]>([])
  const [warrantyData, setWarrantyData] = useState<{client_id: number, client_name: string, total_orders: number, warranty_orders: number, warranty_percent: number}[]>([])
  const [marginData, setMarginData] = useState<{service_name: string, count: number, revenue: number, cost: number}[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  // useAuth удалён — теперь карточка сотрудника доступна и операторам тоже (читает services без редиректа).
  // V8: пикер периода. По умолчанию — за всё время (пустые даты). Пресеты: текущий месяц / 7 дней / 30 дней / 3 месяца.
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  /** Установить пресет диапазона. Пустые даты = за всё время. */
  const setPreset = (preset: 'all' | 'current_month' | 'last_7' | 'last_30' | 'last_90') => {
    const today = new Date()
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    if (preset === 'all')           { setDateFrom(''); setDateTo(''); return }
    if (preset === 'current_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      setDateFrom(fmt(first)); setDateTo(fmt(today)); return
    }
    const back = (days: number) => fmt(new Date(today.getTime() - days * 86400000))
    setDateTo(fmt(today))
    if (preset === 'last_7')  setDateFrom(back(7))
    if (preset === 'last_30') setDateFrom(back(30))
    if (preset === 'last_90') setDateFrom(back(90))
  }

  useEffect(() => {
    setLoading(true)
    const p = { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }
    Promise.all([
      getOrdersByDistrict(p).then(setDistrictData).catch(() => {}),
      getOrdersByStatus(p).then(setStatusData).catch(() => {}),
      getItemsByType(p).then(setTypeData).catch(() => {}),
      getEmployeeStats(p).then(setEmployeeData).catch(() => {}),
      getRevenueByMonth(p).then(setRevenueData).catch(() => {}),
      getTopClients(p).then(setTopClients).catch(() => {}),
      getWarrantyStats(p).then(setWarrantyData).catch(() => {}),
      getMarginAnalysis(p).then(setMarginData).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  if (loading) return <div className="loading">Загрузка аналитики...</div>

  const statusChartData = statusData.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || '#95a5a6',
  }))

  const typeChartData = typeData.map(t => ({ name: t.type_name, value: t.count }))

  // V6: сохраняем raw month ('YYYY-MM') чтобы по клику собрать диапазон.
  const revenueChartData = [...revenueData].reverse().map(r => ({
    month: MONTH_LABELS[r.month.split('-')[1]] || r.month,
    raw_month: r.month,
    revenue: Number(r.revenue),
    orders: r.orders_count,
  }))

  const mapData = districtData.map(d => ({
    district: d.district, count: d.count, sum: Number(d.total),
  }))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1>Аналитика</h1>
        {/* V8: переключатель периода. Пресеты + ручной диапазон c/по.
            Кнопки-пресеты той же высоты, что поля даты рядом (--control-h):
            btn-sm давал заметно более низкую кнопку, и строка выглядела рваной. */}
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px', margin: 0 }}>
          <strong style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>Период:</strong>
          <button className="btn-secondary btn-sm btn-control-h" onClick={() => setPreset('all')} style={{ fontWeight: !dateFrom && !dateTo ? 700 : 400 }}>Всё время</button>
          <button className="btn-secondary btn-sm btn-control-h" onClick={() => setPreset('current_month')}>Текущий месяц</button>
          <button className="btn-secondary btn-sm btn-control-h" onClick={() => setPreset('last_7')}>7 дней</button>
          <button className="btn-secondary btn-sm btn-control-h" onClick={() => setPreset('last_30')}>30 дней</button>
          <button className="btn-secondary btn-sm btn-control-h" onClick={() => setPreset('last_90')}>3 месяца</button>
          <span style={{ borderLeft: '1px solid #ddd', height: 'var(--control-h)', margin: '0 6px' }} />
          <label style={{ fontSize: 'var(--font-sm)', display: 'inline-flex', gap: 4, alignItems: 'center', height: 'var(--control-h)' }}>
            с <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140, height: 'var(--control-h)' }} />
          </label>
          <label style={{ fontSize: 'var(--font-sm)', display: 'inline-flex', gap: 4, alignItems: 'center', height: 'var(--control-h)' }}>
            по <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140, height: 'var(--control-h)' }} />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Карта районов */}
        <div className="card" data-tour="analytics-district-map">
          <h2 style={{ marginTop: 0 }}>Заказы по районам</h2>
          <SpbDistrictMap data={mapData} onDistrictClick={(district) => navigate('/logistics?district=' + encodeURIComponent(district))} />
        </div>

        {/* Статусы заказов */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Активные заказы по статусам</h2>
          {statusChartData.length === 0 ? <div className="empty">Нет данных</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusChartData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                  onClick={(_: unknown, index: number) => { const label = statusChartData[index]?.name; const status = LABEL_TO_STATUS[label]; if (status) navigate('/orders?status=' + status); }}
                  style={{ cursor: 'pointer' }}
                >
                  {statusChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Типы позиций */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Типы позиций</h2>
          {typeChartData.length === 0 ? <div className="empty">Нет данных</div> : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={typeChartData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                  onClick={(_: unknown, index: number) => { const typeName = typeChartData[index]?.name; if (typeName) navigate('/items?type=' + encodeURIComponent(typeName)); }}
                  style={{ cursor: 'pointer' }}
                >
                  {typeChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Производительность сотрудников */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            Производительность сотрудников <span style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', fontWeight: 'normal' }}>(клик — карточка услуг)</span>
          </h2>
          {employeeData.length === 0 ? <div className="empty">Нет данных</div> : (
            <ResponsiveContainer width="100%" height={Math.max(200, employeeData.length * 40)}>
              <BarChart data={employeeData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 'var(--font-sm)' }} />
                <Tooltip formatter={(value, name) => [name === 'services_done' ? `${value} услуг` : `${value} ₽`, name === 'services_done' ? 'Выполнено' : 'Заработано']} />
                <Bar
                  dataKey="services_done"
                  fill="#7fb8e8"
                  name="Выполнено услуг"
                  style={{ cursor: 'pointer' }}
                  onClick={(_: unknown, index: number) => {
                    const emp = employeeData[index]
                    if (!emp) return
                    // По умолчанию открываем карточку за период из шапки. Если период пустой —
                    // показываем за текущий месяц (per #7 «учитывать только текущий месяц»).
                    let from = dateFrom, to = dateTo
                    if (!from && !to) {
                      const today = new Date()
                      const first = new Date(today.getFullYear(), today.getMonth(), 1)
                      const fmt = (d: Date) => d.toISOString().slice(0, 10)
                      from = fmt(first); to = fmt(today)
                    }
                    setEmployeeCard({ employeeId: emp.employee_id, name: emp.name })
                    setEmployeeCardLoading(true)
                    getEmployeeServices(emp.employee_id, 'DONE', from || undefined, to || undefined)
                      .then(setEmployeeCardServices)
                      .catch(() => setEmployeeCardServices([]))
                      .finally(() => setEmployeeCardLoading(false))
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Выручка по месяцам — полная ширина. V6: клик по месяцу → заказы за этот месяц. */}
      <div className="card" data-tour="analytics-revenue" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Выручка по месяцам <span style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', fontWeight: 'normal' }}>(клик по столбцу — заказы за месяц)</span></h2>
        {revenueChartData.length === 0 ? <div className="empty">Нет данных</div> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueChartData}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toFixed(0)} ₽`} />
              <Bar
                dataKey="revenue"
                fill="#7fd4a8"
                name="Выручка"
                style={{ cursor: 'pointer' }}
                onClick={(_: unknown, index: number) => {
                  const raw = revenueChartData[index]?.raw_month
                  if (!raw) return
                  // 'YYYY-MM' → диапазон от первого до последнего числа месяца
                  const [y, m] = raw.split('-').map(Number)
                  const lastDay = new Date(y, m, 0).getDate()
                  const from = `${raw}-01`
                  const to = `${raw}-${String(lastDay).padStart(2, '0')}`
                  navigate(`/orders?dateFrom=${from}&dateTo=${to}`)
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Топ клиенты */}
      <div className="card" data-tour="analytics-top-clients">
        <h2 style={{ marginTop: 0 }}>Топ-10 клиентов</h2>
        {topClients.length === 0 ? <div className="empty">Нет данных</div> : (
          <table>
            <thead><tr><th>#</th><th>Клиент</th><th>Тип</th><th>Заказов</th><th>Сумма</th></tr></thead>
            <tbody>
              {topClients.map((c, i) => (
                <tr
                  key={i}
                  onClick={() => navigate(`/orders?clientId=${c.client_id}&clientName=${encodeURIComponent(c.name)}`)}
                  style={{ cursor: 'pointer' }}
                  title="Открыть заказы клиента"
                >
                  <td>{i + 1}</td>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.client_type === 'LEGAL_ENTITY' ? 'Юр.' : 'Физ.'}</td>
                  <td>{c.orders_count}</td>
                  <td>{Number(c.total_spent).toFixed(2)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Warranty Stats */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Гарантийная статистика</h2>
          {warrantyData.length === 0 ? <div className="empty">Нет данных</div> : (
            <table>
              <thead><tr><th>Клиент</th><th>Заказов</th><th>Гарантийных</th><th>%</th></tr></thead>
              <tbody>
                {warrantyData.map((w, i) => (
                  <tr key={i}>
                    <td>
                      <strong
                        style={{ cursor: 'pointer', color: '#3498db' }}
                        title="Открыть все заказы клиента"
                        onClick={() => navigate(`/orders?clientId=${w.client_id}&clientName=${encodeURIComponent(w.client_name)}`)}
                      >{w.client_name}</strong>
                    </td>
                    <td>{w.total_orders}</td>
                    <td>
                      {/* V19: клик именно по числу гарантийных — открыть ТОЛЬКО гарантийные заказы клиента,
                          чтобы быстро посмотреть причины возвратов. */}
                      <span
                        style={{ cursor: 'pointer', color: '#e74c3c', fontWeight: 600, textDecoration: 'underline' }}
                        title="Открыть только гарантийные заказы клиента"
                        onClick={() => navigate(`/orders?clientId=${w.client_id}&clientName=${encodeURIComponent(w.client_name)}&onlyWarranty=true`)}
                      >{w.warranty_orders}</span>
                    </td>
                    <td style={{ color: w.warranty_percent > 20 ? '#e74c3c' : w.warranty_percent > 10 ? '#f39c12' : '#27ae60', fontWeight: 600 }}>
                      {Number(w.warranty_percent).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Margin Analysis */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Маржинальность услуг</h2>
          {marginData.length === 0 ? <div className="empty">Нет данных</div> : (
            <div>
              {(() => {
                const maxVal = Math.max(...marginData.map(m => Math.max(Number(m.revenue), Number(m.cost))), 1)
                return marginData.map((m, i) => {
                  const revenue = Number(m.revenue)
                  const cost = Number(m.cost)
                  const margin = revenue - cost
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)', marginBottom: 2 }}>
                        <span><strong>{m.service_name}</strong> ({m.count} шт.)</span>
                        <span style={{ color: margin >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
                          Маржа: {margin.toFixed(0)} ₽
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 2, height: 18 }}>
                        <div
                          style={{
                            width: `${(revenue / maxVal) * 100}%`,
                            background: '#7fd4a8',
                            borderRadius: '3px 0 0 3px',
                            minWidth: revenue > 0 ? 2 : 0,
                          }}
                          title={`Выручка: ${revenue.toFixed(0)} ₽`}
                        />
                        <div
                          style={{
                            width: `${(cost / maxVal) * 100}%`,
                            background: '#e8a0a0',
                            borderRadius: '0 3px 3px 0',
                            minWidth: cost > 0 ? 2 : 0,
                          }}
                          title={`Себестоимость: ${cost.toFixed(0)} ₽`}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)', color: '#888' }}>
                        <span style={{ color: '#27ae60' }}>Выручка: {revenue.toFixed(0)} ₽</span>
                        <span style={{ color: '#e74c3c' }}>Себест.: {cost.toFixed(0)} ₽</span>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>

      {/* V7: модалка карточки сотрудника — показывает все услуги в DONE за выбранный период. */}
      {employeeCard && (
        <div className="modal-overlay" onClick={() => setEmployeeCard(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '85vh', overflow: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>{employeeCard.name}</h2>
            <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginBottom: 12 }}>
              Услуги в статусе «Готова» за {dateFrom || dateTo ? `${dateFrom || '…'} — ${dateTo || '…'}` : 'текущий месяц'}
            </div>
            {employeeCardLoading ? (
              <div className="loading">Загрузка...</div>
            ) : employeeCardServices.length === 0 ? (
              <div className="empty">За этот период ничего не сделано</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 12px', background: '#f1f8ff', borderRadius: 6 }}>
                  <div><strong>Услуг:</strong> {employeeCardServices.length}</div>
                  <div><strong>Сумма:</strong> {employeeCardServices.reduce((sum, s) => sum + Number(s.price || 0), 0).toFixed(0)} ₽</div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Заказ</th>
                      <th style={{ textAlign: 'right' }}>Сумма</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeCardServices.map(s => (
                      <tr key={s.id} style={{ cursor: 'pointer' }}
                          onClick={() => { setEmployeeCard(null); navigate(`/orders/${s.order_id || s.order_item_id ? s.order_id || '' : ''}`) }}>
                        <td>{s.sku_name || `#${s.sku_id}`}</td>
                        <td>#{String(s.order_id || '').padStart(5, '0')}</td>
                        <td style={{ textAlign: 'right' }}>{Number(s.price).toFixed(0)} ₽</td>
                        <td style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{new Date(s.updated_at).toLocaleDateString('ru')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEmployeeCard(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
