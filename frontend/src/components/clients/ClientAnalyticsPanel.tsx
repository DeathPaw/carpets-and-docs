import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  getClientAnalytics,
  type ClientAnalyticsFilters, type ClientAnalyticsResponse, type ClientAnalyticsRow,
} from '../../api/clients'
import MultiSelectFilter from '../MultiSelectFilter'
import {
  CLIENT_SOURCE_LABELS, RESTART_STATUS_LABELS, GENDER_LABELS,
} from '../../constants/statuses'

/**
 * Портрет клиентской базы (правки №1 и №2 от 13.09).
 *
 * <p>Кто наши клиенты: по районам, источникам, скидкам, полу и возрасту, с
 * количеством заказов и суммами. Выгрузка в Excel берёт ровно то, что сейчас
 * отобрано фильтрами, и только выбранные колонки — файл идёт в рассылки и
 * сводные таблицы, лишние поля там мешают.
 */

/** Колонки выгрузки. value — как значение попадает в ячейку Excel. */
const COLUMNS: {
  key: string
  label: string
  width: number
  value: (r: ClientAnalyticsRow) => string | number | Date | null
}[] = [
  { key: 'id',             label: 'ID клиента',           width: 10, value: r => r.id },
  { key: 'name',           label: 'ФИО / организация',    width: 32, value: r => r.name },
  { key: 'client_type',    label: 'Тип клиента',          width: 14, value: r => r.client_type === 'LEGAL_ENTITY' ? 'Юрлицо' : 'Физлицо' },
  { key: 'phone',          label: 'Телефон',              width: 18, value: r => r.phone ?? '' },
  { key: 'extra_phone',    label: 'Доп. телефон',         width: 18, value: r => r.extra_phone ?? '' },
  { key: 'address',        label: 'Адрес',                width: 40, value: r => r.address ?? '' },
  { key: 'apartment',      label: 'Квартира',             width: 10, value: r => r.apartment ?? '' },
  { key: 'district',       label: 'Район',                width: 18, value: r => r.district ?? '' },
  { key: 'gender',         label: 'Пол',                  width: 12, value: r => r.gender ? (GENDER_LABELS[r.gender] || r.gender) : '' },
  { key: 'age',            label: 'Возраст',              width: 10, value: r => r.age ?? '' },
  { key: 'source',         label: 'Источник обращения',   width: 28, value: r => r.source ? (CLIENT_SOURCE_LABELS[r.source] || r.source) : '' },
  { key: 'source_note',    label: 'Уточнение источника',  width: 24, value: r => r.source_note ?? '' },
  { key: 'restart_status', label: 'Статус перезапуска',   width: 32, value: r => r.restart_status ? (RESTART_STATUS_LABELS[r.restart_status] || r.restart_status) : '' },
  { key: 'has_discount',   label: 'Есть скидка',          width: 12, value: r => (r.discounts || r.is_pensioner) ? 'Да' : 'Нет' },
  { key: 'discounts',      label: 'Тип скидки',           width: 28, value: r => r.discounts ?? (r.is_pensioner ? 'Пенсионер' : '') },
  { key: 'discount_percent', label: 'Размер скидки, %',   width: 16, value: r => Number(r.discount_percent || 0) },
  { key: 'orders_count',   label: 'Заказов',              width: 10, value: r => Number(r.orders_count || 0) },
  { key: 'total_spent',    label: 'Сумма заказов, ₽',     width: 16, value: r => Number(r.total_spent || 0) },
  { key: 'first_order',    label: 'Первый заказ',         width: 14, value: r => r.first_order ? new Date(r.first_order) : '' },
  { key: 'last_order',     label: 'Последний заказ',      width: 14, value: r => r.last_order ? new Date(r.last_order) : '' },
  { key: 'comment',        label: 'Комментарий',          width: 30, value: r => r.comment ?? '' },
]

export default function ClientAnalyticsPanel({ districtNames }: { districtNames: string[] }) {
  const [filters, setFilters] = useState<ClientAnalyticsFilters>({ sortBy: 'orders_count', sortDir: 'desc' })
  const [data, setData] = useState<ClientAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [selectedCols, setSelectedCols] = useState<string[]>(COLUMNS.map(c => c.key))

  useEffect(() => {
    setLoading(true)
    getClientAnalytics({ ...filters, limit: 2000 })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [filters])

  const set = (patch: Partial<ClientAnalyticsFilters>) => setFilters(f => ({ ...f, ...patch }))

  /** Клик по заголовку: первый раз — по убыванию (интересны самые крупные), второй — наоборот. */
  const sortBy = (key: string) => set({
    sortBy: key,
    sortDir: filters.sortBy === key && filters.sortDir === 'desc' ? 'asc' : 'desc',
  })
  const sortMark = (key: string) => filters.sortBy === key ? (filters.sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  const rows = data?.rows ?? []
  const summary = data?.summary

  const exportXLSX = () => {
    const cols = COLUMNS.filter(c => selectedCols.includes(c.key))
    const headers = cols.map(c => c.label)
    const body = rows.map(r => cols.map(c => c.value(r)))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body], { cellDates: true })
    ws['!cols'] = cols.map(c => ({ wch: c.width }))
    // Формат денег и дат: тип ячейки aoa_to_sheet уже проставил, задаём отображение.
    for (let i = 0; i < body.length; i++) {
      cols.forEach((c, ci) => {
        const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: ci })]
        if (!cell) return
        if (c.key === 'total_spent') cell.z = '#,##0.00'
        if (c.key === 'first_order' || c.key === 'last_order') cell.z = 'dd.mm.yyyy'
      })
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Клиенты')
    const stamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Клиенты_${stamp}.xlsx`)
    setShowExport(false)
  }

  const activeFilterCount = useMemo(() => [
    filters.source, filters.restartStatus, filters.gender, filters.clientType,
    filters.onlyRegular, filters.withDiscount, filters.minOrders,
    filters.districts?.length, filters.search,
  ].filter(Boolean).length, [filters])

  return (
    <div>
      {/* Фильтры сегмента. Выгрузка берёт ровно то, что тут отобрано. */}
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
          <label>Поиск</label>
          <input
            value={filters.search ?? ''}
            onChange={e => set({ search: e.target.value || undefined })}
            placeholder="Имя, телефон, адрес"
          />
        </div>
        <div className="form-group" style={{ width: 180, marginBottom: 0 }}>
          <label>Район</label>
          {/* Ширину задаём явно: по умолчанию компонент шире обёртки и
              наезжает на соседний фильтр. */}
          <MultiSelectFilter
            options={districtNames.map(d => ({ value: d, label: d }))}
            value={filters.districts ?? []}
            onChange={v => set({ districts: v.length ? v : undefined })}
            placeholder="Все"
            searchable
            width={180}
          />
        </div>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Источник</label>
          <select value={filters.source ?? ''} onChange={e => set({ source: e.target.value || undefined })}>
            <option value="">Все</option>
            {Object.entries(CLIENT_SOURCE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ width: 220, marginBottom: 0 }}>
          <label>Статус перезапуска</label>
          <select value={filters.restartStatus ?? ''} onChange={e => set({ restartStatus: e.target.value || undefined })}>
            <option value="">Все</option>
            {Object.entries(RESTART_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ width: 140, marginBottom: 0 }}>
          <label>Пол</label>
          <select value={filters.gender ?? ''} onChange={e => set({ gender: e.target.value || undefined })}>
            <option value="">Все</option>
            {Object.entries(GENDER_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ width: 140, marginBottom: 0 }}>
          <label>Тип клиента</label>
          <select value={filters.clientType ?? ''} onChange={e => set({ clientType: e.target.value || undefined })}>
            <option value="">Все</option>
            <option value="INDIVIDUAL">Физлица</option>
            <option value="LEGAL_ENTITY">Юрлица</option>
          </select>
        </div>
        <label className="toggle-box" style={{ marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={!!filters.onlyRegular}
            onChange={e => set({ onlyRegular: e.target.checked || undefined })}
          />
          <span title="Клиенты, у которых больше одного заказа">Постоянные</span>
        </label>
        <label className="toggle-box" style={{ marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={!!filters.withDiscount}
            onChange={e => set({ withDiscount: e.target.checked || undefined })}
          />
          <span title="Есть персональная скидка или признак пенсионера">Со скидкой</span>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {activeFilterCount > 0 && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => setFilters({ sortBy: filters.sortBy, sortDir: filters.sortDir })}
            >Сбросить фильтры</button>
          )}
          <button className="btn-secondary" onClick={() => setShowExport(true)} disabled={rows.length === 0}>
            Экспорт Excel
          </button>
        </div>
      </div>

      {summary && (
        <div className="card" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <Stat label="Клиентов" value={summary.clients} />
          <Stat label="Постоянных" value={summary.regular} hint="больше одного заказа" />
          <Stat label="Со скидками" value={summary.with_discount} />
          <Stat label="Заказов" value={summary.orders} />
          <Stat label="Выручка, ₽" value={Math.round(summary.revenue)} />
          <Stat label="Средний чек, ₽" value={Math.round(summary.avg_order)} />
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Под эти условия клиентов нет</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => sortBy('name')}>Клиент{sortMark('name')}</th>
                  <th style={{ width: 160 }}>Телефон</th>
                  <th style={{ width: 150 }}>Район</th>
                  <th style={{ width: 110 }}>Пол</th>
                  <th style={{ width: 90, cursor: 'pointer' }} onClick={() => sortBy('age')}>Возраст{sortMark('age')}</th>
                  <th style={{ width: 180 }}>Источник</th>
                  <th style={{ width: 200 }}>Скидки</th>
                  <th style={{ width: 90, cursor: 'pointer' }} onClick={() => sortBy('orders_count')}>Заказов{sortMark('orders_count')}</th>
                  <th style={{ width: 130, cursor: 'pointer' }} onClick={() => sortBy('total_spent')}>Сумма, ₽{sortMark('total_spent')}</th>
                  <th style={{ width: 120 }}>Первый</th>
                  <th style={{ width: 120, cursor: 'pointer' }} onClick={() => sortBy('last_order')}>Последний{sortMark('last_order')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      {r.name}
                      {r.client_type === 'LEGAL_ENTITY' && (
                        <span style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)' }}> · юрлицо</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                    <td>{r.district || '—'}</td>
                    <td>{r.gender ? (GENDER_LABELS[r.gender] || r.gender) : '—'}</td>
                    <td>{r.age ?? '—'}</td>
                    <td>{r.source ? (CLIENT_SOURCE_LABELS[r.source] || r.source) : '—'}</td>
                    <td>
                      {r.discounts || (r.is_pensioner ? 'Пенсионер' : '—')}
                    </td>
                    <td>{r.orders_count}</td>
                    <td>{Number(r.total_spent || 0).toFixed(0)}</td>
                    <td>{r.first_order ? new Date(r.first_order).toLocaleDateString('ru') : '—'}</td>
                    <td>{r.last_order ? new Date(r.last_order).toLocaleDateString('ru') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Выгрузка клиентов</h2>
            <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>
              В файл попадут {rows.length} клиент(ов) — те, что отобраны фильтрами.
              Отметьте колонки, которые нужны.
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 4, maxHeight: '45vh', overflowY: 'auto', marginBottom: 12,
            }}>
              {COLUMNS.map(c => (
                <label key={c.key} className="toggle-box">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(c.key)}
                    onChange={e => setSelectedCols(prev => e.target.checked
                      ? [...prev, c.key]
                      : prev.filter(k => k !== c.key))}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary btn-sm" onClick={() => setSelectedCols(COLUMNS.map(c => c.key))}>Все</button>
              <button className="btn-secondary btn-sm" onClick={() => setSelectedCols([])}>Снять все</button>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowExport(false)}>Отмена</button>
              <button className="btn-primary" onClick={exportXLSX} disabled={selectedCols.length === 0}>
                Выгрузить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{value.toLocaleString('ru')}</div>
    </div>
  )
}
