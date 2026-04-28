import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFilteredItems } from '../api/services'
import { getItemTypes, getEmployees } from '../api/references'
import type { OrderItem, ItemType, Employee, OrderItemStatus } from '../types'

const ITEM_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Создана', IN_PROGRESS: 'В работе', PARTIALLY_DONE: 'Частично готова', DONE: 'Готова', CANCELLED: 'Отменена',
}

const ALL_ITEM_STATUSES: OrderItemStatus[] = ['CREATED', 'IN_PROGRESS', 'PARTIALLY_DONE', 'DONE', 'CANCELLED']

export default function ItemsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<OrderItem[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)

  const [statusFilter, setStatusFilter] = useState<OrderItemStatus | ''>('')
  const [itemTypeFilter, setItemTypeFilter] = useState<number | ''>('')
  const [orderFilter, setOrderFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<number | ''>('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 20

  useEffect(() => {
    Promise.all([getItemTypes(), getEmployees()]).then(([types, emps]) => {
      setItemTypes(types)
      setEmployees(emps)
    })
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = {
        status: statusFilter || undefined,
        itemTypeId: itemTypeFilter || undefined,
        orderId: orderFilter ? Number(orderFilter) : undefined,
        employeeId: employeeFilter || undefined,
        page,
        size: PAGE_SIZE,
      }
      const data = await getFilteredItems(params)
      setItems(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter, itemTypeFilter, orderFilter, employeeFilter, page])

  const resetFilters = () => {
    setStatusFilter('')
    setItemTypeFilter('')
    setOrderFilter('')
    setEmployeeFilter('')
    setPage(0)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Позиции заказов</h1>
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Статус</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as OrderItemStatus | ''); setPage(0) }}>
            <option value="">Все</option>
            {ALL_ITEM_STATUSES.map(s => <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Тип позиции</label>
          <select value={itemTypeFilter} onChange={e => { setItemTypeFilter(e.target.value ? Number(e.target.value) : ''); setPage(0) }}>
            <option value="">Все типы</option>
            {itemTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>ID заказа</label>
          <input
            type="number"
            value={orderFilter}
            onChange={e => { setOrderFilter(e.target.value); setPage(0) }}
            placeholder="Номер заказа"
          />
        </div>
        <div className="form-group">
          <label>Исполнитель</label>
          <select value={employeeFilter} onChange={e => { setEmployeeFilter(e.target.value ? Number(e.target.value) : ''); setPage(0) }}>
            <option value="">Все</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <button className="btn-secondary" onClick={resetFilters}>Сбросить</button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Заказ</th>
                <th>Тип</th>
                <th>Описание</th>
                <th>Статус</th>
                <th>Стоимость</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={6} className="empty">Позиции не найдены</td></tr>
              ) : items.map(item => (
                <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${item.order_id}`)}>
                  <td>{item.id}</td>
                  <td>#{item.order_id}</td>
                  <td>{item.item_type_name ?? `Тип #${item.item_type_id}`}</td>
                  <td>{item.description || '—'}</td>
                  <td>
                    <span className={`badge badge-${item.status.toLowerCase()}`}>
                      {ITEM_STATUS_LABELS[item.status] ?? item.status}
                    </span>
                  </td>
                  <td>{Number(item.price).toFixed(2)} ₽</td>
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
