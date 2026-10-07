import { useEffect, useState } from 'react'
import client from '../api/client'
import StyledSelect from '../components/StyledSelect'
import type { AuditLogEntry } from '../types'

/**
 * Лог действий: кто, что и когда сделал.
 *
 * Типы объектов и действий — всё, что пишет бэкенд (AuditLogService.log / logAs).
 * Раньше список был захардкожен на момент первой версии: закупки, логистика и
 * справочники показывались кодами вида SUPPLY_REQUEST, а в фильтрах их не было.
 */
const ENTITY_LABELS: Record<string, string> = {
  ORDER: 'Заказ',
  ORDER_SERVICE: 'Услуга в заказе',
  PAYMENT: 'Оплата',
  CLIENT: 'Клиент',
  SUPPLY_REQUEST: 'Закупка',
  EXPENSE: 'Расходы',
  EMPLOYEE: 'Сотрудник',
  EMPLOYEE_ROLE: 'Роль',
  USER: 'Пользователь',
  ITEM_TYPE: 'Тип позиции',
  SKU: 'Каталог услуг',
  SKU_GROUP: 'Группа услуг',
  SKU_ATTRIBUTE: 'Атрибут услуг',
  PRICE_MODIFIER: 'Скидка/надбавка',
  DISTRICT: 'Район',
  DELIVERY_SLOT: 'Слот доставки',
  CANCEL_REASON: 'Причина отмены',
  BANNER: 'Баннер',
  SETTINGS: 'Реквизиты',
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
  STATUS_CHANGE: 'Смена статуса',
  STATUS_ROLLBACK: 'Откат статуса',
  LOGISTICS: 'Логистика',
  ITEM: 'Позиция',
  MODIFIER: 'Скидка/надбавка',
  PHOTO: 'Фото',
  ASSIGN: 'Исполнители',
  PRICE_CHANGE: 'Цена',
  PROBLEM_FLAG: 'Проблема',
  LIFECYCLE_TRIGGER: 'Авто-статус',
  RENAME_PROPAGATE: 'Переименование',
  ACTIVATE: 'Активация',
  DEACTIVATE: 'Деактивация',
  PASSWORD_CHANGE: 'Смена пароля',
  PIN_SET: 'PIN',
  REFUND: 'Возврат/компенсация',
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#27ae60',
  UPDATE: '#3498db',
  DELETE: '#c0392b',
  STATUS_CHANGE: '#e67e22',
  STATUS_ROLLBACK: '#d35400',
  LOGISTICS: '#16a085',
  ITEM: '#2980b9',
  MODIFIER: '#8e44ad',
  PHOTO: '#1abc9c',
  ASSIGN: '#20c997',
  PRICE_CHANGE: '#6f42c1',
  PROBLEM_FLAG: '#c0392b',
  LIFECYCLE_TRIGGER: '#34495e',
  RENAME_PROPAGATE: '#2980b9',
  ACTIVATE: '#27ae60',
  DEACTIVATE: '#d35400',
  PASSWORD_CHANGE: '#8e44ad',
  PIN_SET: '#8e44ad',
  REFUND: '#c0392b',
}

const entityOptions = [{ value: '', label: 'Все объекты' },
  ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))]
const actionOptions = [{ value: '', label: 'Все действия' },
  ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))]

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
      <div className="page-sticky-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46 }}>
          <h1 style={{ margin: 0 }}>Лог действий</h1>
        </div>
        <div className="page-head-extra" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StyledSelect<string>
            value={entityTypeFilter}
            options={entityOptions}
            onChange={v => { setEntityTypeFilter(v); setPage(0) }}
            width={200}
            ariaLabel="Тип объекта"
          />
          <StyledSelect<string>
            value={actionFilter}
            options={actionOptions}
            onChange={v => { setActionFilter(v); setPage(0) }}
            width={180}
            ariaLabel="Действие"
          />
          <input
            type="number"
            value={entityIdFilter}
            onChange={e => { setEntityIdFilter(e.target.value); setPage(0) }}
            placeholder="№ объекта"
            title="Номер заказа, клиента, заявки… — в зависимости от типа объекта"
            style={{ width: 120, height: 'var(--control-h)' }}
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
                <th>Кто</th>
                <th>Объект</th>
                <th>№</th>
                <th>Действие</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={6} className="empty">Нет записей</td></tr>
              ) : entries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.occurred_at).toLocaleString('ru')}</td>
                  {/* Подпись появилась в V41 — у старых записей её нет. */}
                  <td style={{ whiteSpace: 'nowrap' }}>{e.actor ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{ENTITY_LABELS[e.entity_type] ?? e.entity_type}</td>
                  <td>{e.entity_id ?? '—'}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 'var(--font-sm)',
                      fontWeight: 600,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      backgroundColor: ACTION_COLORS[e.action] ?? '#34495e',
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
