import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getEmployees, createEmployee, updateEmployee, deactivateEmployee, activateEmployee, getEmployeesAll,
  getEmployeeRoles, createEmployeeRole, updateEmployeeRole, deleteEmployeeRole,
  getItemTypes,
} from '../api/references'
import { getEmployeeServices } from '../api/employees'
import { getEmployeeEarnings } from '../api/orders'
import apiClient from '../api/client'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import MultiSelectFilter from '../components/MultiSelectFilter'
import PhoneInput, { isValidPhone, formatPhone } from '../components/PhoneInput'
import { SERVICE_STATUS_LABELS } from '../constants/statuses'
import type { Employee, EmployeeRole, ItemType, OrderItemService, ServiceStatus } from '../types'

function EmployeeServicesModal({
  employee,
  onClose
}: {
  employee: Employee
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { showToast } = useToast()
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
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка загрузки услуг'
      showToast(msg, 'error')
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
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Дата по</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <strong>Принёс прибыли: {earnings.toFixed(2)} &#8381;</strong>
          <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#7f8c8d' }}>
            (доля от выручки выполненных услуг с делением на число исполнителей)
          </span>
        </div>

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : services.length === 0 ? (
          <div className="empty">У сотрудника пока нет назначенных услуг</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID услуги</th><th>ID позиции</th><th>Название услуги</th>
                <th>Статус</th><th>Стоимость</th><th>Создана</th><th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {services.map(service => (
                <tr key={service.id}>
                  <td>{service.id}</td>
                  <td>{service.order_item_id}</td>
                  <td>{service.sku_name || `SKU #${service.sku_id}`}</td>
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
                          const response = await apiClient.get(`/api/order-items/${service.order_item_id}`)
                          navigate(`/orders/${response.data.order_id}`)
                        } catch (e: unknown) {
                          const msg = (e as any)?.response?.data?.message || 'Ошибка перехода к заказу'
                          showToast(msg, 'error')
                        }
                      }}
                    >Подробнее</button>
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

/**
 * Модалка создания/редактирования роли — отдельная, чтобы не утяжелять боковую панель.
 * Открывается из «развёрнутого» режима sidebar'а.
 */
function RoleEditorModal({
  role, allItemTypes, onClose, onSaved,
}: {
  role: EmployeeRole | null  // null = создание новой
  allItemTypes: ItemType[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [name, setName] = useState(role?.name || '')
  const [description, setDescription] = useState(role?.description || '')
  const [itemTypeIds, setItemTypeIds] = useState<number[]>(role?.item_type_ids || [])
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!name.trim()) { showToast('Название роли обязательно', 'error'); return }
    setSaving(true)
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined, item_type_ids: itemTypeIds }
      if (role) await updateEmployeeRole(role.id, payload)
      else await createEmployeeRole(payload)
      onSaved()
    } catch (e: unknown) {
      showToast((e as any)?.response?.data?.message || 'Ошибка сохранения роли', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{role ? 'Редактировать роль' : 'Новая роль'}</h2>
        <div className="form-group">
          <label>Название *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Например, «Чистильщик ковров»" />
        </div>
        <div className="form-group">
          <label>Описание</label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Кратко: с чем работает, в чём специализация" />
        </div>
        <div className="form-group">
          <label>Типы позиций, с которыми работает</label>
          <MultiSelectFilter
            options={allItemTypes.map(t => ({ value: String(t.id), label: t.name }))}
            searchable
            value={itemTypeIds.map(String)}
            onChange={vals => setItemTypeIds(vals.map(Number))}
            placeholder="Не выбрано — роль ничего не разрешает"
            width="100%"
          />
          <div style={{ fontSize: '0.8em', color: '#7f8c8d', marginTop: 4 }}>
            Сотрудник с этой ролью сможет выполнять услуги только для выбранных типов позиций.
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EmployeesPage() {
  const { showToast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [roles, setRoles] = useState<EmployeeRole[]>([])
  const [itemTypes, setItemTypes] = useState<ItemType[]>([])
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState('')
  // V15: телефон и email — два отдельных поля.
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRoleId, setNewRoleId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRoleId, setEditRoleId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [showServices, setShowServices] = useState<Employee | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [nameFilter, setNameFilter] = useState('')
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, action: () => void, danger?: boolean} | null>(null)

  // Боковая панель «Роли» — фильтр по роли (по клику) и раскрытие для редактирования.
  // Аналогично карточке районов в Логистике: компактная по умолчанию, развёрнутая по запросу.
  // 'all' = без фильтра, 'none' = только без роли, number = конкретная роль.
  const [roleFilter, setRoleFilter] = useState<'all' | 'none' | number>('all')
  const [asideExpanded, setAsideExpanded] = useState(false)
  const [editingRole, setEditingRole] = useState<EmployeeRole | null | undefined>(undefined) // null = новая, EmployeeRole = существующая, undefined = модалка закрыта

  const load = async () => {
    setLoading(true)
    try {
      const [emps, rs, its] = await Promise.all([
        showInactive ? getEmployeesAll(true) : getEmployees(),
        getEmployeeRoles().catch(() => [] as EmployeeRole[]),
        getItemTypes().catch(() => [] as ItemType[]),
      ])
      setEmployees(emps)
      setRoles(rs)
      setItemTypes(its)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [showInactive])

  const create = async () => {
    if (!newName.trim()) { setError('Введите имя сотрудника'); return }
    if (newPhone.trim() && !isValidPhone(newPhone)) {
      setError('Телефон должен быть в формате +7 (XXX) XXX-XX-XX'); return
    }
    if (newEmail.trim() && !newEmail.includes('@')) {
      setError('Некорректный email'); return
    }
    try {
      await createEmployee({
        name: newName.trim(),
        phone: newPhone.trim() ? formatPhone(newPhone) : undefined,
        email: newEmail.trim() || undefined,
        role_id: newRoleId,
      })
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewRoleId(null); setError('')
      await load()
    } catch { setError('Ошибка создания') }
  }

  const save = async (id: number) => {
    if (!editName.trim()) return
    if (editPhone.trim() && !isValidPhone(editPhone)) {
      showToast('Телефон должен быть в формате +7 (XXX) XXX-XX-XX', 'error'); return
    }
    if (editEmail.trim() && !editEmail.includes('@')) {
      showToast('Некорректный email', 'error'); return
    }
    try {
      await updateEmployee(id, {
        name: editName.trim(),
        phone: editPhone.trim() ? formatPhone(editPhone) : undefined,
        email: editEmail.trim() || undefined,
        role_id: editRoleId,
      })
      setEditId(null)
      await load()
    } catch (e: unknown) {
      showToast((e as any)?.response?.data?.message || 'Ошибка сохранения', 'error')
    }
  }

  const deactivate = (id: number) => {
    setConfirmAction({
      title: 'Деактивировать сотрудника',
      message: 'Вы уверены, что хотите деактивировать сотрудника?',
      danger: true,
      action: async () => {
        try { await deactivateEmployee(id); await load() }
        catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка деактивации', 'error') }
      }
    })
  }

  const activate = async (id: number) => {
    try { await activateEmployee(id); await load() }
    catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка активации', 'error') }
  }

  const deleteRole = (role: EmployeeRole) => {
    const usage = employees.filter(e => e.role_id === role.id).length
    if (usage > 0) {
      // Бэкенд тоже блокирует, но показать сообщение лучше сразу — оператор поймёт
      // что нужно сначала перевести сотрудников.
      showToast(
        `Роль «${role.name}» назначена ${usage} сотрудникам. Сначала переведите их в другую роль или снимите роль.`,
        'error'
      )
      return
    }
    setConfirmAction({
      title: 'Удалить роль',
      message: `Удалить роль «${role.name}»?`,
      danger: true,
      action: async () => {
        try { await deleteEmployeeRole(role.id); await load() }
        catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления роли', 'error') }
      }
    })
  }

  const filteredEmployees = employees.filter(e => {
    if (roleFilter === 'none' && e.role_id != null) return false
    if (typeof roleFilter === 'number' && e.role_id !== roleFilter) return false
    return e.name.toLowerCase().includes(nameFilter.toLowerCase())
  })

  // Считаем сколько сотрудников у каждой роли — для бейджа в боковой панели.
  const employeeCountByRole = new Map<number, number>()
  employees.forEach(e => {
    if (e.role_id != null) employeeCountByRole.set(e.role_id, (employeeCountByRole.get(e.role_id) || 0) + 1)
  })
  const noRoleCount = employees.filter(e => e.role_id == null).length

  const itemTypeName = (id: number) => itemTypes.find(t => t.id === id)?.name || `#${id}`

  return (
    <div>
      <div className="page-header">
        <h1>Сотрудники</h1>
      </div>

      {/* Двухколоночный layout: слева данные, справа боковая панель ролей.
          На узких экранах (<1100px) панель уезжает вниз — см. media-query в index.css. */}
      <div className="logistics-layout">
        <div className="logistics-main">
          <div className="card">
            <h2>Добавить сотрудника</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                <label>Имя *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Имя сотрудника" />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                <label>Телефон</label>
                <PhoneInput value={newPhone} onChange={setNewPhone} showValidation />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                <label>Email</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                <label>Роль</label>
                <select
                  value={newRoleId ?? ''}
                  onChange={e => setNewRoleId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— без роли (универсал) —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
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
              <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="Фильтр по имени..." />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" style={{ width: 'auto' }}
                       checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                Показать деактивированных
              </label>
            </div>
            {/* Чип «Фильтр по роли» — снимается крестиком. */}
            {roleFilter !== 'all' && (
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 12, fontSize: '0.85em',
                  background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)',
                }}>
                  Роль: {roleFilter === 'none' ? 'без роли' : (roles.find(r => r.id === roleFilter)?.name || '—')}
                  <button onClick={() => setRoleFilter('all')} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--c-primary-dark)', fontWeight: 700, padding: 0, lineHeight: 1,
                  }}>×</button>
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="loading">Загрузка...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Имя</th><th>Телефон</th><th>Email</th><th>Роль</th><th>Статус</th><th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr><td colSpan={7} className="empty">Нет сотрудников</td></tr>
                ) : filteredEmployees.map(emp => {
                  const role = roles.find(r => r.id === emp.role_id)
                  return (
                    <tr key={emp.id}>
                      <td>{emp.id}</td>
                      <td>{editId === emp.id ? <input value={editName} onChange={e => setEditName(e.target.value)} /> : emp.name}</td>
                      <td>
                        {editId === emp.id
                          ? <PhoneInput value={editPhone} onChange={setEditPhone} showValidation />
                          : (emp.phone || <span style={{ color: '#aaa' }}>—</span>)}
                      </td>
                      <td>
                        {editId === emp.id
                          ? <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email@example.com" />
                          : (emp.email || <span style={{ color: '#aaa' }}>—</span>)}
                      </td>
                      <td>
                        {editId === emp.id ? (
                          <select value={editRoleId ?? ''} onChange={e => setEditRoleId(e.target.value ? Number(e.target.value) : null)}>
                            <option value="">— без роли —</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          role ? <span className="badge badge-lead">{role.name}</span> : <span style={{ color: '#aaa' }}>—</span>
                        )}
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
                              <button className="btn-secondary btn-sm" onClick={() => setShowServices(emp)} style={{ marginRight: 8 }}>Услуги</button>
                              <button className="btn-secondary btn-sm" onClick={() => {
                                setEditId(emp.id); setEditName(emp.name);
                                setEditPhone(emp.phone ?? ''); setEditEmail(emp.email ?? '');
                                setEditRoleId(emp.role_id)
                              }}>&#9998;</button>
                              {emp.active
                                ? <button className="btn-danger btn-sm" onClick={() => deactivate(emp.id)}>Деактивировать</button>
                                : <button className="btn-success btn-sm" onClick={() => activate(emp.id)}>Активировать</button>
                              }
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ───── Боковая панель ролей ─────
            Компактная по умолчанию: список ролей с количеством сотрудников.
            Развёрнутая (asideExpanded): карточка с типами позиций под каждой ролью + редактирование. */}
        <aside className={`logistics-aside ${asideExpanded ? 'expanded' : ''}`}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: '1em' }}>Роли</h3>
              <button
                className="btn-secondary btn-sm"
                title={asideExpanded ? 'Свернуть' : 'Развернуть для редактирования'}
                onClick={() => setAsideExpanded(v => !v)}
              >{/* Стрелка указывает направление действия по клику:
                    свёрнут → «развернуть» (расширяемся влево) → «;
                    развёрнут → «свернуть» (сжимаемся вправо) → ». */}
                {asideExpanded ? '»' : '«'}</button>
            </div>

            {/* «Все сотрудники» — сброс фильтра. Подсвечен когда roleFilter === 'all'. */}
            <button
              onClick={() => setRoleFilter('all')}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '6px 10px', marginBottom: 4,
                background: roleFilter === 'all' ? 'var(--c-primary-light)' : 'transparent',
                color: roleFilter === 'all' ? 'var(--c-primary-dark)' : 'var(--c-text)',
                border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                fontWeight: roleFilter === 'all' ? 600 : 400,
              }}
            >
              <span>Все сотрудники</span>
              <span style={{ fontSize: '0.85em', color: 'var(--c-text-muted)' }}>{employees.length}</span>
            </button>
            {/* «Без роли» — фильтр по сотрудникам без role_id. */}
            <button
              onClick={() => setRoleFilter('none')}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '6px 10px', marginBottom: 6,
                background: roleFilter === 'none' ? 'var(--c-primary-light)' : 'transparent',
                color: roleFilter === 'none' ? 'var(--c-primary-dark)' : 'var(--c-text-muted)',
                border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                fontStyle: 'italic',
                fontWeight: roleFilter === 'none' ? 600 : 400,
              }}
            >
              <span>Без роли</span>
              <span style={{ fontSize: '0.85em' }}>{noRoleCount}</span>
            </button>

            {roles.length === 0 && (
              <div style={{ color: '#aaa', fontSize: '0.85em', padding: '8px 4px', fontStyle: 'italic' }}>
                Ролей пока нет
              </div>
            )}

            {roles.map(r => {
              const isSelected = roleFilter === r.id
              const empCount = employeeCountByRole.get(r.id) || 0
              return (
                <div key={r.id} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => setRoleFilter(isSelected ? 'all' : r.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '6px 10px',
                      background: isSelected ? 'var(--c-primary-light)' : 'transparent',
                      color: isSelected ? 'var(--c-primary-dark)' : 'var(--c-text)',
                      border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <span>{r.name}</span>
                    <span style={{ fontSize: '0.85em', color: 'var(--c-text-muted)' }}>{empCount}</span>
                  </button>
                  {asideExpanded && (
                    <div style={{ padding: '4px 10px 8px', fontSize: '0.85em' }}>
                      <div style={{ color: '#7f8c8d', marginBottom: 4 }}>
                        Типы: {r.item_type_ids.length === 0
                          ? <em>не выбраны</em>
                          : r.item_type_ids.map(itemTypeName).join(', ')}
                      </div>
                      {r.description && <div style={{ color: '#888', fontStyle: 'italic', marginBottom: 4 }}>{r.description}</div>}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-secondary btn-sm" onClick={() => setEditingRole(r)}>Изменить</button>
                        <button className="btn-danger btn-sm" onClick={() => deleteRole(r)}>Удалить</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {asideExpanded && (
              <button
                className="btn-primary btn-sm"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setEditingRole(null)}
              >+ Создать роль</button>
            )}
          </div>
        </aside>
      </div>

      {showServices && <EmployeeServicesModal employee={showServices} onClose={() => setShowServices(null)} />}

      {editingRole !== undefined && (
        <RoleEditorModal
          role={editingRole}
          allItemTypes={itemTypes}
          onClose={() => setEditingRole(undefined)}
          onSaved={() => { setEditingRole(undefined); void load() }}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          danger={confirmAction.danger}
          onConfirm={() => { setConfirmAction(null); confirmAction.action() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
