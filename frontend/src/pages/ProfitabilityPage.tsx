import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getProfitByItemType, getProfitByClient, getProfitByEmployee,
  getProfitByEmployeeServices, getProfitByDistrict, getProfitByOrder,
  type ProfitByItemType, type ProfitByClient, type ProfitByEmployee,
  type ProfitByEmployeeService, type ProfitByDistrict, type ProfitByOrder,
} from '../api/analytics'

type Tab = 'item-type' | 'client' | 'employee' | 'district' | 'order' | 'pnl'

const TAB_LABELS: Record<Tab, string> = {
  'item-type': 'По типам позиций',
  'client': 'По клиентам',
  'employee': 'По сотрудникам',
  'district': 'По районам',
  'order': 'По заказам',
  'pnl': 'P&L за месяц',
}

const TABS: Tab[] = ['item-type', 'client', 'employee', 'district', 'order', 'pnl']

const fmt = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0)
  return v.toLocaleString('ru', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'
}

const profitColor = (v: number) => v > 0 ? '#27ae60' : v < 0 ? '#e74c3c' : '#888'

export default function ProfitabilityPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('profit_tab') as Tab) || 'item-type')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)

  const [byType, setByType] = useState<ProfitByItemType[]>([])
  const [byClient, setByClient] = useState<ProfitByClient[]>([])
  const [byEmployee, setByEmployee] = useState<ProfitByEmployee[]>([])
  const [byDistrict, setByDistrict] = useState<ProfitByDistrict[]>([])
  const [byOrder, setByOrder] = useState<ProfitByOrder[]>([])
  const [employeeDrillId, setEmployeeDrillId] = useState<number | null>(null)
  const [employeeDrillName, setEmployeeDrillName] = useState<string>('')
  const [byEmployeeServices, setByEmployeeServices] = useState<ProfitByEmployeeService[]>([])

  useEffect(() => { localStorage.setItem('profit_tab', tab) }, [tab])

  const load = async () => {
    setLoading(true)
    try {
      const df = dateFrom || undefined
      const dt = dateTo || undefined
      if (tab === 'item-type') setByType(await getProfitByItemType(df, dt))
      if (tab === 'client')    setByClient(await getProfitByClient(df, dt))
      if (tab === 'employee')  setByEmployee(await getProfitByEmployee(df, dt))
      if (tab === 'district')  setByDistrict(await getProfitByDistrict(df, dt))
      if (tab === 'order')     setByOrder(await getProfitByOrder(df, dt))
    } catch { /* ignore — индикаторы покажут пустоту */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tab, dateFrom, dateTo])

  const drillEmployee = async (id: number, name: string) => {
    setEmployeeDrillId(id)
    setEmployeeDrillName(name)
    setByEmployeeServices(await getProfitByEmployeeServices(id, dateFrom || undefined, dateTo || undefined))
  }

  const totalRow = <T extends { revenue: number | string; cost?: number | string; profit?: number | string }>(rows: T[]) => {
    const rev = rows.reduce((a, r) => a + Number(r.revenue || 0), 0)
    const cost = rows.reduce((a, r) => a + Number(r.cost || 0), 0)
    const profit = rows.reduce((a, r) => a + Number(r.profit ?? (Number(r.revenue || 0) - Number(r.cost || 0))), 0)
    return { rev, cost, profit }
  }

  return (
    <div>
      <div className="page-header"><h1>Доходность</h1></div>

      {/* Фильтры периода */}
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="form-group">
          <label>Дата с</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Дата по</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className="btn-secondary" onClick={() => { setDateFrom(''); setDateTo('') }}>Сбросить период</button>
      </div>

      {/* Табы */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #ddd' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : '#f4f6f7',
              borderBottom: tab === t ? '3px solid #3498db' : '3px solid transparent',
              fontWeight: tab === t ? 600 : 400, fontSize: '0.95em',
            }}
          >{TAB_LABELS[t]}</button>
        ))}
      </div>

      {loading ? <div className="loading">Загрузка...</div> : (
        <>
          {tab === 'item-type' && (() => {
            const t = totalRow(byType)
            return (
              <table>
                <thead><tr>
                  <th>Тип позиции</th><th>Позиций</th><th>Выручка</th><th>Себестоимость</th><th>Прибыль</th><th>Маржа</th>
                </tr></thead>
                <tbody>
                  {byType.length === 0 ? (
                    <tr><td colSpan={6} className="empty">Данных нет</td></tr>
                  ) : byType.map(r => {
                    const profit = Number(r.profit || 0)
                    const margin = Number(r.revenue || 0) > 0 ? (profit / Number(r.revenue)) * 100 : 0
                    return (
                      <tr key={r.id}>
                        <td><strong>{r.name}</strong></td>
                        <td>{r.items_count}</td>
                        <td>{fmt(r.revenue)}</td>
                        <td style={{ color: '#888' }}>{fmt(r.cost)}</td>
                        <td style={{ color: profitColor(profit), fontWeight: 600 }}>{fmt(profit)}</td>
                        <td style={{ color: profitColor(profit) }}>{margin.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                  {byType.length > 0 && (
                    <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                      <td>Итого</td><td>—</td><td>{fmt(t.rev)}</td><td>{fmt(t.cost)}</td>
                      <td style={{ color: profitColor(t.profit) }}>{fmt(t.profit)}</td><td>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          })()}

          {tab === 'client' && (() => {
            const t = totalRow(byClient)
            return (
              <table>
                <thead><tr>
                  <th>Клиент</th><th>Тип</th><th>Заказов</th><th>Выручка</th><th>Себестоимость</th><th>Прибыль</th>
                </tr></thead>
                <tbody>
                  {byClient.length === 0 ? (
                    <tr><td colSpan={6} className="empty">Данных нет</td></tr>
                  ) : byClient.map(r => (
                    <tr
                      key={r.client_id}
                      onClick={() => navigate(`/orders?clientId=${r.client_id}&clientName=${encodeURIComponent(r.name)}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><strong>{r.name}</strong></td>
                      <td>{r.client_type === 'LEGAL_ENTITY' ? 'Юр.' : 'Физ.'}</td>
                      <td>{r.orders_count}</td>
                      <td>{fmt(r.revenue)}</td>
                      <td style={{ color: '#888' }}>{fmt(r.cost)}</td>
                      <td style={{ color: profitColor(Number(r.profit || 0)), fontWeight: 600 }}>{fmt(r.profit)}</td>
                    </tr>
                  ))}
                  {byClient.length > 0 && (
                    <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                      <td colSpan={3}>Итого</td>
                      <td>{fmt(t.rev)}</td><td>{fmt(t.cost)}</td>
                      <td style={{ color: profitColor(t.profit) }}>{fmt(t.profit)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          })()}

          {tab === 'employee' && (
            <div style={{ display: 'grid', gridTemplateColumns: employeeDrillId ? '1fr 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
              <table>
                <thead><tr>
                  <th>Сотрудник</th><th>Услуг</th><th>Выручка (доля)</th><th>Себестоимость</th><th>Прибыль</th>
                </tr></thead>
                <tbody>
                  {byEmployee.length === 0 ? (
                    <tr><td colSpan={5} className="empty">Данных нет</td></tr>
                  ) : byEmployee.map(r => {
                    const profit = Number(r.revenue || 0) - Number(r.cost || 0)
                    return (
                      <tr
                        key={r.employee_id}
                        onClick={() => void drillEmployee(r.employee_id, r.name)}
                        style={{ cursor: 'pointer', background: r.employee_id === employeeDrillId ? '#ebf5fb' : undefined }}
                        title="Показать разрез по услугам"
                      >
                        <td><strong>{r.name}</strong></td>
                        <td>{r.services_count}</td>
                        <td>{fmt(r.revenue)}</td>
                        <td style={{ color: '#888' }}>{fmt(r.cost)}</td>
                        <td style={{ color: profitColor(profit), fontWeight: 600 }}>{fmt(profit)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {employeeDrillId && (
                <div className="card">
                  <h3 style={{ marginTop: 0 }}>{employeeDrillName} — по услугам</h3>
                  <table>
                    <thead><tr><th>Услуга</th><th>Выполнено</th><th>Выручка (доля)</th></tr></thead>
                    <tbody>
                      {byEmployeeServices.length === 0 ? (
                        <tr><td colSpan={3} className="empty">Нет данных</td></tr>
                      ) : byEmployeeServices.map(s => (
                        <tr key={s.service_id}>
                          <td>{s.service_name}</td>
                          <td>{s.count}</td>
                          <td>{fmt(s.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'district' && (() => {
            const t = totalRow(byDistrict)
            return (
              <table>
                <thead><tr>
                  <th>Район</th><th>Заказов</th><th>Выручка</th><th>Себестоимость</th><th>Прибыль</th>
                </tr></thead>
                <tbody>
                  {byDistrict.length === 0 ? (
                    <tr><td colSpan={5} className="empty">Данных нет</td></tr>
                  ) : byDistrict.map(r => (
                    <tr
                      key={r.district}
                      onClick={() => navigate(`/logistics?district=${encodeURIComponent(r.district === '(без района)' ? '' : r.district)}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><strong>{r.district}</strong></td>
                      <td>{r.orders_count}</td>
                      <td>{fmt(r.revenue)}</td>
                      <td style={{ color: '#888' }}>{fmt(r.cost)}</td>
                      <td style={{ color: profitColor(Number(r.profit || 0)), fontWeight: 600 }}>{fmt(r.profit)}</td>
                    </tr>
                  ))}
                  {byDistrict.length > 0 && (
                    <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                      <td colSpan={2}>Итого</td><td>{fmt(t.rev)}</td><td>{fmt(t.cost)}</td>
                      <td style={{ color: profitColor(t.profit) }}>{fmt(t.profit)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          })()}

          {tab === 'order' && (() => {
            const t = totalRow(byOrder)
            return (
              <table>
                <thead><tr>
                  <th>#</th><th>Клиент</th><th>Статус</th><th>Создан</th><th>Выручка</th><th>Себестоимость</th><th>Прибыль</th>
                </tr></thead>
                <tbody>
                  {byOrder.length === 0 ? (
                    <tr><td colSpan={7} className="empty">Данных нет</td></tr>
                  ) : byOrder.map(r => {
                    const profit = Number(r.profit || 0)
                    return (
                      <tr key={r.id} onClick={() => navigate(`/orders/${r.id}`)} style={{ cursor: 'pointer' }}>
                        <td>{String(r.id).padStart(5, '0')}</td>
                        <td>{r.client_name}</td>
                        <td>{r.status}</td>
                        <td>{new Date(r.created_at).toLocaleDateString('ru')}</td>
                        <td>{fmt(r.revenue)}</td>
                        <td style={{ color: '#888' }}>{fmt(r.cost)}</td>
                        <td style={{ color: profitColor(profit), fontWeight: 600 }}>{fmt(profit)}</td>
                      </tr>
                    )
                  })}
                  {byOrder.length > 0 && (
                    <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                      <td colSpan={4}>Итого</td><td>{fmt(t.rev)}</td><td>{fmt(t.cost)}</td>
                      <td style={{ color: profitColor(t.profit) }}>{fmt(t.profit)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )
          })()}

          {tab === 'pnl' && <PnlTab />}
        </>
      )}
    </div>
  )
}

/** V11: P&L за месяц — выручка, себестоимость, расходы, прибыль. */
function PnlTab() {
  const now = new Date()
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [data, setData] = useState<{
    revenue: number; cogs: number; gross_profit: number; expenses: number; net_profit: number
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/expenses/pnl?yearMonth=${yearMonth}`, {
      headers: { 'Authorization': `Basic ${sessionStorage.getItem('auth')}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [yearMonth])

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label>Месяц: </label>
        <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} />
      </div>
      {loading ? <div className="loading">Загрузка...</div> : data ? (
        <table>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Выручка</td><td style={{ textAlign: 'right' }}>{fmt(data.revenue)}</td></tr>
            <tr><td>Себестоимость (COGS)</td><td style={{ textAlign: 'right', color: '#e74c3c' }}>−{fmt(data.cogs)}</td></tr>
            <tr style={{ background: '#eafaf1', fontWeight: 600 }}><td>Валовая прибыль</td><td style={{ textAlign: 'right', color: profitColor(data.gross_profit) }}>{fmt(data.gross_profit)}</td></tr>
            <tr><td>Расходы</td><td style={{ textAlign: 'right', color: '#e74c3c' }}>−{fmt(data.expenses)}</td></tr>
            <tr style={{ background: '#fef9e7', fontWeight: 700, fontSize: '1.1em' }}><td>Чистая прибыль</td><td style={{ textAlign: 'right', color: profitColor(data.net_profit) }}>{fmt(data.net_profit)}</td></tr>
          </tbody>
        </table>
      ) : <div style={{ color: '#888' }}>Нет данных</div>}
    </div>
  )
}
