import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClients, createClient, updateClient, getClientOrders, searchClients, getClientModifiers, addClientModifier, removeClientModifier, getClientEvents, addClientEvent } from '../api/clients'
import { getPriceModifiers } from '../api/references'
import { useToast } from '../components/Toast'
import { formatPhone } from '../components/PhoneInput'
import ClientFormFields, { type ClientFormState, emptyClientForm, validateClientForm } from '../components/ClientFormFields'
import { formatOrderNumber } from '../utils/format'
import type { Client, Order, CreateClientRequest } from '../types'

function CreateClientModal({
  onClose,
  onCreated,
  editClient
}: {
  onClose: () => void
  onCreated: (client: Client) => void
  editClient?: Client
}) {
  const [form, setForm] = useState<ClientFormState>(() =>
    editClient
      ? {
          client_type: editClient.client_type,
          first_name: editClient.first_name || '',
          last_name: editClient.last_name || '',
          name: editClient.name || '',
          phone: editClient.phone || '',
          extra_phone: editClient.extra_phone || '',
          contact_person: editClient.contact_person || '',
          contact_person_phone: editClient.contact_person_phone || '',
          inn: editClient.inn || '',
          address: editClient.address || '',
          district: editClient.district || '',
          comment: editClient.comment || '',
          lat: editClient.lat,
          lon: editClient.lon,
        }
      : emptyClientForm()
  )
  // Флаги (пенсионер / проблемный / постоянный) сохраняем при редактировании, чтобы
  // не сбросились — UI для них на этой странице исторически не было, в OrdersPage тоже нет.
  // При создании всегда false. Для управления ими — отдельный экран (по плану).
  const flags = {
    is_pensioner: editClient?.is_pensioner || false,
    is_problem: editClient?.is_problem || false,
    is_regular: editClient?.is_regular || false,
  }
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [clientMods, setClientMods] = useState<number[]>([])
  const [allMods, setAllMods] = useState<import('../types').PriceModifier[]>([])

  useEffect(() => {
    getPriceModifiers().then(setAllMods).catch(() => {})
    if (editClient) {
      getClientModifiers(editClient.id).then(mods => setClientMods(mods.map(m => m.id))).catch(() => {})
    }
  }, [editClient])

  const submit = async () => {
    const validationError = validateClientForm(form)
    if (validationError) { setError(validationError); return }

    setLoading(true)
    try {
      const data: CreateClientRequest = {
        client_type: form.client_type,
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
        // Для физлица собираем name из last_name + first_name; для юрлица — это название организации.
        name: form.client_type === 'INDIVIDUAL'
          ? `${form.last_name || ''} ${form.first_name || ''}`.trim() || form.name
          : form.name,
        phone: form.phone ? formatPhone(form.phone) : '',
        extra_phone: form.extra_phone ? formatPhone(form.extra_phone) : '',
        contact_person: form.contact_person || undefined,
        contact_person_phone: form.contact_person_phone ? formatPhone(form.contact_person_phone) : '',
        inn: form.inn || undefined,
        address: form.address || undefined,
        district: form.district || undefined,
        comment: form.comment || undefined,
        lat: form.lat,
        lon: form.lon,
        ...flags,
      }
      const client = editClient
        ? await updateClient(editClient.id, data)
        : await createClient(data)
      onCreated(client)
    } catch {
      setError(editClient ? 'Ошибка при обновлении клиента' : 'Ошибка при создании клиента')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: '1.5em', cursor: 'pointer', color: '#888', lineHeight: 1 }}
          title="Закрыть"
        >&times;</button>
        <h2>{editClient ? 'Редактировать клиента' : 'Новый клиент'}</h2>

        <ClientFormFields value={form} onChange={setForm} />

        {allMods.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, marginBottom: 6, display: 'block' }}>Модификаторы цены:</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {allMods.map(m => {
                const active = clientMods.includes(m.id)
                const color = m.percent < 0 ? '#27ae60' : m.percent > 0 ? '#e74c3c' : '#888'
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={async () => {
                      if (!editClient) return
                      if (active) {
                        await removeClientModifier(editClient.id, m.id)
                        setClientMods(prev => prev.filter(id => id !== m.id))
                      } else {
                        await addClientModifier(editClient.id, m.id)
                        setClientMods(prev => [...prev, m.id])
                      }
                    }}
                    disabled={!editClient}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: `2px solid ${active ? color : '#ddd'}`,
                      background: active ? (m.percent < 0 ? '#eafaf1' : m.percent > 0 ? '#fdedec' : '#f5f5f5') : '#fff',
                      color: active ? color : '#999',
                      fontWeight: active ? 600 : 400,
                      cursor: editClient ? 'pointer' : 'default',
                      fontSize: '0.9em',
                    }}
                  >
                    {m.name} ({m.percent > 0 ? '+' : ''}{m.percent}%)
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ClientOrdersModal({
  client,
  onClose
}: {
  client: Client
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getClientOrders(client.id)
        setOrders(data)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [client.id])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <h2>Заказы клиента: {client.name}</h2>
        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : orders.length === 0 ? (
          <div className="empty">У клиента пока нет заказов</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Статус</th>
                <th>Сумма</th>
                <th>Оплачен</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id}>
                  <td>{formatOrderNumber(order.id, order.created_at)}</td>
                  <td>{order.status}</td>
                  <td>{Number(order.total_amount).toFixed(2)} &#8381;</td>
                  <td>{order.paid ? 'Да' : '—'}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('ru')}</td>
                  <td>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        onClose()
                        navigate(`/orders/${order.id}`)
                      }}
                    >
                      Открыть
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

function ClientCardModal({
  client,
  onClose,
  onEdit,
  onShowOrders,
}: {
  client: Client
  onClose: () => void
  onEdit: (c: Client) => void
  onShowOrders: (c: Client) => void
}) {
  const [clientMods, setClientMods] = useState<import('../types').PriceModifier[]>([])
  const [events, setEvents] = useState<{id: number, client_id: number, event_type: string, description: string, created_at: string}[]>([])
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    getClientModifiers(client.id).then(setClientMods).catch(() => {})
    getClientEvents(client.id).then(evts => setEvents(evts.slice(0, 10))).catch(() => {})
  }, [client.id])

  const handleAddNote = () => {
    if (!newNote.trim()) return
    addClientEvent(client.id, 'NOTE', newNote.trim())
      .then(() => getClientEvents(client.id))
      .then(evts => { setEvents(evts.slice(0, 10)); setNewNote('') })
      .catch(() => {})
  }

  const isLegal = client.client_type === 'LEGAL_ENTITY'

  const eventTypeColors: Record<string, string> = { NOTE: '#888', CALL: '#3498db', COMPLAINT: '#e74c3c', ORDER_CREATED: '#27ae60', WARRANTY: '#f39c12' }
  const eventTypeLabels: Record<string, string> = { NOTE: 'Заметка', CALL: 'Звонок', COMPLAINT: 'Жалоба', ORDER_CREATED: 'Заказ', WARRANTY: 'Гарантия' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>{client.name}</h2>
            <div style={{ color: '#888', fontSize: '0.9em', marginTop: 4 }}>
              {isLegal ? 'Юридическое лицо' : 'Физическое лицо'} &middot; #{client.id}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary btn-sm" onClick={() => { onClose(); onEdit(client) }}>Редактировать</button>
            <button className="btn-secondary btn-sm" onClick={() => { onClose(); onShowOrders(client) }}>Заказы клиента</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 250px' }}>
            {!isLegal && (
              <>
                <div style={{ marginBottom: 8 }}><strong>Фамилия:</strong> {client.last_name || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Имя:</strong> {client.first_name || 'не указано'}</div>
              </>
            )}
            {isLegal && (
              <>
                <div style={{ marginBottom: 8 }}><strong>ИНН:</strong> {client.inn || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Контактное лицо:</strong> {client.contact_person || 'не указано'}</div>
                <div style={{ marginBottom: 8 }}><strong>Тел. контакта:</strong> {client.contact_person_phone ? formatPhone(client.contact_person_phone) : 'не указано'}</div>
              </>
            )}
            <div style={{ marginBottom: 8 }}><strong>Телефон:</strong> {client.phone ? formatPhone(client.phone) : 'не указано'}</div>
            <div style={{ marginBottom: 8 }}><strong>Доп. телефон:</strong> {client.extra_phone ? formatPhone(client.extra_phone) : 'не указано'}</div>
          </div>
          <div style={{ flex: '1 1 250px' }}>
            <div style={{ marginBottom: 8 }}><strong>Адрес:</strong> {client.address || 'не указано'}</div>
            <div style={{ marginBottom: 8 }}><strong>Район:</strong> {client.district || 'не указано'}</div>
            <div style={{ marginBottom: 8 }}><strong>Комментарий:</strong> {client.comment || 'не указано'}</div>
            <div style={{ marginBottom: 8 }}><strong>Создан:</strong> {new Date(client.created_at).toLocaleDateString('ru')}</div>
          </div>
        </div>

        {clientMods.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>Модификаторы цены:</strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {clientMods.map(m => (
                <span key={m.id} style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: '0.85em', fontWeight: 600,
                  color: m.percent < 0 ? '#27ae60' : m.percent > 0 ? '#e74c3c' : '#888',
                  background: m.percent < 0 ? '#eafaf1' : m.percent > 0 ? '#fdedec' : '#f5f5f5',
                }}>
                  {m.name} ({m.percent > 0 ? '+' : ''}{m.percent}%)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Client Events */}
        <div style={{ marginTop: 16 }}>
          <strong>События клиента</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 8 }}>
            <input
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="Добавить заметку..."
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNote() }}
            />
            <button className="btn-primary btn-sm" disabled={!newNote.trim()} onClick={handleAddNote}>Добавить</button>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ color: '#999', fontSize: '0.9em' }}>Нет событий</div>
            ) : events.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.85em' }}>
                <span style={{ color: eventTypeColors[ev.event_type] || '#888', fontWeight: 600, minWidth: 60 }}>
                  {eventTypeLabels[ev.event_type] || ev.event_type}
                </span>
                <span style={{ flex: 1 }}>{ev.description}</span>
                <span style={{ color: '#999', whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleDateString('ru')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const { showToast } = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [showOrders, setShowOrders] = useState<Client | null>(null)
  const [viewClient, setViewClient] = useState<Client | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [tab, setTab] = useState<'INDIVIDUAL' | 'LEGAL_ENTITY'>('INDIVIDUAL')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка загрузки клиентов'
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    if (searchTimeout) clearTimeout(searchTimeout)
    const timeout = setTimeout(async () => {
      if (q.trim()) {
        setLoading(true)
        try {
          const results = await searchClients(q.trim())
          setClients(results)
        } catch (e: unknown) {
          const msg = (e as any)?.response?.data?.message || 'Ошибка поиска клиентов'
          showToast(msg, 'error')
        } finally {
          setLoading(false)
        }
      } else {
        void load()
      }
    }, 400)
    setSearchTimeout(timeout)
  }

  const handleCreated = () => {
    setShowCreate(false)
    setEditClient(null)
    void load()
  }

  const filtered = clients.filter(c => (c.client_type || 'INDIVIDUAL') === tab)

  const renderIndividualsTable = (list: Client[]) => (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Фамилия Имя</th>
          <th>Телефон</th>
          <th>Доп. телефон</th>
          <th>Адрес</th>
          {/* Район убрали — у юрлиц его и так нет, для физлиц он в адресе по сути дублируется. */}
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={5} className="empty">Клиенты не найдены</td></tr>
        ) : list.map(c => (
          <tr key={c.id} onClick={() => setViewClient(c)} style={{ cursor: 'pointer' }}>
            <td>{c.id}</td>
            <td>
              {c.name}
              {c.comment && <div style={{ fontSize: '0.8em', color: '#888' }}>{c.comment}</div>}
            </td>
            <td>{c.phone || '—'}</td>
            <td>{c.extra_phone || '—'}</td>
            <td>{c.address || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  const renderLegalTable = (list: Client[]) => (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Организация</th>
          <th>ИНН</th>
          <th>Контактное лицо</th>
          <th>Тел. контакта</th>
          <th>Телефон</th>
          <th>Адрес</th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={7} className="empty">Клиенты не найдены</td></tr>
        ) : list.map(c => (
          <tr key={c.id} onClick={() => setViewClient(c)} style={{ cursor: 'pointer' }}>
            <td>{c.id}</td>
            <td>
              {c.name}
              {c.comment && <div style={{ fontSize: '0.8em', color: '#888' }}>{c.comment}</div>}
            </td>
            <td>{c.inn || '—'}</td>
            <td>{c.contact_person || '—'}</td>
            <td>{c.contact_person_phone || '—'}</td>
            <td>{c.phone || '—'}</td>
            <td>{c.address || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div>
      <div className="page-header">
        <h1>Клиенты</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Новый клиент
        </button>
      </div>

      <div className="filters">
        <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
          <label>Поиск</label>
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Поиск по имени, телефону, адресу, ИНН, организации..."
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={tab === 'INDIVIDUAL' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('INDIVIDUAL')}
        >
          Физические лица ({clients.filter(c => (c.client_type || 'INDIVIDUAL') === 'INDIVIDUAL').length})
        </button>
        <button
          className={tab === 'LEGAL_ENTITY' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setTab('LEGAL_ENTITY')}
        >
          Юридические лица ({clients.filter(c => c.client_type === 'LEGAL_ENTITY').length})
        </button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : tab === 'INDIVIDUAL' ? renderIndividualsTable(filtered) : renderLegalTable(filtered)}

      {showCreate && (
        <CreateClientModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}

      {editClient && (
        <CreateClientModal
          onClose={() => setEditClient(null)}
          onCreated={handleCreated}
          editClient={editClient}
        />
      )}

      {showOrders && (
        <ClientOrdersModal
          client={showOrders}
          onClose={() => setShowOrders(null)}
        />
      )}

      {viewClient && (
        <ClientCardModal
          client={viewClient}
          onClose={() => setViewClient(null)}
          onEdit={(c) => { setViewClient(null); setEditClient(c) }}
          onShowOrders={(c) => { setViewClient(null); setShowOrders(c) }}
        />
      )}
    </div>
  )
}
