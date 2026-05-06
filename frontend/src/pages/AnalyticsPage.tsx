import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { getOrdersByDistrict, getOrdersByStatus, getItemsByType, getEmployeeStats, getRevenueByMonth, getTopClients, getWarrantyStats, getMarginAnalysis } from '../api/analytics'
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
  const [employeeData, setEmployeeData] = useState<{name: string, services_done: number, total_earned: number}[]>([])
  const [revenueData, setRevenueData] = useState<{month: string, orders_count: number, revenue: number}[]>([])
  const [topClients, setTopClients] = useState<{client_id: number, name: string, client_type: string, orders_count: number, total_spent: number}[]>([])
  const [warrantyData, setWarrantyData] = useState<{client_id: number, client_name: string, total_orders: number, warranty_orders: number, warranty_percent: number}[]>([])
  const [marginData, setMarginData] = useState<{service_name: string, count: number, revenue: number, cost: number}[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getOrdersByDistrict().then(setDistrictData).catch(() => {}),
      getOrdersByStatus().then(setStatusData).catch(() => {}),
      getItemsByType().then(setTypeData).catch(() => {}),
      getEmployeeStats().then(setEmployeeData).catch(() => {}),
      getRevenueByMonth().then(setRevenueData).catch(() => {}),
      getTopClients().then(setTopClients).catch(() => {}),
      getWarrantyStats().then(setWarrantyData).catch(() => {}),
      getMarginAnalysis().then(setMarginData).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Загрузка аналитики...</div>

  const statusChartData = statusData.map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || '#95a5a6',
  }))

  const typeChartData = typeData.map(t => ({ name: t.type_name, value: t.count }))

  const revenueChartData = [...revenueData].reverse().map(r => ({
    month: MONTH_LABELS[r.month.split('-')[1]] || r.month,
    revenue: Number(r.revenue),
    orders: r.orders_count,
  }))

  const mapData = districtData.map(d => ({
    district: d.district, count: d.count, sum: Number(d.total),
  }))

  return (
    <div>
      <div className="page-header"><h1>Аналитика</h1></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Карта районов */}
        <div className="card">
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
          <h2 style={{ marginTop: 0 }}>Производительность сотрудников</h2>
          {employeeData.length === 0 ? <div className="empty">Нет данных</div> : (
            <ResponsiveContainer width="100%" height={Math.max(200, employeeData.length * 40)}>
              <BarChart data={employeeData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => [name === 'services_done' ? `${value} услуг` : `${value} ₽`, name === 'services_done' ? 'Выполнено' : 'Заработано']} />
                <Bar dataKey="services_done" fill="#7fb8e8" name="Выполнено услуг" style={{ cursor: 'pointer' }} onClick={() => navigate('/employees')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Выручка по месяцам — полная ширина */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Выручка по месяцам</h2>
        {revenueChartData.length === 0 ? <div className="empty">Нет данных</div> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={revenueChartData}>
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => `${Number(value).toFixed(0)} ₽`} />
              <Bar dataKey="revenue" fill="#7fd4a8" name="Выручка" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Топ клиенты */}
      <div className="card">
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
                  <tr
                    key={i}
                    onClick={() => navigate(`/orders?clientId=${w.client_id}&clientName=${encodeURIComponent(w.client_name)}`)}
                    style={{ cursor: 'pointer' }}
                    title="Открыть заказы клиента"
                  >
                    <td><strong>{w.client_name}</strong></td>
                    <td>{w.total_orders}</td>
                    <td>{w.warranty_orders}</td>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', marginBottom: 2 }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#888' }}>
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
    </div>
  )
}
