import { useEffect, useState } from 'react'
import { getUsers, createUser, updateUser, changeUserPassword, type AppUserPublic } from '../api/users'
import { getEmployees } from '../api/references'
import { useToast } from '../components/Toast'
import type { Employee } from '../types'

const ROLES = [
  { value: 'SUPERVISOR', label: 'Супервизор' },
  { value: 'ADMIN',      label: 'Администратор' },
  { value: 'OPERATOR',   label: 'Оператор' },
  { value: 'READONLY',   label: 'Только просмотр' },
]

const roleLabel = (r: string) => ROLES.find(x => x.value === r)?.label ?? r

export default function UsersPage() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<AppUserPublic[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  // Form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('OPERATOR')
  const [employeeId, setEmployeeId] = useState<number | ''>('')
  const [isActive, setIsActive] = useState(true)
  const [err, setErr] = useState('')

  // Password change
  const [pwUserId, setPwUserId] = useState<number | null>(null)
  const [newPw, setNewPw] = useState('')

  const load = async () => {
    const [u, e] = await Promise.all([getUsers(), getEmployees()])
    setUsers(u)
    setEmployees(e)
  }
  useEffect(() => { void load() }, [])

  const resetForm = () => {
    setUsername(''); setPassword(''); setDisplayName(''); setRole('OPERATOR'); setEmployeeId(''); setIsActive(true); setErr('')
  }

  const startCreate = () => { resetForm(); setCreating(true); setEditId(null) }
  const startEdit = (u: AppUserPublic) => {
    setCreating(false); setEditId(u.id)
    setUsername(u.username); setDisplayName(u.display_name); setRole(u.role)
    setEmployeeId(u.employee_id || ''); setIsActive(u.is_active); setErr('')
  }

  const save = async () => {
    if (!displayName.trim()) { setErr('Укажите имя'); return }
    try {
      if (creating) {
        if (!username.trim()) { setErr('Укажите логин'); return }
        if (!password.trim()) { setErr('Укажите пароль'); return }
        await createUser({
          username: username.trim(), password, display_name: displayName.trim(),
          role, employee_id: employeeId || null,
        })
        setCreating(false)
      } else if (editId) {
        await updateUser(editId, {
          display_name: displayName.trim(), role,
          employee_id: employeeId || null, is_active: isActive,
        })
        setEditId(null)
      }
      resetForm(); await load()
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.message || 'Ошибка сохранения')
    }
  }

  const savePw = async () => {
    if (!pwUserId || !newPw.trim()) return
    try {
      await changeUserPassword(pwUserId, newPw)
      setPwUserId(null); setNewPw('')
      showToast('Пароль изменён', 'success')
    } catch { showToast('Ошибка смены пароля', 'error') }
  }

  const employeeName = (eid: number) => employees.find(e => e.id === eid)?.name ?? `#${eid}`

  return (
    <div>
      <h1>Пользователи</h1>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 12 }}>
        Управление учётными записями для входа в систему. Каждый пользователь привязан к роли
        (Супервизор / Администратор / Оператор / Только просмотр) и опционально к сотруднику
        (для авто-назначения на оформление).
      </div>

      <button className="btn-primary" onClick={startCreate} style={{ marginBottom: 12 }}>+ Новый пользователь</button>

      {(creating || editId) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{creating ? 'Новый пользователь' : 'Редактирование'}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {creating && (
              <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>Логин</label>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="login" />
              </div>
            )}
            {creating && (
              <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>Пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="пароль" />
              </div>
            )}
            <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Отображаемое имя</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Анна Иванова" />
            </div>
            <div className="form-group" style={{ flex: '0 0 200px', marginBottom: 0 }}>
              <label>Роль</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 250px', marginBottom: 0 }}>
              <label>Привязка к сотруднику</label>
              <select value={employeeId} onChange={e => setEmployeeId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— нет —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            {editId && (
              <div className="form-group" style={{ flex: '0 0 auto', marginBottom: 0 }}>
                <label>&nbsp;</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Активен
                </label>
              </div>
            )}
          </div>
          {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
          <div className="actions">
            <button className="btn-primary" onClick={save}>Сохранить</button>
            <button className="btn-secondary" onClick={() => { setCreating(false); setEditId(null); resetForm() }}>Отмена</button>
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr><th>#</th><th>Логин</th><th>Имя</th><th>Роль</th><th>Сотрудник</th><th>Активен</th><th>Действия</th></tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr><td colSpan={7} className="empty">Нет пользователей</td></tr>
          ) : users.map(u => (
            <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
              <td>{u.id}</td>
              <td><code>{u.username}</code></td>
              <td>{u.display_name}</td>
              <td>{roleLabel(u.role)}</td>
              <td>{u.employee_id ? employeeName(u.employee_id) : '—'}</td>
              <td>{u.is_active ? '✓' : '—'}</td>
              <td>
                <div className="actions">
                  <button className="btn-secondary btn-sm" onClick={() => startEdit(u)}>✏️</button>
                  <button className="btn-secondary btn-sm" onClick={() => { setPwUserId(u.id); setNewPw('') }}>🔑</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pwUserId && (
        <div className="modal-overlay" onClick={() => setPwUserId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Сменить пароль</h3>
            <div className="form-group">
              <label>Новый пароль для {users.find(u => u.id === pwUserId)?.username}</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="новый пароль" />
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setPwUserId(null)}>Отмена</button>
              <button className="btn-primary" onClick={savePw}>Сменить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
