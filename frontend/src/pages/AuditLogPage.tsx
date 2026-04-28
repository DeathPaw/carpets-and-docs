import { useEffect, useState } from 'react'
import client from '../api/client'

interface AuditLogEntry {
  id: number
  entity_type: string
  entity_id: number | null
  action: string
  description: string
  occurred_at: string
}

const ENTITY_LABELS: Record<string, string> = {
  ORDER: 'Заказ',
  CLIENT: 'Клиент',
  EMPLOYEE: 'Сотрудник',
  ITEM_TYPE: 'Тип позиции',
  SERVICE_DEFINITION: 'Шаблон услуги',
  ORDER_SERVICE: 'Услуга',
  PAYMENT: 'Оплата',
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
  DEACTIVATE: 'Деактивация',
  STATUS_CHANGE: 'Смена статуса',
  PRICE_CHANGE: 'Изменение цены',
  ADD_SERVICE: 'Привязка услуги',
  REMOVE_SERVICE: 'Отвязка услуги',
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#28a745',
  UPDATE: '#007bff',
  DELETE: '#dc3545',
  DEACTIVATE: '#6c757d',
  STATUS_CHANGE: '#fd7e14',
  PRICE_CHANGE: '#6f42c1',
  ADD_SERVICE: '#20c997',
  REMOVE_SERVICE: '#e83e8c',
}

const ALL_ENTITY_TYPES = ['ORDER', 'CLIENT', 'EMPLOYEE', 'ITEM_TYPE', 'SERVICE_DEFINITION', 'ORDER_SERVICE', 'PAYMENT']
const ALL_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE', 'STATUS_CHANGE', 'PRICE_CHANGE', 'ADD_SERVICE', 'REMOVE_SERVICE']

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [entityTypeFilter, setEntityTypeFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityIdFilter, setEntityIdFilter] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 50

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (entityTypeFilter) params.append('entityType', entityTypeFilter)
      if (actionFilter) params.append('action', actionFilter)
      if (entityIdFilter) params.append('entityId', entityIdFilter)
      params.append('page', page.toString())
      params.append('size', PAGE_SIZE.toString())
      const res = await client.get<AuditLogEntry[]>(`/api/audit-log?${params}`)
      setEntries(res.data)
      setHasMore(res.data.length === PAGE_SIZE)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [entityTypeFilter, actionFilter, entityIdFilter, page])

  return (
    <div>
      <div className="page-header">
        <h1>Лог изменений</h1>
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Тип объекта</label>
          <select value={entityTypeFilter} onChange={e => { setEntityTypeFilter(e.target.value); setPage(0) }}>
            <option value="">Все</option>
            {ALL_ENTITY_TYPES.map(t => (
              <option key={t} value={t}>{ENTITY_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Действие</label>
          <select value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0) }}>
            <option value="">Все</option>
            {ALL_ACTIONS.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>ID объекта</label>
          <input
            type="number"
            value={entityIdFilter}
            onChange={e => { setEntityIdFilter(e.target.value); setPage(0) }}
            placeholder="ID объекта"
            style={{ minWidth: 120 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Объект</th>
                <th>ID</th>
                <th>Действие</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5} className="empty">Нет записей</td></tr>
              ) : entries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.occurred_at).toLocaleString('ru')}</td>
                  <td>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</td>
                  <td>{e.entity_id ?? '—'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: '0.8em',
                      fontWeight: 600,
                      color: '#fff',
                      backgroundColor: ACTION_COLORS[e.action] ?? '#6c757d',
                    }}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td>{e.description}</td>
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
