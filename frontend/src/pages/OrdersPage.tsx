import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getOrdersQuery } from '../api/orders'
import { useToast } from '../components/Toast'
import MultiSelectFilter from '../components/MultiSelectFilter'
import CreateOrderModal from '../components/orders/CreateOrderModal'
import { isViewerMode } from '../utils/viewer'
import type { Order, OrderStatus } from '../types'

// Подписи и список статусов теперь общие — см. constants/statuses.ts
import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ALL_ORDER_STATUSES as ALL_STATUSES,
  PAYMENT_LABELS,
} from '../constants/statuses'
import { formatOrderNumber } from '../utils/format'

function StatusBadge({ status }: { status: string }) {
  // STATUS_LABELS типизирован Record<OrderStatus, string>; даже если status из API
  // окажется неизвестным — упадём на сам код вместо runtime-ошибки.
  const label = (STATUS_LABELS as Record<string, string>)[status] ?? status
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {label}
    </span>
  )
}


export default function OrdersPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [totalElements, setTotalElements] = useState(0)

  // Парсим из URL: ?statuses=A,B,C или ?status=A
  const initialStatuses = (() => {
    const multi = searchParams.get('statuses')
    if (multi) return multi.split(',').filter(Boolean) as OrderStatus[]
    const single = searchParams.get('status')
    return single ? [single as OrderStatus] : []
  })()
  const [statusFilters, setStatusFilters] = useState<OrderStatus[]>(initialStatuses)

  const initialClientId = searchParams.get('clientId')
  const [clientIdFilter, setClientIdFilter] = useState<number | null>(
    initialClientId ? Number(initialClientId) : null
  )
  const [clientFilterLabel, setClientFilterLabel] = useState<string>(
    searchParams.get('clientName') || ''
  )

  // Флаги-фильтры с дашборда (точечный переход по виджету «Проблемные заказы» и т.п.):
  // ?noCoords=true       — есть адрес, но нет координат
  // ?overdueActual=true  — просрочена фактическая дата
  // ?badAddress=true     — пора забирать/доставлять, но адреса нет
  const [noCoordsFilter, setNoCoordsFilter] = useState<boolean>(
    searchParams.get('noCoords') === 'true'
  )
  const [overdueActualFilter, setOverdueActualFilter] = useState<boolean>(
    searchParams.get('overdueActual') === 'true'
  )
  const [badAddressFilter, setBadAddressFilter] = useState<boolean>(
    searchParams.get('badAddress') === 'true'
  )
  const [paymentFilters, setPaymentFilters] = useState<string[]>([])
  const [orderIdSearch, setOrderIdSearch] = useState('')
  const [legacyIdSearch, setLegacyIdSearch] = useState('')
  const [clientPhoneSearch, setClientPhoneSearch] = useState('')
  const [clientNameSearch, setClientNameSearch] = useState('')
  // Поле даты для фильтра — операторам часто нужно искать «доставки на этой неделе»,
  // не «созданные на этой неделе». Через select оператор выбирает по какому полю фильтровать.
  const [dateField, setDateField] = useState<'created_at' | 'pickup_date' | 'delivery_date'>('created_at')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  // Мульти-сортировка: массив пар (поле, направление). Первый — главный, потом тай-брейкер.
  const [sortKeys, setSortKeys] = useState<{ field: string; dir: 'asc' | 'desc' }[]>([
    { field: 'id', dir: 'desc' },
  ])
  const PAGE_SIZE = 20

  // Синхронизация фильтра статуса/клиента из URL при навигации (открытие страницы из другого места)
  useEffect(() => {
    const multi = searchParams.get('statuses')
    if (multi) {
      setStatusFilters(multi.split(',').filter(Boolean) as OrderStatus[])
    } else {
      const s = searchParams.get('status')
      if (s) setStatusFilters([s as OrderStatus])
    }
    const cid = searchParams.get('clientId')
    if (cid) setClientIdFilter(Number(cid))
    const cname = searchParams.get('clientName')
    if (cname) setClientFilterLabel(cname)
    setNoCoordsFilter(searchParams.get('noCoords') === 'true')
    setOverdueActualFilter(searchParams.get('overdueActual') === 'true')
    setBadAddressFilter(searchParams.get('badAddress') === 'true')
  }, [searchParams])

  /**
   * Клик по заголовку колонки. Поведение:
   * - Обычный click: оставляет только эту колонку, цикл направлений ↓ → ↑ → нет → ↓ …
   * - Shift+click: добавляет колонку в мульти-сортировку (или переключает направление, если уже добавлена).
   * - Ctrl/Cmd+click: удаляет эту колонку из сортировки (если она там есть).
   */
  const toggleSort = (col: string, mode: 'replace' | 'add' | 'remove' = 'replace') => {
    setSortKeys(prev => {
      const existingIdx = prev.findIndex(k => k.field === col)
      if (mode === 'remove') {
        return existingIdx >= 0 ? prev.filter((_, i) => i !== existingIdx) : prev
      }
      if (mode === 'add') {
        if (existingIdx >= 0) {
          // переключаем направление
          return prev.map((k, i) => i === existingIdx ? { ...k, dir: k.dir === 'desc' ? 'asc' : 'desc' } : k)
        }
        return [...prev, { field: col, dir: 'desc' }]
      }
      // mode === 'replace' (обычный клик)
      if (existingIdx === 0 && prev.length === 1) {
        if (prev[0].dir === 'desc') return [{ field: col, dir: 'asc' }]
        return [] // третий клик снимает сортировку
      }
      return [{ field: col, dir: 'desc' }]
    })
    setPage(0)
  }

  const sortIndicator = (col: string) => {
    const idx = sortKeys.findIndex(k => k.field === col)
    if (idx < 0) return ''
    const k = sortKeys[idx]
    const arrow = k.dir === 'asc' ? '↑' : '↓'
    return sortKeys.length > 1 ? ` ${arrow}${idx + 1}` : ` ${arrow}`
  }

  /** Определяет режим клика по модификаторам клавиатуры. */
  const sortMode = (e: React.MouseEvent): 'replace' | 'add' | 'remove' => {
    if (e.ctrlKey || e.metaKey) return 'remove'
    if (e.shiftKey) return 'add'
    return 'replace'
  }

  const exportXLSX = () => {
    const headers = ['Номер', 'Клиент', 'Статус', 'Сумма, ₽', 'Оплачен', 'Тип оплаты', 'Гарантийный', 'Создан']
    const rows = orders.map(o => [
      o.id,
      o.client_name,
      STATUS_LABELS[o.status] || o.status,
      Number(o.total_amount),
      o.paid ? 'Да' : 'Нет',
      o.paid ? ((o.payment_type ? PAYMENT_LABELS[o.payment_type] : '') ?? '') : '',
      o.is_warranty ? 'Да' : '',
      new Date(o.created_at),
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

    // \u0428\u0438\u0440\u0438\u043D\u044B \u043A\u043E\u043B\u043E\u043D\u043E\u043A (\u0432 \u0441\u0438\u043C\u0432\u043E\u043B\u0430\u0445)
    ws['!cols'] = [
      { wch: 8 },   // \u041D\u043E\u043C\u0435\u0440
      { wch: 32 },  // \u041A\u043B\u0438\u0435\u043D\u0442
      { wch: 16 },  // \u0421\u0442\u0430\u0442\u0443\u0441
      { wch: 12 },  // \u0421\u0443\u043C\u043C\u0430
      { wch: 10 },  // \u041E\u043F\u043B\u0430\u0447\u0435\u043D
      { wch: 12 },  // \u0422\u0438\u043F \u043E\u043F\u043B\u0430\u0442\u044B
      { wch: 12 },  // \u0413\u0430\u0440\u0430\u043D\u0442\u0438\u0439\u043D\u044B\u0439
      { wch: 12 },  // \u0421\u043E\u0437\u0434\u0430\u043D
    ]

    // \u0424\u043E\u0440\u043C\u0430\u0442 \u0434\u0435\u043D\u0435\u0436\u043D\u043E\u0439 \u043A\u043E\u043B\u043E\u043D\u043A\u0438 \u0438 \u0434\u0430\u0442\u044B
    for (let i = 0; i < rows.length; i++) {
      const r = i + 1 // \u0441\u0442\u0440\u043E\u043A\u0430 \u0441 \u0434\u0430\u043D\u043D\u044B\u043C\u0438 (\u0437\u0430\u0433\u043E\u043B\u043E\u0432\u043E\u043A \u2014 0)
      const sumCell = ws[XLSX.utils.encode_cell({ r, c: 3 })]
      if (sumCell) { sumCell.t = 'n'; sumCell.z = '#,##0.00' }
      const dateCell = ws[XLSX.utils.encode_cell({ r, c: 7 })]
      if (dateCell) { dateCell.t = 'd'; dateCell.z = 'dd.mm.yyyy' }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '\u0417\u0430\u043A\u0430\u0437\u044B')
    XLSX.writeFile(wb, `orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await getOrdersQuery({
        statuses: statusFilters.length > 0 ? statusFilters : undefined,
        page,
        size: PAGE_SIZE,
        dateFrom: dateFrom || undefined,
        dateField: dateField,
        dateTo: dateTo || undefined,
        legacyId: legacyIdSearch ? Number(legacyIdSearch) : undefined,
        // Бэк принимает paymentType как одно значение или CSV ("CARD,CASH").
        paymentType: paymentFilters.length > 0 ? paymentFilters.join(',') : undefined,
        orderId: orderIdSearch ? Number(orderIdSearch) : undefined,
        clientPhone: clientPhoneSearch || undefined,
        clientName: clientNameSearch || undefined,
        clientId: clientIdFilter || undefined,
        sortBy: sortKeys.map(k => k.field),
        sortDir: sortKeys.map(k => k.dir),
        noCoords: noCoordsFilter || undefined,
        overdueActual: overdueActualFilter || undefined,
        badAddress: badAddressFilter || undefined,
      })
      setOrders(data.content)
      setTotalElements(data.total_elements)
      setHasMore(data.content.length === PAGE_SIZE)
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка загрузки заказов'
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilters, clientIdFilter, paymentFilters, orderIdSearch, legacyIdSearch, clientPhoneSearch, clientNameSearch, dateFrom, dateTo, dateField, page, sortKeys, noCoordsFilter, overdueActualFilter, badAddressFilter])

  const handleCreated = (order: Order) => {
    setShowCreate(false)
    navigate(`/orders/${order.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Заказы</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={exportXLSX}>Экспорт Excel</button>
          {/* В viewer-mode (моноблок) скрываем мутирующие кнопки. */}
          {!isViewerMode() && (
            <button className="btn-primary" onClick={() => setShowCreate(true)} data-tour="orders-create-btn">+ Новый заказ</button>
          )}
        </div>
      </div>

      {/* Чипы-индикаторы активных «дашбордных» фильтров. Снимаются кнопкой,
          query-param чистится в URL. Описание подсказывает оператору, почему
          список такой короткий. */}
      {(() => {
        const removeFlag = (key: string, setter: (v: boolean) => void) => () => {
          setter(false)
          const sp = new URLSearchParams(searchParams)
          sp.delete(key)
          navigate(`/orders${sp.toString() ? '?' + sp.toString() : ''}`, { replace: true })
        }
        const flagNotice = (text: string, onRemove: () => void, key: string) => (
          <div key={key} className="notice notice-warning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{text}</span>
            <button className="btn-secondary btn-sm" onClick={onRemove}>Снять фильтр</button>
          </div>
        )
        return (
          <>
            {noCoordsFilter && flagNotice(
              'Показаны только заказы с адресом, но без координат — их не видно на карте логистики.',
              removeFlag('noCoords', setNoCoordsFilter), 'noCoords'
            )}
            {overdueActualFilter && flagNotice(
              'Показаны только заказы с просроченной фактической датой забора или доставки.',
              removeFlag('overdueActual', setOverdueActualFilter), 'overdueActual'
            )}
            {badAddressFilter && flagNotice(
              'Показаны только заказы со статусами «к забору» или «готов», у которых не заполнен адрес.',
              removeFlag('badAddress', setBadAddressFilter), 'badAddress'
            )}
          </>
        )
      })()}

      {/* Статусы — отдельная полоса плашек над основными фильтрами (Спринт-фидбэк
          11 мая). Плашки используют те же CSS-классы badge-*, что и в таблице —
          оператор сразу видит цветовую кодировку. Неактивные — приглушённые. */}
      <div className="filters" data-tour="orders-filters" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '1 1 100%' }}>
          <label>Статус</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_STATUSES.map(s => {
              const on = statusFilters.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  className={`badge badge-${s.toLowerCase()}`}
                  onClick={() => {
                    setStatusFilters(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
                    setPage(0)
                  }}
                  style={{
                    cursor: 'pointer',
                    padding: '5px 12px',
                    fontSize: 13,
                    border: on ? '2px solid #2c3e50' : '1px solid transparent',
                    opacity: statusFilters.length === 0 || on ? 1 : 0.4,
                    fontWeight: on ? 700 : 500,
                  }}
                >{STATUS_LABELS[s] || s}</button>
              )
            })}
            {statusFilters.length > 0 && (
              <button
                type="button"
                onClick={() => { setStatusFilters([]); setPage(0) }}
                style={{
                  background: 'transparent', border: 'none', color: '#7f8c8d',
                  cursor: 'pointer', fontSize: 12, padding: '5px 8px',
                }}
              >Снять все</button>
            )}
          </div>
        </div>
        {clientIdFilter && (
          <div className="form-group">
            <label>Клиент</label>
            <button
              type="button"
              onClick={() => { setClientIdFilter(null); setClientFilterLabel(''); setPage(0) }}
              style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, background: '#fef9e7', cursor: 'pointer' }}
              title="Снять фильтр по клиенту"
            >
              {clientFilterLabel || `ID ${clientIdFilter}`} ✕
            </button>
          </div>
        )}
        <div className="form-group">
          <label>Номер заказа</label>
          <input
            type="number"
            value={orderIdSearch}
            onChange={e => { setOrderIdSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по номеру"
            style={{ minWidth: 130 }}
          />
        </div>
        <div className="form-group">
          <label>Тип оплаты</label>
          <MultiSelectFilter
            options={[
              { value: 'CARD',     label: 'Карта' },
              { value: 'CASH',     label: 'Наличные' },
              { value: 'TRANSFER', label: 'Перевод' },
            ]}
            searchable
            value={paymentFilters}
            onChange={vals => { setPaymentFilters(vals); setPage(0) }}
            placeholder="Все"
            width={170}
          />
        </div>
        <div className="form-group">
          <label>Legacy ID</label>
          <input
            type="number"
            value={legacyIdSearch}
            onChange={e => { setLegacyIdSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по legacy ID"
            style={{ minWidth: 140 }}
          />
        </div>
        <div className="form-group">
          <label>Телефон клиента</label>
          <input
            value={clientPhoneSearch}
            onChange={e => { setClientPhoneSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по телефону"
            style={{ minWidth: 140 }}
          />
        </div>
        <div className="form-group">
          <label>Имя клиента</label>
          <input
            value={clientNameSearch}
            onChange={e => { setClientNameSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по имени"
            style={{ minWidth: 140 }}
          />
        </div>
        {/* Блок «Период»: поле даты + диапазон. «Поле даты» раньше жило отдельным
            фильтром, но без контекста было непонятно — что за «поле»? Перенесли
            сюда (фидбэк 11 мая), и оператор сразу видит: фильтруем по диапазону
            ВОТ ЭТОЙ даты. Поле даты сделано плашками — три варианта, дроп-даун
            был лишним. */}
        <div className="form-group">
          <label>Период</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', border: '1px solid #bdc3c7', borderRadius: 6, overflow: 'hidden' }}>
              {[
                { v: 'created_at',   label: 'Создан' },
                { v: 'pickup_date',  label: 'Забор' },
                { v: 'delivery_date',label: 'Доставка' },
              ].map(o => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => { setDateField(o.v as typeof dateField); setPage(0) }}
                  style={{
                    padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 13,
                    background: dateField === o.v ? '#3498db' : '#fff',
                    color: dateField === o.v ? '#fff' : '#2c3e50',
                    fontWeight: dateField === o.v ? 600 : 500,
                  }}
                >{o.label}</button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#7f8c8d' }}>с</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
            <span style={{ fontSize: 12, color: '#7f8c8d' }}>по</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 6, color: '#666', fontSize: '0.85em', gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              {totalElements > 0 && <>Показано {orders.length} из {totalElements} · </>}
              Сортировка: клик — направление (третий снимает),
              Shift+клик — добавить колонку, Ctrl/Cmd+клик — убрать.
            </div>
            {sortKeys.length > 0 && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => { setSortKeys([]); setPage(0) }}
                title="Снять всю сортировку"
              >
                Сбросить сортировку
              </button>
            )}
          </div>
          <table data-tour="orders-table">
            <thead>
              <tr>
                <th onClick={e => toggleSort('id', sortMode(e))} style={{ cursor: 'pointer' }}>
                  #{sortIndicator('id')}
                </th>
                <th onClick={e => toggleSort('client_name', sortMode(e))} style={{ cursor: 'pointer' }}>
                  Клиент{sortIndicator('client_name')}
                </th>
                <th onClick={e => toggleSort('status', sortMode(e))} style={{ cursor: 'pointer' }}>
                  Статус{sortIndicator('status')}
                </th>
                <th onClick={e => toggleSort('total_amount', sortMode(e))} style={{ cursor: 'pointer' }}>
                  Сумма{sortIndicator('total_amount')}
                </th>
                <th>Оплачен</th>
                <th>Гарантийный</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="empty">Заказы не найдены</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${o.id}`)}>
                  <td>{formatOrderNumber(o.id, o.created_at)}{o.legacy_id ? ` (${o.legacy_id})` : ''}</td>
                  <td>{o.client_name}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{Number(o.total_amount).toFixed(2)} &#8381;</td>
                  <td>{o.paid ? ((o.payment_type ? PAYMENT_LABELS[o.payment_type] : '') ?? 'Да') : '—'}</td>
                  <td>{o.is_warranty ? 'Да' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(page > 0 || hasMore) && (
            <div className="pagination">
              <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>&#8592; Назад</button>
              <span>Стр. {page + 1}</span>
              <button className="btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Вперёд &#8594;</button>
            </div>
          )}
        </>
      )}

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  )
}
