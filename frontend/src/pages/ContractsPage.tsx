import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { contractsApi, CONTRACT_KIND_LABELS } from '../api/contracts'
import type { Contract, ContractKind, PlanFact } from '../api/contracts'
import { getClients } from '../api/clients'
import type { Client } from '../types'
import { todayIso } from '../utils/format'

/**
 * Контракты юрлиц (ТЗ v2, блок 6).
 *
 * Реестр слева, карточка с планом-фактом справа. Факт считается по сдаче:
 * пока ковёр не отдан заказчику, его метры в объём договора не идут — иначе
 * контракт «выполнялся» бы складом, а не сдачей.
 */
export default function ContractsPage() {
  const { showToast } = useToast()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [onlyActive, setOnlyActive] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Contract> | null>(null)

  const load = async () => {
    const list = await contractsApi.list()
    setContracts(list)
    if (selectedId == null && list.length) setSelectedId(list[0].id)
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { void getClients().then(setClients).catch(() => setClients([])) }, [])
  useEffect(() => {
    if (selectedId == null) { setSelected(null); return }
    void contractsApi.get(selectedId).then(setSelected).catch(() => setSelected(null))
  }, [selectedId])

  const legalEntities = useMemo(
    () => clients.filter(c => c.client_type === 'LEGAL_ENTITY'),
    [clients],
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contracts.filter(c => {
      if (onlyActive && !c.is_active) return false
      if (!q) return true
      return c.number.toLowerCase().includes(q) || (c.client_name || '').toLowerCase().includes(q)
    })
  }, [contracts, onlyActive, search])

  const save = async () => {
    if (!editing) return
    const body = {
      client_id: editing.client_id,
      number: editing.number,
      kind: editing.kind || 'COMMERCIAL',
      signed_on: editing.signed_on,
      expires_on: editing.expires_on || null,
      planned_sqm: editing.planned_sqm ?? null,
      price_per_sqm: editing.price_per_sqm,
      comment: editing.comment || null,
      is_active: editing.is_active ?? true,
    }
    try {
      const saved = editing.id
        ? await contractsApi.update(editing.id, body)
        : await contractsApi.create(body)
      setEditing(null)
      await load()
      setSelectedId(saved.id)
      setSelected(saved)
      showToast(editing.id ? 'Контракт сохранён' : 'Контракт создан', 'success')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось сохранить контракт', 'error')
    }
  }

  const remove = async (c: Contract) => {
    if (!confirm(`Удалить контракт № ${c.number}?`)) return
    try {
      await contractsApi.remove(c.id)
      setSelectedId(null)
      await load()
      showToast('Контракт удалён', 'success')
    } catch {
      showToast('Не удалось удалить: по контракту есть работы', 'error')
    }
  }

  const refreshSelected = async () => {
    if (selectedId != null) setSelected(await contractsApi.get(selectedId))
  }

  return (
    <div>
      <h1>Контракты</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          placeholder="Номер или юрлицо"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 240 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} />
          Только действующие
        </label>
        <button
          className="btn-primary"
          onClick={() => setEditing({ kind: 'COMMERCIAL', signed_on: todayIso(), is_active: true })}
        >+ Контракт</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h3>Реестр ({visible.length})</h3>
          {visible.length === 0 && <div style={{ color: '#7f8c8d' }}>Контрактов нет</div>}
          {visible.map(c => {
            const expired = c.expires_on != null && c.expires_on < todayIso()
            return (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 6,
                  background: c.id === selectedId ? '#eaf4fd' : '#fff',
                  border: `1px solid ${c.id === selectedId ? '#3498db' : '#ecf0f1'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>№ {c.number}</strong>
                  <span style={{ color: '#7f8c8d', fontSize: 'var(--font-sm)' }}>
                    {Number(c.price_per_sqm).toLocaleString('ru')} ₽/м²
                  </span>
                </div>
                <div style={{ fontSize: 'var(--font-sm)' }}>{c.client_name}</div>
                <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>
                  {CONTRACT_KIND_LABELS[c.kind]} · с {c.signed_on}
                  {c.expires_on ? ` по ${c.expires_on}` : ' — бессрочно'}
                  {c.planned_sqm != null && ` · план ${Number(c.planned_sqm).toLocaleString('ru')} м²`}
                </div>
                {!c.is_active && <span className="badge badge-cancelled">В архиве</span>}
                {expired && c.is_active && <span className="badge badge-partially_done">Срок истёк</span>}
              </div>
            )
          })}
        </div>

        {selected ? (
          <ContractCard
            contract={selected}
            onEdit={() => setEditing(selected)}
            onDelete={() => remove(selected)}
            onChanged={refreshSelected}
          />
        ) : (
          <div className="card" style={{ color: '#7f8c8d' }}>Выберите контракт слева</div>
        )}
      </div>

      {editing && (
        <ContractModal
          value={editing}
          clients={legalEntities}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function ContractCard({ contract, onEdit, onDelete, onChanged }: {
  contract: Contract
  onEdit: () => void
  onDelete: () => void
  onChanged: () => Promise<void>
}) {
  const { showToast } = useToast()
  const pf: PlanFact | undefined = contract.plan_fact
  const [linkOrderId, setLinkOrderId] = useState('')

  const link = async () => {
    const id = Number(linkOrderId)
    if (!id) return
    try {
      const res = await contractsApi.linkOrder(contract.id, id)
      setLinkOrderId('')
      await onChanged()
      showToast(res.warning
        ? `Заказ привязан. ${res.warning}`
        : `Заказ привязан по ${Number(res.price_per_sqm).toLocaleString('ru')} ₽/м²`,
        res.warning ? 'warning' : 'success')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось привязать заказ', 'error')
    }
  }

  const toggleDelivery = async (orderId: number, delivered: boolean) => {
    // Отмена сдачи — исправление ошибки, поэтому спрашиваем причину: она
    // остаётся в истории сдачи.
    const reason = delivered ? undefined : (prompt('Причина отмены сдачи:') || undefined)
    if (!delivered && !reason) return
    try {
      await contractsApi.deliverOrder(contract.id, orderId, delivered, reason)
      await onChanged()
      showToast(delivered ? 'Сдача отмечена' : 'Сдача отменена', 'success')
    } catch {
      showToast('Не удалось изменить отметку сдачи', 'error')
    }
  }

  const uploadFile = async (file: File) => {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    await contractsApi.addFile(contract.id, { filename: file.name, content_type: file.type, data })
    await onChanged()
  }

  const percent = pf?.completion_percent
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>№ {contract.number} — {contract.client_name}</h3>
            <div style={{ color: '#7f8c8d', fontSize: 'var(--font-sm)' }}>
              {CONTRACT_KIND_LABELS[contract.kind]}
              {contract.client_inn && ` · ИНН ${contract.client_inn}`}
              {' · '}с {contract.signed_on}{contract.expires_on ? ` по ${contract.expires_on}` : ' — бессрочно'}
            </div>
            {contract.comment && <div style={{ marginTop: 6 }}>{contract.comment}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={onEdit}>Изменить</button>
            <button className="btn-danger" onClick={onDelete}>Удалить</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>План-факт</h3>
        {/* Учитываем только сданное: работа в цеху объём договора ещё не закрывает. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <Metric label="План, м²" value={pf?.planned_sqm} />
          <Metric label="Сдано, м²" value={pf?.fact_sqm} accent="#27ae60" />
          <Metric label="Остаток, м²" value={pf?.remaining_sqm} />
          {!!pf?.over_sqm && <Metric label="Сверх плана, м²" value={pf.over_sqm} accent="#e67e22" />}
          <Metric label="Цена, ₽/м²" value={contract.price_per_sqm} />
          <Metric label="Сдано на сумму, ₽" value={pf?.fact_amount} accent="#27ae60" />
        </div>
        {percent != null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 'var(--font-sm)', marginBottom: 4 }}>
              Выполнение: <strong>{Number(percent).toLocaleString('ru')}%</strong>
            </div>
            <div style={{ height: 10, background: '#ecf0f1', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, Number(percent))}%`, height: '100%',
                background: Number(percent) >= 100 ? '#27ae60' : '#3498db',
              }} />
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Работы по контракту</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input
            placeholder="Номер заказа"
            value={linkOrderId}
            onChange={e => setLinkOrderId(e.target.value.replace(/\D/g, ''))}
            style={{ width: 160 }}
          />
          <button className="btn-secondary" onClick={link}>Привязать заказ</button>
        </div>
        <table>
          <thead>
            <tr><th>Работа</th><th>Клиент</th><th>Дата</th><th>м²</th><th>В факте</th><th style={{ width: 150 }}></th></tr>
          </thead>
          <tbody>
            {(pf?.works || []).map(w => (
              <tr key={`${w.kind}-${w.id}`}>
                <td>
                  {w.kind === 'ORDER'
                    ? <Link to={`/orders/${w.id}`}>Заказ #{String(w.id).padStart(5, '0')}</Link>
                    : <>Выезд #{w.id}</>}
                </td>
                <td>{w.client_name}</td>
                <td>{w.work_date}</td>
                <td>{w.sqm != null ? Number(w.sqm).toLocaleString('ru') : '—'}</td>
                <td>
                  {w.counted
                    ? <span className="badge badge-done">Учтено</span>
                    : <span className="badge badge-lead">{w.kind === 'ORDER' ? 'Не сдан' : 'Не выполнен'}</span>}
                </td>
                <td>
                  {w.kind === 'ORDER' && (
                    <button className="btn-secondary" onClick={() => toggleDelivery(w.id, !w.counted)}>
                      {w.counted ? 'Отменить сдачу' : 'Отметить сдачу'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(pf?.works || []).length === 0 && (
              <tr><td colSpan={6} style={{ color: '#7f8c8d' }}>Работ по контракту пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Файлы договора</h3>
        <input
          type="file"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) void uploadFile(file).then(() => { e.target.value = '' })
          }}
        />
        <ul style={{ marginTop: 8 }}>
          {(contract.files || []).map(f => (
            <li key={f.id} style={{ marginBottom: 4 }}>
              <a href={contractsApi.fileUrl(contract.id, f.id)} target="_blank" rel="noreferrer">{f.filename}</a>
              {' '}
              <button
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: 'var(--font-sm)' }}
                onClick={async () => {
                  if (!confirm(`Удалить файл «${f.filename}»?`)) return
                  await contractsApi.deleteFile(contract.id, f.id)
                  await onChanged()
                }}
              >удалить</button>
            </li>
          ))}
          {(contract.files || []).length === 0 && <li style={{ color: '#7f8c8d' }}>Файлов нет</li>}
        </ul>
      </div>

      {!!pf?.deliveries?.length && (
        <div className="card">
          <h3>История сдачи</h3>
          <table>
            <thead><tr><th>Дата</th><th>Работа</th><th>м²</th><th>Действие</th><th>Причина</th><th>Кто</th></tr></thead>
            <tbody>
              {pf.deliveries.map(d => (
                <tr key={d.id}>
                  <td>{new Date(d.created_at).toLocaleString('ru')}</td>
                  <td>{d.order_id ? `Заказ #${String(d.order_id).padStart(5, '0')}` : `Выезд #${d.cleaning_id}`}</td>
                  <td>{Number(d.sqm).toLocaleString('ru')}</td>
                  <td>{d.action === 'DELIVERED' ? 'Сдано' : 'Сдача отменена'}</td>
                  <td>{d.reason || '—'}</td>
                  <td>{d.created_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value?: number | null; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent }}>
        {value == null ? '—' : Number(value).toLocaleString('ru')}
      </div>
    </div>
  )
}

function ContractModal({ value, clients, onChange, onClose, onSave }: {
  value: Partial<Contract>
  clients: Client[]
  onChange: (v: Partial<Contract>) => void
  onClose: () => void
  onSave: () => void
}) {
  const set = (patch: Partial<Contract>) => onChange({ ...value, ...patch })
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>{value.id ? 'Контракт' : 'Новый контракт'}</h2>

        <label>Юрлицо
          <select
            value={value.client_id ?? ''}
            onChange={e => set({ client_id: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">— выберите —</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label>Номер контракта
          <input value={value.number ?? ''} onChange={e => set({ number: e.target.value })} />
        </label>

        <label>Вид
          <select value={value.kind ?? 'COMMERCIAL'} onChange={e => set({ kind: e.target.value as ContractKind })}>
            {Object.entries(CONTRACT_KIND_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>Заключён
            <input type="date" value={value.signed_on ?? ''} onChange={e => set({ signed_on: e.target.value })} />
          </label>
          <label style={{ flex: 1 }}>Действует до
            <input type="date" value={value.expires_on ?? ''} onChange={e => set({ expires_on: e.target.value })} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <label style={{ flex: 1 }}>Плановый объём, м²
            <input
              type="number" min="0" step="0.01"
              value={value.planned_sqm ?? ''}
              onChange={e => set({ planned_sqm: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <label style={{ flex: 1 }}>Цена, ₽/м²
            <input
              type="number" min="0" step="0.01"
              value={value.price_per_sqm ?? ''}
              onChange={e => set({ price_per_sqm: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
        </div>
        {/* Цена одна на весь договор: несколько тарифов внутри контракта ТЗ
            прямо исключает. Изменение цены не трогает уже учтённые заказы. */}
        <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d', marginBottom: 8 }}>
          Цена применяется к услугам за м² в заказах контракта. Новая цена действует
          только для заказов, привязанных после изменения.
        </div>

        <label>Комментарий
          <textarea rows={2} value={value.comment ?? ''} onChange={e => set({ comment: e.target.value })} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={value.is_active ?? true}
            onChange={e => set({ is_active: e.target.checked })}
          />
          Действующий
        </label>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={onSave}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
