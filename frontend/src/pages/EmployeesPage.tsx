import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, activateEmployee, getEmployeesAll } from '../api/references'
import { getEmployeeServices } from '../api/employees'
import { getEmployeeEarnings } from '../api/orders'
import type { Employee, OrderItemService, ServiceStatus } from '../types'

const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  CREATED: 'Создана',
  IN_PROGRESS: 'В работе',
  DONE: 'Готова',
  CANCELLED: 'Отменена'
}

function EmployeeServicesModal({
  employee,
  onClose
}: {
  employee: Employee
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [services, setServices] = useState<OrderItemService[]>([])
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | ''>('')
  const [earnings, setEarnings] = useState<number>(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [servicesData, earningsData] = await Promise.all([
        getEmployeeServices(employee.id, statusFilter || undefined),
        getEmployeeEarnings(employee.id, statusFilter || undefined, dateFrom || undefined, dateTo || undefined)
      ])
      setServices(servicesData)
      setEarnings(earningsData)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [employee.id, statusFilter, dateFrom, dateTo])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>Услуги сотрудника: {employee.name}</h2>

        <div className="filters" style={{ marginBottom: '16px' }}>
          <div className="form-group">
            <label>Статус</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ServiceStatus | '')}
            >
              <option value="">Все статусы</option>
              <option value="CREATED">Создана</option>
              <option value="IN_PROGRESS">В работе</option>
              <option value="DONE">Готова</option>
              <option value="CANCELLED">Отменена</option>
            </select>
          </div>
          <div className="form-group">
            <label>Дата с</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Дата по</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <strong>Общий заработок: {earnings.toFixed(2)} &#8381;</strong>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : services.length === 0 ? (
          <div className="empty">У сотрудника пока нет назначенных услуг</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID услуги</th>
                <th>ID позиции</th>
                <th>Название услуги</th>
                <th>Статус</th>
                <th>Стоимость</th>
                <th>Создана</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {services.map(service => (
                <tr key={service.id}>
                  <td>{service.id}</td>
                  <td>{service.order_item_id}</td>
                  <td>{service.service_def_name || `Услуга #${service.service_def_id}`}</td>
                  <td>
                    <span className={`badge badge-${service.status.toLowerCase()}`}>
                      {SERVICE_STATUS_LABELS[service.status]}
                    </span>
                  </td>
                  <td>{service.price.toFixed(2)} &#8381;</td>
                  <td>{new Date(service.created_at).toLocaleDateString('ru')}</td>
                  <td>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={async () => {
                        onClose()
                        try {
                          const response = await fetch(`http://localhost:8080/api/order-items/${service.order_item_id}`)
                          if (response.ok) {
                            const orderItem = await response.json()
                            navigate(`/orders/${orderItem.order_id}`)
                          }
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editContact, setEditContact] = useState('')
  const [error, setError] = useState('')
  const [showServices, setShowServices] = useState<Employee | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [nameFilter, setNameFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = showInactive ? await getEmployeesAll(true) : await getEmployees()
      setEmployees(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [showInactive])

  const create = async () => {
    if (!newName.trim()) { setError('Введите имя сотрудника'); return }
    try {
      await createEmployee({ name: newName.trim(), contact: newContact.trim() || undefined })
      setNewName('')
      setNewContact('')
      setError('')
      await load()
    } catch { setError('Ошибка создания') }
  }

  const save = async (id: number) => {
    if (!editName.trim()) return
    try {
      await updateEmployee(id, { name: editName.trim(), contact: editContact.trim() || undefined })
      setEditId(null)
      await load()
    } catch { /* ignore */ }
  }

  const deactivate = async (id: number) => {
    if (!confirm('Деактивировать сотрудника?')) return
    try {
      await deactivateEmployee(id)
      await load()
    } catch { /* ignore */ }
  }

  const activate = async (id: number) => {
    try {
      await activateEmployee(id)
      await load()
    } catch { /* ignore */ }
  }

  const filteredEmployees = employees.filter(e =>
    e.name.toLowerCase().includes(nameFilter.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <h1>Сотрудники</h1>
      </div>

      <div className="card">
        <h2>Добавить сотрудника</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label>Имя *</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Имя сотрудника" />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label>Контакт</label>
            <input value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="Телефон / email" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn-primary" onClick={create}>+ Добавить</button>
          </div>
        </div>
        {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Поиск по имени</label>
          <input
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Фильтр по имени..."
          />
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Показать деактивированных
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Имя</th>
              <th>Контакт</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr><td colSpan={5} className="empty">Нет сотрудников</td></tr>
            ) : filteredEmployees.map(emp => (
              <tr key={emp.id}>
                <td>{emp.id}</td>
                <td>
                  {editId === emp.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)} />
                  ) : emp.name}
                </td>
                <td>
                  {editId === emp.id ? (
                    <input value={editContact} onChange={e => setEditContact(e.target.value)} />
                  ) : (emp.contact || '—')}
                </td>
                <td>
                  <span className={`badge ${emp.active ? 'badge-done' : 'badge-lead'}`}>
                    {emp.active ? 'Активен' : 'Деактивирован'}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    {editId === emp.id ? (
                      <>
                        <button className="btn-success btn-sm" onClick={() => save(emp.id)}>&#10003;</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>&#10005;</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setShowServices(emp)}
                          style={{ marginRight: '8px' }}
                        >
                          Услуги
                        </button>
                        <button className="btn-secondary btn-sm" onClick={() => { setEditId(emp.id); setEditName(emp.name); setEditContact(emp.contact ?? '') }}>&#9998;</button>
                        {emp.active ? (
                          <button className="btn-danger btn-sm" onClick={() => deactivate(emp.id)}>Деактивировать</button>
                        ) : (
                          <button className="btn-success btn-sm" onClick={() => activate(emp.id)}>Активировать</button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showServices && (
        <EmployeeServicesModal
          employee={showServices}
          onClose={() => setShowServices(null)}
        />
      )}
    </div>
  )
}
