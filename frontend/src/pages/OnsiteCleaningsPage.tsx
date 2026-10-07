import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { onsiteApi, ONSITE_STATUS_LABELS } from '../api/onsite'
import type { OnsiteCleaning, OnsiteStatus, OnsiteWorker } from '../api/onsite'
import { contractsApi } from '../api/contracts'
import type { Contract } from '../api/contracts'
import { getEmployees } from '../api/references'
import { searchClients } from '../api/clients'
import type { Employee, Client } from '../types'
import { todayIso } from '../utils/format'

/**
 * Выездные чистки (ТЗ v2, блок 5).
 *
 * Бригада работает у клиента: приёма и доставки нет, есть адрес, объём в м²,
 * цена и исполнители. Завершённый выезд идёт в базу себестоимости и в сдельную
 * оплату наравне с коврами из цеха, а по контракту — ещё и в план-факт.
 */
export default function OnsiteCleaningsPage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<OnsiteCleaning[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [status, setStatus] = useState<'' | OnsiteStatus>('')
  const [from, setFrom] = useState(firstDayOfMonth())
  const [to, setTo] = useState('')
  const [editing, setEditing] = useState<(Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }) | null>(null)

  const load = async () => {
    setItems(await onsiteApi.list({ from: from || undefined, to: to || undefined, status: status || undefined }))
  }
  useEffect(() => { void load() }, [from, to, status])
  useEffect(() => {
    void getEmployees().then(setEmployees).catch(() => setEmployees([]))
    void contractsApi.list({ activeOnly: true }).then(setContracts).catch(() => setContracts([]))
  }, [])

  const totals = useMemo(() => {
    const done = items.filter(i => i.status === 'DONE')
    return {
      count: items.length,
      doneCount: done.length,
      sqm: done.reduce((s, i) => s + Number(i.area || 0), 0),
      money: done.reduce((s, i) => s + Number(i.price || 0), 0),
    }
  }, [items])

  const openNew = () => setEditing({
    cleaning_date: todayIso(), price: 0, status: 'PLANNED', workers: [],
  })

  const openEdit = async (row: OnsiteCleaning) => {
    const full = await onsiteApi.get(row.id)
    setEditing({ ...full, workers: Array.isArray(full.workers) ? full.workers : [] })
  }

  const save = async () => {
    if (!editing) return
    const body = {
      client_id: editing.client_id ?? null,
      client_name: editing.client_name,
      address: editing.address || null,
      district: editing.district || null,
      cleaning_date: editing.cleaning_date,
      area: editing.area ?? null,
      price: editing.price ?? 0,
      comment: editing.comment || null,
      contract_id: editing.contract_id ?? null,
      workers: (editing.workers || []).filter(w => w.employee_id),
    }
    try {
      if (editing.id) await onsiteApi.update(editing.id, body)
      else await onsiteApi.create(body)
      setEditing(null)
      await load()
      showToast('Выезд сохранён', 'success')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось сохранить выезд', 'error')
    }
  }

  const setRowStatus = async (row: OnsiteCleaning, next: OnsiteStatus) => {
    try {
      await onsiteApi.setStatus(row.id, next)
      await load()
      showToast(`Выезд #${row.id}: ${ONSITE_STATUS_LABELS[next].toLowerCase()}`, 'success')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось изменить статус', 'error')
    }
  }

  const remove = async (row: OnsiteCleaning) => {
    if (!confirm(`Удалить выезд #${row.id} к «${row.client_name}»?`)) return
    await onsiteApi.remove(row.id)
    await load()
  }

  return (
    <div>
      <h1>Выездные чистки</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label>С <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>По <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label>Статус
          <select value={status} onChange={e => setStatus(e.target.value as '' | OnsiteStatus)}>
            <option value="">Все</option>
            {Object.entries(ONSITE_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary" onClick={openNew}>+ Выезд</button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Metric label="Выездов в периоде" value={totals.count} />
        <Metric label="Выполнено" value={totals.doneCount} />
        {/* В себестоимость и ФОТ идут метры только выполненных выездов. */}
        <Metric label="Метров выполнено" value={totals.sqm} suffix=" м²" />
        <Metric label="Сумма выполненных" value={totals.money} suffix=" ₽" />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Дата</th><th>Клиент</th><th>Адрес</th><th>м²</th><th>Сумма</th>
              <th>Исполнители</th><th>Контракт</th><th>Статус</th><th style={{ width: 240 }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {items.map(row => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.cleaning_date}</td>
                <td>{row.client_name}</td>
                <td>{row.address || '—'}{row.district ? ` (${row.district})` : ''}</td>
                <td>{row.area != null ? Number(row.area).toLocaleString('ru') : '—'}</td>
                <td>{Number(row.price || 0).toLocaleString('ru')} ₽</td>
                <td>{typeof row.workers === 'string' ? row.workers : '—'}</td>
                <td>{row.contract_number ? `№ ${row.contract_number}` : '—'}</td>
                <td><StatusBadge status={row.status} /></td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn-secondary" onClick={() => openEdit(row)}>Изменить</button>
                  {row.status !== 'DONE' && (
                    <button className="btn-success" onClick={() => setRowStatus(row, 'DONE')}>Выполнен</button>
                  )}
                  {row.status === 'DONE' && (
                    <button className="btn-secondary" onClick={() => setRowStatus(row, 'PLANNED')}>Вернуть в план</button>
                  )}
                  {row.status !== 'CANCELLED' && (
                    <button className="btn-secondary" onClick={() => setRowStatus(row, 'CANCELLED')}>Отменить</button>
                  )}
                  <button className="btn-danger" onClick={() => remove(row)}>Удалить</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={10} style={{ color: '#7f8c8d' }}>Выездов за период нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <OnsiteModal
          value={editing}
          employees={employees}
          contracts={contracts}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: OnsiteStatus }) {
  const cls = status === 'DONE' ? 'badge-done' : status === 'CANCELLED' ? 'badge-cancelled' : 'badge-created'
  return <span className={`badge ${cls}`}>{ONSITE_STATUS_LABELS[status]}</span>
}

function Metric({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value.toLocaleString('ru')}{suffix || ''}</div>
    </div>
  )
}

function OnsiteModal({ value, employees, contracts, onChange, onClose, onSave }: {
  value: Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }
  employees: Employee[]
  contracts: Contract[]
  onChange: (v: Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }) => void
  onClose: () => void
  onSave: () => void
}) {
  const [found, setFound] = useState<Client[]>([])
  const set = (patch: Partial<OnsiteCleaning> & { workers?: OnsiteWorker[] }) => onChange({ ...value, ...patch })
  const workers = value.workers || []

  const pickClient = async (query: string) => {
    set({ client_name: query, client_id: null })
    if (query.trim().length < 2) { setFound([]); return }
    try { setFound(await searchClients(query.trim())) } catch { setFound([]) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <h2>{value.id ? `Выезд #${value.id}` : 'Новый выезд'}</h2>

        <label>Клиент
          <input value={value.client_name ?? ''} onChange={e => pickClient(e.target.value)} />
        </label>
        {found.length > 0 && (
          <div style={{ border: '1px solid #ecf0f1', borderRadius: 6, marginBottom: 8, maxHeight: 140, overflow: 'auto' }}>
            {found.map(c => (
              <div
                key={c.id}
                style={{ padding: '4px 8px', cursor: 'pointer' }}
                onClick={() => {
                  set({ client_id: c.id, client_name: c.name, address: c.address || value.address || '', district: c.district || null })
                  setFound([])
                }}
              >{c.name}{c.phone ? ` · ${c.phone}` : ''}</div>
            ))}
          </div>
        )}

        <label>Адрес работ
          <input value={value.address ?? ''} onChange={e => set({ address: e.target.value })} />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>Дата выезда
            <input type="date" value={value.cleaning_date ?? ''} onChange={e => set({ cleaning_date: e.target.value })} />
          </label>
          <label style={{ flex: 1 }}>Район
            <input value={value.district ?? ''} onChange={e => set({ district: e.target.value })} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>Объём, м²
            <input
              type="number" min="0" step="0.01"
              value={value.area ?? ''}
              onChange={e => set({ area: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <label style={{ flex: 1 }}>Стоимость, ₽
            <input
              type="number" min="0" step="0.01"
              value={value.price ?? ''}
              onChange={e => set({ price: e.target.value ? Number(e.target.value) : 0 })}
            />
          </label>
        </div>
        {/* Объём обязателен для завершения: по нему считается и себестоимость, и сделка. */}
        <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginBottom: 8 }}>
          Без объёма выезд нельзя завершить — по метрам считается сдельная оплата.
        </div>

        <label>Контракт
          <select
            value={value.contract_id ?? ''}
            onChange={e => set({ contract_id: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Без контракта</option>
            {contracts.map(c => (
              <option key={c.id} value={c.id}>№ {c.number} — {c.client_name}</option>
            ))}
          </select>
        </label>

        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Исполнители</strong>
            <button
              className="btn-secondary"
              onClick={() => set({ workers: [...workers, { employee_id: 0 }] })}
            >+ Исполнитель</button>
          </div>
          {/* Доли не задаём руками: по умолчанию сумма делится поровну — то же
              правило, что у ковров в цеху. */}
          {workers.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <select
                value={w.employee_id || ''}
                onChange={e => {
                  const next = [...workers]
                  next[i] = { ...w, employee_id: Number(e.target.value) }
                  set({ workers: next })
                }}
                style={{ flex: 1 }}
              >
                <option value="">— сотрудник —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              <input
                type="number" min="0" max="100" step="0.01" placeholder="доля, %"
                value={w.percent ?? ''}
                onChange={e => {
                  const next = [...workers]
                  next[i] = { ...w, percent: e.target.value ? Number(e.target.value) : undefined }
                  set({ workers: next })
                }}
                style={{ width: 110 }}
              />
              <button
                className="btn-danger"
                onClick={() => set({ workers: workers.filter((_, j) => j !== i) })}
              >×</button>
            </div>
          ))}
          {workers.length > 1 && workers.every(w => w.percent == null) && (
            <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginTop: 4 }}>
              Доли не заданы — сумма разделится поровну.
            </div>
          )}
        </div>

        <label>Комментарий
          <textarea rows={2} value={value.comment ?? ''} onChange={e => set({ comment: e.target.value })} />
        </label>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={onSave}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}

function firstDayOfMonth(): string {
  const today = todayIso()
  return `${today.slice(0, 8)}01`
}
