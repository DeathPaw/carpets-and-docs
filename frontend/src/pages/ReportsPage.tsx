import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useToast } from '../components/Toast'
import { reportsApi } from '../api/reports'
import type {
  ContractClientRow, ContractReportRow, ReportFilters, ReportResponse, ReportWorkRow,
} from '../api/reports'
import { contractsApi, CONTRACT_KIND_LABELS } from '../api/contracts'
import type { Contract } from '../api/contracts'
import { ONSITE_STATUS_LABELS } from '../api/onsite'
import { ORDER_STATUS_LABELS, ALL_ORDER_STATUSES } from '../constants/statuses'
import { getClients } from '../api/clients'
import type { Client } from '../types'
import { formatOrderId, todayIso } from '../utils/format'

/**
 * Отчёты (ТЗ v2, блок 7).
 *
 * Фильтры независимы, основание периода выбирается явно: считать по дате
 * оформления или по дате выполнения. Смешивать основания в одном показателе
 * нельзя — поэтому дата отбора вынесена в заголовок отчёта, а не спрятана.
 *
 * Любой показатель раскрывается в исходные записи: итог и его состав приходят
 * из одного запроса и не могут разойтись.
 */
const FILTERS_KEY = 'reports.filters.v1'

const HANDOVER_LABELS: Record<string, string> = {
  DELIVERY: 'Доставка',
  SELF_PICKUP: 'Самовывоз',
  ONSITE: 'Выезд к клиенту',
}

const defaultFilters = (): ReportFilters => ({
  from: `${todayIso().slice(0, 8)}01`,
  to: todayIso(),
  dateBasis: 'CREATED',
  workKind: '',
  handover: '',
  clientKind: '',
  clientId: null,
  contractMode: '',
  contractKind: '',
  contractId: null,
  statuses: [],
})

export default function ReportsPage() {
  const { showToast } = useToast()
  const [filters, setFilters] = useState<ReportFilters>(() => {
    // Настройки отбора сохраняются между заходами — требование ТЗ.
    try {
      const saved = localStorage.getItem(FILTERS_KEY)
      return saved ? { ...defaultFilters(), ...JSON.parse(saved) } : defaultFilters()
    } catch { return defaultFilters() }
  })
  const [data, setData] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [drill, setDrill] = useState<'' | 'WORKS' | 'COSTS' | 'PAYROLL'>('WORKS')
  const [contractRows, setContractRows] = useState<ContractReportRow[]>([])
  const [contractClients, setContractClients] = useState<ContractClientRow[]>([])
  /** На экране показываем первые строки, в Excel уходят все — без молчаливой обрезки. */
  const [visibleRows, setVisibleRows] = useState(200)

  const load = async () => {
    setLoading(true)
    try {
      setData(await reportsApi.works(filters))
    } catch {
      showToast('Не удалось построить отчёт', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    void getClients().then(setClients).catch(() => setClients([]))
    void contractsApi.list().then(setContracts).catch(() => setContracts([]))
    void reportsApi.contracts().then(setContractRows).catch(() => setContractRows([]))
    void reportsApi.contractClients().then(setContractClients).catch(() => setContractClients([]))
  }, [])

  const set = (patch: Partial<ReportFilters>) => {
    const next = { ...filters, ...patch }
    setFilters(next)
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(next)) } catch { /* приватный режим */ }
  }

  const reset = () => {
    const next = defaultFilters()
    setFilters(next)
    try { localStorage.removeItem(FILTERS_KEY) } catch { /* приватный режим */ }
  }

  const basisLabel = filters.dateBasis === 'COMPLETED' ? 'по дате выполнения' : 'по дате оформления'
  const periodLabel = `${filters.from || '…'} — ${filters.to || '…'}, ${basisLabel}`

  /** Выгрузка повторяет фильтры: в файле те же строки, что на экране. */
  const exportExcel = () => {
    if (!data) return
    const wb = XLSX.utils.book_new()

    const paramsSheet = XLSX.utils.aoa_to_sheet([
      ['Отчёт по работам'],
      ['Период', `${filters.from || 'без нижней границы'} — ${filters.to || 'без верхней границы'}`],
      ['Дата отбора', filters.dateBasis === 'COMPLETED' ? 'дата выполнения' : 'дата оформления'],
      ['Тип работы', filters.workKind ? (filters.workKind === 'ORDER' ? 'Заказ' : 'Выездная чистка') : 'все'],
      ['Способ передачи', filters.handover ? HANDOVER_LABELS[filters.handover] : 'все'],
      ['Клиент', filters.clientKind === 'LEGAL_ENTITY' ? 'юрлица'
        : filters.clientKind === 'INDIVIDUAL' ? 'частные' : 'все'],
      ['Контракт', filters.contractMode === 'WITH' ? 'только по контракту'
        : filters.contractMode === 'WITHOUT' ? 'без контракта' : 'все'],
      ['Вид контракта', filters.contractKind ? CONTRACT_KIND_LABELS[filters.contractKind] : 'все'],
      ['Статусы', filters.statuses?.length ? filters.statuses.join(', ') : 'все'],
      [],
      ['Работ', data.summary.works_count],
      ['в т.ч. заказов', data.summary.orders_count],
      ['в т.ч. выездных чисток', data.summary.onsite_count],
      ['Площадь, м²', Number(data.summary.area_sqm)],
      ['Стоимость работ, ₽', Number(data.summary.work_amount)],
      ['Учтённые расходы за период, ₽', Number(data.summary.costs_total)],
      ['в т.ч. прямые по отобранным заказам, ₽', Number(data.summary.direct_costs)],
      ['ФОТ за период, ₽', Number(data.summary.payroll_total)],
    ])
    paramsSheet['!cols'] = [{ wch: 38 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, paramsSheet, 'Параметры')

    const workRows = data.rows.map(r => [
      r.kind === 'ORDER' ? 'Заказ' : 'Выездная чистка',
      r.kind === 'ORDER' ? formatOrderId(r.id) : String(r.id),
      r.client_name,
      r.client_kind === 'LEGAL_ENTITY' ? 'Юрлицо' : 'Частный',
      r.created_on,
      r.completed_on || '',
      statusLabel(r),
      HANDOVER_LABELS[r.handover] || r.handover,
      Number(r.area),
      Number(r.amount),
      r.contract_number || '',
      r.contract_kind ? CONTRACT_KIND_LABELS[r.contract_kind] : '',
      r.contract_id ? (r.counted_in_contract ? 'да' : 'нет') : '',
    ])
    const ws = XLSX.utils.aoa_to_sheet([[
      'Вид работы', 'Номер', 'Клиент', 'Тип клиента', 'Оформлен', 'Выполнен', 'Статус',
      'Способ передачи', 'Площадь, м²', 'Стоимость, ₽', 'Контракт', 'Вид контракта', 'Зачтено в контракт',
    ], ...workRows])
    ws['!cols'] = [
      { wch: 16 }, { wch: 10 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
      { wch: 16 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Работы')

    const costSheet = XLSX.utils.aoa_to_sheet([
      ['Дата', 'Вид', 'Категория', 'Наименование', 'Контрагент', 'Сумма, ₽', 'Распределение', 'Заказ'],
      ...data.costs.map(c => [
        c.entry_date, c.kind === 'MATERIAL' ? 'Материалы' : 'Прочее', c.category_name || '',
        c.title, c.counterparty || '', Number(c.amount), c.allocation,
        c.alloc_order_id ? formatOrderId(c.alloc_order_id) : '',
      ]),
    ])
    costSheet['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, costSheet, 'Расходы')

    const payrollSheet = XLSX.utils.aoa_to_sheet([
      ['Дата', 'Месяц', 'Сотрудник', 'Вид начисления', 'Сумма, ₽', 'Основание'],
      ...data.payroll.map(p => [
        p.entry_date || '', p.year_month, p.employee_name, p.kind, Number(p.amount), p.details || '',
      ]),
    ])
    payrollSheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, payrollSheet, 'ФОТ')

    XLSX.writeFile(wb, `report_${todayIso()}.xlsx`)
    showToast(`Выгружено работ: ${data.rows.length}`, 'success')
  }

  /** Реестр контрактных юрлиц — отдельный файл по ТЗ. */
  const exportContractClients = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['ID', 'Наименование', 'ИНН', 'Адрес', 'Телефон', 'Email', 'Контактное лицо', 'Телефон контакта',
        'Контрактов', 'Плановый объём, м²'],
      ...contractClients.map(c => [
        c.id, c.name, c.inn || '', c.address || '', c.phone || '', c.email || '',
        c.contact_person || '', c.contact_person_phone || '',
        Number(c.contracts_count), Number(c.planned_sqm),
      ]),
    ])
    ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 14 }, { wch: 34 }, { wch: 18 }, { wch: 24 },
      { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Юрлица')
    XLSX.writeFile(wb, `contract_clients_${todayIso()}.xlsx`)
  }

  /** Список контрактов с условиями и план-фактом — второй отдельный файл. */
  const exportContracts = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Номер', 'Вид', 'Юрлицо', 'ИНН', 'Заключён', 'Действует до', 'Статус',
        'План, м²', 'Факт, м²', 'Остаток, м²', 'Сверх плана, м²', 'Выполнение, %',
        'Цена, ₽/м²', 'План, ₽', 'Факт, ₽'],
      ...contractRows.map(c => [
        c.number, CONTRACT_KIND_LABELS[c.kind], c.client_name, c.client_inn || '',
        c.signed_on, c.expires_on || 'бессрочно', c.is_active ? 'Действует' : 'В архиве',
        c.planned_sqm == null ? '' : Number(c.planned_sqm), Number(c.fact_sqm),
        Number(c.remaining_sqm), Number(c.over_sqm),
        c.completion_percent == null ? '' : Number(c.completion_percent),
        Number(c.price_per_sqm), Number(c.planned_amount), Number(c.fact_amount),
      ]),
    ])
    ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
      { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 13 },
      { wch: 12 }, { wch: 14 }, { wch: 14 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Контракты')
    XLSX.writeFile(wb, `contracts_${todayIso()}.xlsx`)
  }

  const s = data?.summary
  return (
    <div>
      <h1>Отчёты</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>Период с
            <input type="date" value={filters.from || ''} onChange={e => set({ from: e.target.value })} />
          </label>
          <label>по
            <input type="date" value={filters.to || ''} onChange={e => set({ to: e.target.value })} />
          </label>
          {/* Основание периода показываем явно: смешивать даты в одном
              показателе нельзя, и оператор должен видеть, по какой считаем. */}
          <label>Дата отбора
            <select value={filters.dateBasis} onChange={e => set({ dateBasis: e.target.value as ReportFilters['dateBasis'] })}>
              <option value="CREATED">Дата оформления</option>
              <option value="COMPLETED">Дата выполнения</option>
            </select>
          </label>
          <label>Тип работы
            <select value={filters.workKind} onChange={e => set({ workKind: e.target.value as ReportFilters['workKind'] })}>
              <option value="">Все</option>
              <option value="ORDER">Заказы</option>
              <option value="ONSITE">Выездные чистки</option>
            </select>
          </label>
          <label>Передача
            <select value={filters.handover} onChange={e => set({ handover: e.target.value as ReportFilters['handover'] })}>
              <option value="">Все</option>
              <option value="DELIVERY">Доставка</option>
              <option value="SELF_PICKUP">Самовывоз</option>
              <option value="ONSITE">Выезд к клиенту</option>
            </select>
          </label>
          <label>Клиент
            <select value={filters.clientKind} onChange={e => set({ clientKind: e.target.value as ReportFilters['clientKind'] })}>
              <option value="">Все</option>
              <option value="INDIVIDUAL">Частные</option>
              <option value="LEGAL_ENTITY">Юрлица</option>
            </select>
          </label>
          <label>Конкретный клиент
            <select
              value={filters.clientId ?? ''}
              onChange={e => set({ clientId: e.target.value ? Number(e.target.value) : null })}
              style={{ maxWidth: 220 }}
            >
              <option value="">Все</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Контракт
            <select value={filters.contractMode} onChange={e => set({ contractMode: e.target.value as ReportFilters['contractMode'] })}>
              <option value="">Все</option>
              <option value="WITH">По контракту</option>
              <option value="WITHOUT">Без контракта</option>
            </select>
          </label>
          <label>Вид контракта
            <select value={filters.contractKind} onChange={e => set({ contractKind: e.target.value as ReportFilters['contractKind'] })}>
              <option value="">Все</option>
              <option value="COMMERCIAL">Коммерческий</option>
              <option value="GOVERNMENT">Государственный</option>
            </select>
          </label>
          <label>Конкретный контракт
            <select
              value={filters.contractId ?? ''}
              onChange={e => set({ contractId: e.target.value ? Number(e.target.value) : null })}
              style={{ maxWidth: 220 }}
            >
              <option value="">Все</option>
              {contracts.map(c => <option key={c.id} value={c.id}>№ {c.number} — {c.client_name}</option>)}
            </select>
          </label>
          <label>Статус
            <select
              multiple
              size={4}
              value={filters.statuses || []}
              onChange={e => set({
                statuses: Array.from(e.target.selectedOptions).map(o => o.value),
              })}
              style={{ minWidth: 180, height: 'auto' }}
            >
              {ALL_ORDER_STATUSES.map(st => (
                <option key={st} value={st}>{ORDER_STATUS_LABELS[st]}</option>
              ))}
              {Object.entries(ONSITE_STATUS_LABELS).map(([k, label]) => (
                <option key={`onsite-${k}`} value={k}>Выезд: {label}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={load} disabled={loading}>
            {loading ? 'Считаю…' : 'Построить'}
          </button>
          <button className="btn-secondary" onClick={reset}>Сбросить</button>
          <button className="btn-secondary" onClick={exportExcel} disabled={!data}>Выгрузить в Excel</button>
        </div>
      </div>

      {s && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ color: '#7f8c8d', fontSize: 'var(--font-sm)', marginBottom: 8 }}>
            Отбор: {periodLabel}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Metric label="Работ" value={s.works_count} onClick={() => setDrill('WORKS')} />
            <Metric label="Заказов" value={s.orders_count} />
            <Metric label="Выездных чисток" value={s.onsite_count} />
            <Metric label="Площадь, м²" value={s.area_sqm} onClick={() => setDrill('WORKS')} />
            <Metric label="Стоимость работ, ₽" value={s.work_amount} accent="#27ae60" onClick={() => setDrill('WORKS')} />
            <Metric label="Расходы за период, ₽" value={s.costs_total} accent="#c0392b" onClick={() => setDrill('COSTS')} />
            <Metric label="ФОТ за период, ₽" value={s.payroll_total} accent="#c0392b" onClick={() => setDrill('PAYROLL')} />
            <Metric label="Затрат на м², ₽" value={s.cost_per_sqm} />
          </div>
          {/* Расходы и ФОТ — общие деньги компании: фильтры по клиенту и контракту
              на них не действуют, иначе получилась бы себестоимость «по заказу»,
              которой у нас нет. Прямые затраты на заказы выборки видно отдельно. */}
          <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginTop: 10 }}>
            Расходы и ФОТ считаются за период целиком и не сужаются фильтрами по клиенту
            и контракту. Прямых затрат по отобранным заказам: {Number(s.direct_costs).toLocaleString('ru')} ₽.
          </div>
        </div>
      )}

      {data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {([['WORKS', `Работы (${data.rows.length})`],
               ['COSTS', `Расходы (${data.costs.length})`],
               ['PAYROLL', `ФОТ (${data.payroll.length})`]] as const).map(([key, label]) => (
              <button
                key={key}
                className={drill === key ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setDrill(key)}
              >{label}</button>
            ))}
          </div>

          {drill === 'WORKS' && (
            <table>
              <thead>
                <tr>
                  <th>Работа</th><th>Клиент</th><th>Тип</th><th>Оформлен</th><th>Выполнен</th>
                  <th>Статус</th><th>Передача</th><th>м²</th><th>Стоимость</th><th>Контракт</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, visibleRows).map(r => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>
                      {r.kind === 'ORDER'
                        ? <Link to={`/orders/${r.id}`}>Заказ {formatOrderId(r.id)}</Link>
                        : <Link to="/onsite">Выезд #{r.id}</Link>}
                    </td>
                    <td>{r.client_name}</td>
                    <td>{r.client_kind === 'LEGAL_ENTITY' ? 'Юрлицо' : 'Частный'}</td>
                    <td>{r.created_on}</td>
                    <td>{r.completed_on || '—'}</td>
                    <td>{statusLabel(r)}</td>
                    <td>{HANDOVER_LABELS[r.handover] || r.handover}</td>
                    <td>{Number(r.area).toLocaleString('ru')}</td>
                    <td>{Number(r.amount).toLocaleString('ru')} ₽</td>
                    <td>
                      {r.contract_number
                        ? `№ ${r.contract_number}${r.counted_in_contract ? '' : ' (не зачтён)'}`
                        : '—'}
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={10} style={{ color: '#7f8c8d' }}>Работ по фильтрам нет</td></tr>
                )}
                {data.rows.length > visibleRows && (
                  <tr>
                    <td colSpan={10} style={{ color: '#7f8c8d' }}>
                      Показаны первые {visibleRows} из {data.rows.length}.{' '}
                      <button
                        className="btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 'var(--font-sm)' }}
                        onClick={() => setVisibleRows(v => v + 500)}
                      >Показать ещё</button>
                      {' '}В выгрузку попадут все строки.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {drill === 'COSTS' && (
            <table>
              <thead>
                <tr><th>Дата</th><th>Вид</th><th>Категория</th><th>Наименование</th><th>Сумма</th><th>Распределение</th><th>Заказ</th></tr>
              </thead>
              <tbody>
                {data.costs.map(c => (
                  <tr key={c.id}>
                    <td>{c.entry_date}</td>
                    <td>{c.kind === 'MATERIAL' ? 'Материалы' : 'Прочее'}</td>
                    <td>{c.category_name || '—'}</td>
                    <td>{c.title}</td>
                    <td>{Number(c.amount).toLocaleString('ru')} ₽</td>
                    <td>{c.allocation}</td>
                    <td>{c.alloc_order_id ? <Link to={`/orders/${c.alloc_order_id}`}>{formatOrderId(c.alloc_order_id)}</Link> : '—'}</td>
                  </tr>
                ))}
                {data.costs.length === 0 && (
                  <tr><td colSpan={7} style={{ color: '#7f8c8d' }}>Расходов за период нет</td></tr>
                )}
              </tbody>
            </table>
          )}

          {drill === 'PAYROLL' && (
            <table>
              <thead>
                <tr><th>Дата</th><th>Месяц</th><th>Сотрудник</th><th>Вид</th><th>Сумма</th><th>Основание</th></tr>
              </thead>
              <tbody>
                {data.payroll.map(p => (
                  <tr key={p.id}>
                    <td>{p.entry_date || '—'}</td>
                    <td>{p.year_month}</td>
                    <td>{p.employee_name}</td>
                    <td>{p.kind}</td>
                    <td>{Number(p.amount).toLocaleString('ru')} ₽</td>
                    <td>{p.details || '—'}</td>
                  </tr>
                ))}
                {data.payroll.length === 0 && (
                  <tr><td colSpan={6} style={{ color: '#7f8c8d' }}>Начислений за период нет</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>Контракты: план-факт</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={exportContractClients} disabled={!contractClients.length}>
              Выгрузить юрлица
            </button>
            <button className="btn-secondary" onClick={exportContracts} disabled={!contractRows.length}>
              Выгрузить контракты
            </button>
          </div>
        </div>
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Номер</th><th>Вид</th><th>Юрлицо</th><th>Срок</th>
              <th>План, м²</th><th>Факт, м²</th><th>Остаток</th><th>Сверх плана</th><th>Выполнение</th><th>Факт, ₽</th>
            </tr>
          </thead>
          <tbody>
            {contractRows.map(c => (
              <tr key={c.id}>
                <td><Link to="/contracts">№ {c.number}</Link></td>
                <td>{CONTRACT_KIND_LABELS[c.kind]}</td>
                <td>{c.client_name}</td>
                <td>{c.signed_on} — {c.expires_on || 'бессрочно'}</td>
                <td>{c.planned_sqm == null ? '—' : Number(c.planned_sqm).toLocaleString('ru')}</td>
                <td>{Number(c.fact_sqm).toLocaleString('ru')}</td>
                <td>{Number(c.remaining_sqm).toLocaleString('ru')}</td>
                <td>{Number(c.over_sqm) ? Number(c.over_sqm).toLocaleString('ru') : '—'}</td>
                <td>{c.completion_percent == null ? '—' : `${Number(c.completion_percent).toLocaleString('ru')}%`}</td>
                <td>{Number(c.fact_amount).toLocaleString('ru')} ₽</td>
              </tr>
            ))}
            {contractRows.length === 0 && (
              <tr><td colSpan={10} style={{ color: '#7f8c8d' }}>Контрактов нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function statusLabel(r: ReportWorkRow): string {
  if (r.kind === 'ONSITE') {
    return ONSITE_STATUS_LABELS[r.status as keyof typeof ONSITE_STATUS_LABELS] || r.status
  }
  return ORDER_STATUS_LABELS[r.status as keyof typeof ORDER_STATUS_LABELS] || r.status
}

function Metric({ label, value, accent, onClick }: {
  label: string
  value: number | null
  accent?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      title={onClick ? 'Открыть исходные записи' : undefined}
    >
      <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{label}</div>
      <div style={{
        fontSize: 20, fontWeight: 600, color: accent,
        textDecoration: onClick ? 'underline dotted' : undefined,
      }}>
        {value == null ? '—' : Number(value).toLocaleString('ru')}
      </div>
    </div>
  )
}
