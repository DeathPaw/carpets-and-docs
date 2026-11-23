import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { reportsApi, type OrdersReportRow } from '../../api/reports'
import { getPriceModifiers } from '../../api/references'
import { useToast } from '../Toast'
import { usePersistentState } from '../../hooks/usePersistentState'
import { CLIENT_SOURCE_LABELS, ORDER_STATUS_LABELS, PAYMENT_LABELS } from '../../constants/statuses'
import { formatOrderNumber, todayIso } from '../../utils/format'
import { modifierText } from '../../utils/modifiers'
import type { PriceModifier, OrderStatus, PaymentType } from '../../types'

/**
 * ПР-013: заказы за день или период — главный сценарий: ежедневная выгрузка
 * для оценки рекламы (номер, дата, клиент, чек, канал привлечения).
 *
 * Плюс отчётность по скидкам и промокодам (ПР-018): фильтр по скидке или коду,
 * выгрузка уникальных клиентов, которые ими воспользовались. Канал
 * привлечения и промокод — разные поля. Одна строка — один заказ, поэтому
 * выручка не удваивается, если в заказе несколько скидок.
 *
 * Простой конструктор: оператор выбирает колонки, выбор запоминается и
 * действует и на экране, и в Excel.
 */
type ColKey = 'no' | 'date' | 'client' | 'source' | 'status' | 'base' | 'discounts' | 'discount_sum' | 'promo' | 'total' | 'paid' | 'warranty'

const COLUMNS: { key: ColKey; label: string; value: (r: OrdersReportRow) => string | number | Date }[] = [
  { key: 'no', label: 'Номер заказа', value: r => formatOrderNumber(r.id, r.created_at) },
  { key: 'date', label: 'Дата заказа', value: r => new Date(r.created_at) },
  { key: 'client', label: 'Клиент', value: r => r.client_name },
  { key: 'source', label: 'Канал привлечения', value: r => sourceLabel(r) },
  { key: 'status', label: 'Статус', value: r => ORDER_STATUS_LABELS[r.status as OrderStatus] || r.status },
  { key: 'base', label: 'Сумма позиций, ₽', value: r => Number(r.base_amount) },
  { key: 'discounts', label: 'Скидки', value: r => r.discounts ?? '' },
  { key: 'discount_sum', label: 'Размер скидки, ₽', value: r => Number(r.discount_sum) },
  { key: 'promo', label: 'Промокод', value: r => r.promo_codes ?? '' },
  { key: 'total', label: 'Чек (итог), ₽', value: r => Number(r.total_amount) },
  { key: 'paid', label: 'Оплата', value: r => r.paid ? (PAYMENT_LABELS[r.payment_type as PaymentType] ?? 'Да') : 'Нет' },
  { key: 'warranty', label: 'Гарантийный', value: r => r.is_warranty ? 'Да' : '' },
]
const DEFAULT_COLS: ColKey[] = ['no', 'date', 'client', 'source', 'total', 'discounts', 'promo']

const sourceLabel = (r: OrdersReportRow) => r.source
  ? (r.source === 'OTHER' && r.source_note ? `Другой: ${r.source_note}` : CLIENT_SOURCE_LABELS[r.source] || r.source)
  : 'Не указан'

const shiftDay = (iso: string, days: number) => {
  const d = new Date(iso); d.setDate(d.getDate() + days); return d.toLocaleDateString('sv-SE')
}

export default function OrdersReport() {
  const { showToast } = useToast()
  const [from, setFrom] = useState(todayIso())
  const [to, setTo] = useState(todayIso())
  const [source, setSource] = useState('')
  const [modifierId, setModifierId] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [cols, setCols] = usePersistentState<ColKey[]>('reports.orders.columns', DEFAULT_COLS)
  const [showCols, setShowCols] = useState(false)
  const [rows, setRows] = useState<OrdersReportRow[] | null>(null)
  const [modifiers, setModifiers] = useState<PriceModifier[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { getPriceModifiers().then(setModifiers).catch(() => setModifiers([])) }, [])

  const load = async (f = from, t = to) => {
    setLoading(true)
    try {
      setRows(await reportsApi.orders({
        from: f, to: t, source, includeCancelled,
        modifierId: modifierId ? Number(modifierId) : null, promoCode: promoCode.trim(),
      }))
    } catch (e: unknown) {
      showToast((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Не удалось построить отчёт', 'error')
    } finally { setLoading(false) }
  }

  const shown = COLUMNS.filter(c => cols.includes(c.key))
  const period = from === to ? from : `${from}_${to}`

  const exportOrders = () => {
    if (!rows) return
    const sheet = XLSX.utils.aoa_to_sheet([shown.map(c => c.label), ...rows.map(r => shown.map(c => c.value(r)))], { cellDates: true })
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Заказы')
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Канал привлечения', 'Заказов', 'Выручка (чек), ₽', 'Скидки, ₽'],
      ...bySource.map(s => [s.label, s.count, s.revenue, s.discounts]),
    ]), 'По каналам')
    XLSX.writeFile(book, `Заказы_${period}.xlsx`)
  }

  /** Уникальные клиенты отчёта (обычно — с фильтром по скидке/промокоду) и их заказы. */
  const exportClients = () => {
    if (!rows) return
    const byClient = new Map<string, { name: string; source: string; orders: OrdersReportRow[] }>()
    rows.forEach(r => {
      const key = r.client_id != null ? String(r.client_id) : `name:${r.client_name}`
      const entry = byClient.get(key) ?? { name: r.client_name, source: sourceLabel(r), orders: [] }
      entry.orders.push(r); byClient.set(key, entry)
    })
    const data = [...byClient.values()].map(c => [
      c.name, c.source, c.orders.length,
      c.orders.reduce((s, r) => s + Number(r.total_amount), 0),
      c.orders.map(r => formatOrderNumber(r.id, r.created_at)).join(', '),
      [...new Set(c.orders.flatMap(r => (r.promo_codes ?? '').split(', ').filter(Boolean)))].join(', '),
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['Клиент', 'Канал привлечения', 'Заказов', 'Сумма чеков, ₽', 'Заказы', 'Промокоды'], ...data,
    ]), 'Клиенты')
    XLSX.writeFile(book, `Клиенты_${period}.xlsx`)
  }

  const bySource = (() => {
    const map = new Map<string, { label: string; count: number; revenue: number; discounts: number }>()
    ;(rows ?? []).forEach(r => {
      const label = sourceLabel(r)
      const e = map.get(label) ?? { label, count: 0, revenue: 0, discounts: 0 }
      e.count++; e.revenue += Number(r.total_amount); e.discounts += Number(r.discount_sum)
      map.set(label, e)
    })
    return [...map.values()].sort((a, b) => b.revenue - a.revenue)
  })()
  const total = (rows ?? []).reduce((s, r) => s + Number(r.total_amount), 0)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Заказы за период: реклама, скидки, промокоды</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>С <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>по <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="btn-secondary btn-sm" onClick={() => { const d = todayIso(); setFrom(d); setTo(d); void load(d, d) }}>Сегодня</button>
        <button className="btn-secondary btn-sm" onClick={() => { const d = shiftDay(todayIso(), -1); setFrom(d); setTo(d); void load(d, d) }}>Вчера</button>
        <label>Канал
          <select value={source} onChange={e => setSource(e.target.value)}>
            <option value="">все</option>
            {Object.entries(CLIENT_SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="NONE">не указан</option>
          </select>
        </label>
        <label>Скидка
          <select value={modifierId} onChange={e => setModifierId(e.target.value)}>
            <option value="">любая / без</option>
            {modifiers.map(m => <option key={m.id} value={m.id}>{m.name} ({modifierText(m)}){m.promo_code ? ` · ${m.promo_code}` : ''}</option>)}
          </select>
        </label>
        <label>Промокод
          <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="любой" style={{ width: 120 }} />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={includeCancelled} onChange={e => setIncludeCancelled(e.target.checked)} />
          с отменёнными
        </label>
        <button className="btn-primary" onClick={() => void load()} disabled={loading}>{loading ? 'Строю…' : 'Построить'}</button>
        <button className="btn-secondary" onClick={() => setShowCols(v => !v)}>Колонки</button>
        {rows && rows.length > 0 && (
          <>
            <button className="btn-secondary" onClick={exportOrders}>Excel: заказы</button>
            <button className="btn-secondary" onClick={exportClients} title="Уникальные клиенты из отчёта и их заказы">Excel: клиенты</button>
          </>
        )}
      </div>
      {showCols && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 'var(--font-sm)' }}>
          {COLUMNS.map(c => (
            <label key={c.key} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={cols.includes(c.key)}
                     onChange={e => setCols(prev => e.target.checked
                       ? COLUMNS.map(x => x.key).filter(k => prev.includes(k) || k === c.key)
                       : prev.filter(k => k !== c.key))} />
              {c.label}
            </label>
          ))}
        </div>
      )}
      {rows && (
        <>
          <div style={{ margin: '12px 0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span>Заказов: <b>{rows.length}</b></span>
            <span>Выручка (чеки): <b>{total.toLocaleString('ru-RU')} ₽</b></span>
            {bySource.map(s => (
              <span key={s.label} style={{ color: 'var(--c-text-secondary)' }}>{s.label}: {s.count} · {s.revenue.toLocaleString('ru-RU')} ₽</span>
            ))}
          </div>
          {rows.length === 0 ? <div className="empty">Заказов нет</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>{shown.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {rows.slice(0, 500).map(r => (
                    <tr key={r.id}>
                      {shown.map(c => {
                        const v = c.value(r)
                        return <td key={c.key}>{v instanceof Date ? v.toLocaleString('ru') : typeof v === 'number' ? v.toLocaleString('ru-RU') : v}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 500 && <div className="empty">На экране первые 500 заказов, в Excel — все {rows.length}.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
