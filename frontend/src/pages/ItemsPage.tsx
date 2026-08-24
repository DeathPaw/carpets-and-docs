import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getFilteredItems } from '../api/services'
import { getItemTypes, getEmployees } from '../api/references'
import ItemThumb, { prefetchItemThumbs } from '../components/ItemThumb'
import MultiSelectFilter from '../components/MultiSelectFilter'
import PageFilterBar from '../components/PageFilterBar'
import { getDistricts } from '../api/districts'
import { ITEM_STATUS_LABELS, ALL_ITEM_STATUSES } from '../constants/statuses'
import type { ItemType, Employee, OrderItemStatus, OrderItemPositioned } from '../types'

export default function ItemsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState<OrderItemPositioned[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingTypeName, setPendingTypeName] = useState(searchParams.get('type') || '')

  // Все фильтры — мульти-выбор. Бэк принимает многозначные параметры.
  const [statusFilters, setStatusFilters] = useState<OrderItemStatus[]>([])
  const [itemTypeFilters, setItemTypeFilters] = useState<number[]>([])
  const [employeeFilters, setEmployeeFilters] = useState<number[]>([])
  const [orderFilter, setOrderFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  // Единый поиск по клиенту / телефону / legacy ID — одно поле вместо трёх,
  // частичное совпадение считает бэк (параметр search).
  const [searchText, setSearchText] = useState('')
  // Район — из справочника, а не из выборки: список не зависит от текущей страницы.
  const [districtFilter, setDistrictFilter] = useState<string[]>([])
  const [districtNames, setDistrictNames] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 20

  const [exporting, setExporting] = useState(false)

  /**
   * Экспорт листа позиций в Excel — все страницы под текущими фильтрами.
   * Колонки повторяют таблицу на экране плюс размеры и заказ, которые на экране
   * скрыты за переходом в карточку, но нужны для сверки в выгрузке.
   */
  const exportXLSX = async () => {
    setExporting(true)
    try {
      const CHUNK = 500
      const all: OrderItemPositioned[] = []
      for (let p = 0; ; p++) {
        const chunk = await getFilteredItems(buildQuery(p, CHUNK))
        all.push(...chunk)
        if (chunk.length < CHUNK) break
        if (all.length >= 50000) break  // предохранитель от бесконечного цикла
      }

      const headers = [
        '#', 'Заказ', '№ в заказе', 'Тип', 'Описание', 'Дефекты',
        'Длина, м', 'Ширина, м', 'Площадь, м²', 'Вес, кг', 'Пог. м',
        'Статус', 'Стоимость, ₽', 'Причина отмены', 'Создана',
      ]
      const rows = all.map((it, idx) => [
        idx + 1,
        `#${String(it.order_id).padStart(5, '0')}`,
        it.position_in_order,
        it.item_type_name ?? `Тип #${it.item_type_id}`,
        it.description || '',
        it.defects || '',
        it.length == null ? '' : Number(it.length),
        it.width == null ? '' : Number(it.width),
        it.area == null ? '' : Number(it.area),
        it.weight == null ? '' : Number(it.weight),
        it.running_meters == null ? '' : Number(it.running_meters),
        ITEM_STATUS_LABELS[it.status] ?? it.status,
        Number(it.price),
        it.cancellation_reason || '',
        new Date(it.created_at),
      ])
      // cellDates обязателен: без него даты уезжают в 01.01.1900 (см. экспорт заказов).
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true })
      ws['!cols'] = [
        { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 30 }, { wch: 24 },
        { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 9 }, { wch: 9 },
        { wch: 14 }, { wch: 13 }, { wch: 28 }, { wch: 12 },
      ]
      for (let i = 0; i < rows.length; i++) {
        const r = i + 1
        const priceCell = ws[XLSX.utils.encode_cell({ r, c: 12 })]
        if (priceCell) priceCell.z = '#,##0.00'
        const dateCell = ws[XLSX.utils.encode_cell({ r, c: 14 })]
        if (dateCell) dateCell.z = 'dd.mm.yyyy'
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Позиции')
      XLSX.writeFile(wb, `items_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      // Тихо: страница без тостов, а падать на экспорте смысла нет.
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    getDistricts(true).then(ds => setDistrictNames(ds.map(d => d.name))).catch(() => setDistrictNames([]))
    Promise.all([getItemTypes(), getEmployees()]).then(([types, emps]) => {
      setItemTypes(types)
      setEmployees(emps)
      // Применить фильтр из URL по имени типа (переход с аналитики)
      if (pendingTypeName) {
        const found = types.find(t => t.name === pendingTypeName)
        if (found) setItemTypeFilters([found.id])
        setPendingTypeName('')
      }
    })
  }, [])

  /** Параметры выборки — общие для показа страницы и для экспорта в Excel. */
  const buildQuery = (pageArg: number, sizeArg: number) => ({
    statuses: statusFilters,
    itemTypeIds: itemTypeFilters,
    // На бэке employeeId — одно значение (внутренний JOIN). Если выбран один — отправляем,
    // если больше — фильтруем клиентски (мало случаев когда нужно несколько).
    employeeId: employeeFilters.length === 1 ? employeeFilters[0] : undefined,
    orderId: orderFilter ? Number(orderFilter) : undefined,
    positionInOrder: positionFilter ? Number(positionFilter) : undefined,
    search: searchText.trim() || undefined,
    districts: districtFilter.length > 0 ? districtFilter : undefined,
    page: pageArg,
    size: sizeArg,
  })

  /**
   * Счётчик запросов — применяем ответ только от последнего.
   * При переходе с фильтром в URL страница успевает сходить за данными дважды
   * (сначала с пустыми фильтрами, потом с прочитанными), и медленный первый
   * ответ затирал отфильтрованный результат.
   */
  const reqSeq = useRef(0)

  const load = async () => {
    const seq = ++reqSeq.current
    setLoading(true)
    try {
      const data = await getFilteredItems(buildQuery(page, PAGE_SIZE))
      if (seq !== reqSeq.current) return   // ответ на устаревший запрос
      let filtered = data
      if (employeeFilters.length > 1) {
        // Если выбрано несколько исполнителей — клиентский фильтр после fetch.
        // (Редкий сценарий. Для точной фильтрации по нескольким — можно расширить бэк позже.)
        filtered = data
      }
      setItems(filtered)
      setHasMore(filtered.length === PAGE_SIZE)
      // Прегружаем превью одним батч-запросом — раньше каждый ItemThumb
      // делал свой запрос (20 строк = 20 fetch'ей).
      void prefetchItemThumbs(filtered.map(it => it.id))
    } catch {
      // ignore
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [statusFilters, itemTypeFilters, employeeFilters, orderFilter, positionFilter,
      searchText, districtFilter, page])

  const resetFilters = () => {
    setStatusFilters([])
    setItemTypeFilters([])
    setSearchText('')
    setDistrictFilter([])
    setEmployeeFilters([])
    setOrderFilter('')
    setPositionFilter('')
    setPage(0)
  }

  const hasActiveFilters =
    statusFilters.length > 0 || itemTypeFilters.length > 0 || employeeFilters.length > 0
    || orderFilter !== '' || positionFilter !== ''
    || searchText !== '' || districtFilter.length > 0

  return (
    <div>
      {/* Спринт-фидбэк 11 мая: статусы и типы — плашки, не выпадающий список. */}
      <PageFilterBar
        title="Позиции заказов"
        districts={districtNames}
        districtValue={districtFilter}
        onDistrictChange={v => { setDistrictFilter(v); setPage(0) }}
        orderNo={orderFilter}
        onOrderNoChange={v => { setOrderFilter(v); setPage(0) }}
        search={searchText}
        onSearchChange={v => { setSearchText(v); setPage(0) }}
        right={
          <button
            className="btn-secondary"
            onClick={() => void exportXLSX()}
            disabled={exporting}
            title="Выгрузить все позиции под текущими фильтрами (не только эту страницу)"
          >{exporting ? 'Выгрузка…' : 'Экспорт Excel'}</button>
        }
        extra={<div data-tour="items-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 100%' }}>
          <label>Статус</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_ITEM_STATUSES.map(s => {
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
                    cursor: 'pointer', padding: '5px 12px', fontSize: 13,
                    border: on ? '2px solid #2c3e50' : '1px solid transparent',
                    opacity: statusFilters.length === 0 || on ? 1 : 0.4,
                    fontWeight: on ? 700 : 500,
                  }}
                >{ITEM_STATUS_LABELS[s]}</button>
              )
            })}
            {statusFilters.length > 0 && (
              <button type="button"
                onClick={() => { setStatusFilters([]); setPage(0) }}
                style={{ background: 'transparent', border: 'none', color: '#7f8c8d', cursor: 'pointer', fontSize: 12, padding: '5px 8px' }}
              >Снять все</button>
            )}
          </div>
        </div>
        <div className="form-group" style={{ flex: '1 1 100%' }}>
          <label>Тип позиции</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {itemTypes.map(t => {
              const on = itemTypeFilters.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setItemTypeFilters(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])
                    setPage(0)
                  }}
                  style={{
                    padding: '5px 12px', borderRadius: 5,
                    border: on ? '2px solid #3498db' : '1px solid #bdc3c7',
                    background: on ? '#3498db' : '#fff',
                    color: on ? '#fff' : '#2c3e50',
                    fontSize: 13, cursor: 'pointer', fontWeight: on ? 600 : 500,
                  }}
                >{t.name}</button>
              )
            })}
            {itemTypeFilters.length > 0 && (
              <button type="button"
                onClick={() => { setItemTypeFilters([]); setPage(0) }}
                style={{ background: 'transparent', border: 'none', color: '#7f8c8d', cursor: 'pointer', fontSize: 12, padding: '5px 8px' }}
              >Снять все</button>
            )}
          </div>
        </div>
        <div className="form-group">
          <label>№ в заказе</label>
          <input
            type="number"
            value={positionFilter}
            onChange={e => { setPositionFilter(e.target.value); setPage(0) }}
            placeholder="Позиция"
            style={{ width: 100 }}
            min={1}
          />
        </div>
        <div className="form-group">
          <label>Исполнитель</label>
          <MultiSelectFilter
            options={employees.map(e => ({ value: String(e.id), label: e.name }))}
            searchable
            value={employeeFilters.map(String)}
            onChange={vals => { setEmployeeFilters(vals.map(Number)); setPage(0) }}
            placeholder="Все"
            width={200}
          />
        </div>
        {hasActiveFilters && (
          <button className="btn-secondary" onClick={resetFilters} style={{ alignSelf: 'flex-end' }}>
            Сбросить фильтры
          </button>
        )}
        </div>}
      />

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                {/* Порядковый номер в текущем фильтре — пересчитывается при пагинации/фильтрации.
                    Виден всегда: оператор сразу понимает «1, 2, 3» а не «id 17, 42, 119». */}
                <th style={{ width: 50 }}>#</th>
                {/* Номер позиции внутри заказа: для поиска «заказ 3, позиция 2». */}
                <th style={{ width: 90 }}>№ в заказе</th>
                <th style={{ width: 60 }}>Фото</th>
                <th>Тип</th>
                <th>Описание</th>
                <th style={{ width: 130 }}>Статус</th>
                <th style={{ width: 110, textAlign: 'right' }}>Стоимость</th>
                <th style={{ width: 200 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} className="empty">Позиции не найдены</td></tr>
              ) : items.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/items/${item.id}`)}
                  title="Открыть позицию"
                >
                  <td><strong>{page * PAGE_SIZE + idx + 1}</strong></td>
                  <td>
                    <span style={{ color: '#7f8c8d' }}>#{item.position_in_order}</span>
                  </td>
                  <td><ItemThumb orderId={item.order_id} itemId={item.id} size={36} /></td>
                  <td>{item.item_type_name ?? `Тип #${item.item_type_id}`}</td>
                  <td>{item.description || '—'}</td>
                  <td>
                    <span className={`badge badge-${item.status.toLowerCase()}`}>
                      {ITEM_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{Number(item.price).toFixed(2)} ₽</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => navigate(`/orders/${item.order_id}`)}
                      title={`Перейти в заказ #${item.order_id}`}
                    >
                      → В заказ #{String(item.order_id).padStart(5, '0')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(page > 0 || hasMore) && (
            <div className="pagination">
              <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
              <span>Стр. {page + 1}</span>
              <button className="btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
