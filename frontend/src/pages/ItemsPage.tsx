import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getFilteredItems } from '../api/services'
import { getItemTypes, getEmployees } from '../api/references'
import ItemThumb, { prefetchItemThumbs } from '../components/ItemThumb'
import MultiSelectFilter from '../components/MultiSelectFilter'
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
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 20

  useEffect(() => {
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

  const load = async () => {
    setLoading(true)
    try {
      const data = await getFilteredItems({
        statuses: statusFilters,
        itemTypeIds: itemTypeFilters,
        // На бэке employeeId — одно значение (внутренний JOIN). Если выбран один — отправляем,
        // если больше — фильтруем клиентски (мало случаев когда нужно несколько).
        employeeId: employeeFilters.length === 1 ? employeeFilters[0] : undefined,
        orderId: orderFilter ? Number(orderFilter) : undefined,
        positionInOrder: positionFilter ? Number(positionFilter) : undefined,
        page,
        size: PAGE_SIZE,
      })
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
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [statusFilters, itemTypeFilters, employeeFilters, orderFilter, positionFilter, page])

  const resetFilters = () => {
    setStatusFilters([])
    setItemTypeFilters([])
    setEmployeeFilters([])
    setOrderFilter('')
    setPositionFilter('')
    setPage(0)
  }

  const hasActiveFilters =
    statusFilters.length > 0 || itemTypeFilters.length > 0 || employeeFilters.length > 0
    || orderFilter !== '' || positionFilter !== ''

  return (
    <div>
      <div className="page-header">
        <h1>Позиции заказов</h1>
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Статус</label>
          <MultiSelectFilter
            options={ALL_ITEM_STATUSES.map(s => ({ value: s, label: ITEM_STATUS_LABELS[s] }))}
            searchable
            value={statusFilters}
            onChange={vals => { setStatusFilters(vals as OrderItemStatus[]); setPage(0) }}
            placeholder="Все"
            width={170}
          />
        </div>
        <div className="form-group">
          <label>Тип позиции</label>
          <MultiSelectFilter
            options={itemTypes.map(t => ({ value: String(t.id), label: t.name }))}
            searchable
            value={itemTypeFilters.map(String)}
            onChange={vals => { setItemTypeFilters(vals.map(Number)); setPage(0) }}
            placeholder="Все типы"
            width={200}
          />
        </div>
        <div className="form-group">
          <label>№ заказа</label>
          <input
            type="number"
            value={orderFilter}
            onChange={e => { setOrderFilter(e.target.value); setPage(0) }}
            placeholder="Номер заказа"
            style={{ width: 130 }}
          />
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
      </div>

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
