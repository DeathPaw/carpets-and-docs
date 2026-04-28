import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClients, createClient, updateClient, getClientOrders, searchClients, getClientModifiers, addClientModifier, removeClientModifier } from '../api/clients'
import { getPriceModifiers } from '../api/references'
import type { Client, Order, CreateClientRequest } from '../types'

function formatOrderNumber(id: number, createdAt: string): string {
  const num = String(id).padStart(5, '0')
  const date = new Date(createdAt).toLocaleDateString('ru')
  return `${num} от ${date}`
}

function CreateClientModal({
  onClose,
  onCreated,
  editClient
}: {
  onClose: () => void
  onCreated: (client: Client) => void
  editClient?: Client
}) {
  const [clientType, setClientType] = useState<'INDIVIDUAL' | 'LEGAL_ENTITY'>(editClient?.client_type || 'INDIVIDUAL')
  const [form, setForm] = useState<CreateClientRequest>({
    client_type: editClient?.client_type || 'INDIVIDUAL',
    name: editClient?.name || '',
    first_name: editClient?.first_name || '',
    last_name: editClient?.last_name || '',
    phone: editClient?.phone || '',
    extra_phone: editClient?.extra_phone || '',
    address: editClient?.address || '',
    district: editClient?.district || '',
    inn: editClient?.inn || '',
    contact_person: editClient?.contact_person || '',
    contact_person_phone: editClient?.contact_person_phone || '',
    comment: editClient?.comment || '',
    is_pensioner: editClient?.is_pensioner || false,
    is_problem: editClient?.is_problem || false,
    is_regular: editClient?.is_regular || false,
  })
  const [showExtraPhone, setShowExtraPhone] = useState(!!editClient?.extra_phone)
  const [showInn, setShowInn] = useState(!!editClient?.inn)
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

  const updateType = (type: 'INDIVIDUAL' | 'LEGAL_ENTITY') => {
    setClientType(type)
    setForm(f => ({ ...f, client_type: type }))
  }

  const submit = async () => {
    if (clientType === 'INDIVIDUAL') {
      if (!form.first_name?.trim() && !form.name?.trim()) {
        setError('Имя клиента обязательно')
        return
      }
    } else {
      if (!form.name?.trim()) {
        setError('Название организации обязательно')
        return
      }
    }

    setLoading(true)
    try {
      const data: CreateClientRequest = {
        ...form,
        client_type: clientType,
        name: clientType === 'INDIVIDUAL'
          ? `${form.last_name || ''} ${form.first_name || ''}`.trim() || form.name
          : form.name,
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
    <div className="modal-overlay" onClick={() => { if (confirm(editClient ? 'Отменить редактирование клиента?' : 'Отменить создание клиента?')) onClose() }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{editClient ? 'Редактировать клиента' : 'Новый клиент'}</h2>

        <div className="form-group">
          <label>Тип клиента</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={clientType === 'INDIVIDUAL' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => updateType('INDIVIDUAL')}
            >
              Физ. лицо
            </button>
            <button
              type="button"
              className={clientType === 'LEGAL_ENTITY' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => updateType('LEGAL_ENTITY')}
            >
              Юр. лицо
            </button>
          </div>
        </div>

        {clientType === 'INDIVIDUAL' ? (
          <>
            <div className="form-group">
              <label>Фамилия</label>
              <input
                value={form.last_name || ''}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                placeholder="Фамилия"
              />
            </div>
            <div className="form-group">
              <label>Имя *</label>
              <input
                value={form.first_name || ''}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                placeholder="Имя"
              />
            </div>
            <div className="form-group">
              <label>Телефон</label>
              <input
                value={form.phone || ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Телефон"
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label>Название организации *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Название организации"
              />
            </div>
            <div className="form-group">
              <label>Контактное лицо</label>
              <input
                value={form.contact_person || ''}
                onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                placeholder="ФИО контактного лица"
              />
            </div>
            <div className="form-group">
              <label>Телефон контактного лица</label>
              <input
                value={form.contact_person_phone || ''}
                onChange={e => setForm(f => ({ ...f, contact_person_phone: e.target.value }))}
                placeholder="Телефон контактного лица"
              />
            </div>
            <div className="form-group">
              <label>Телефон</label>
              <input
                value={form.phone || ''}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Телефон организации"
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={showInn} onChange={e => setShowInn(e.target.checked)} />
                Указать ИНН
              </label>
            </div>
            {showInn && (
              <div className="form-group">
                <label>ИНН</label>
                <input
                  value={form.inn || ''}
                  onChange={e => setForm(f => ({ ...f, inn: e.target.value }))}
                  placeholder="ИНН"
                />
              </div>
            )}
          </>
        )}

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={showExtraPhone} onChange={e => setShowExtraPhone(e.target.checked)} />
            Дополнительный телефон
          </label>
        </div>
        {showExtraPhone && (
          <div className="form-group">
            <label>Доп. телефон</label>
            <input
              value={form.extra_phone || ''}
              onChange={e => setForm(f => ({ ...f, extra_phone: e.target.value }))}
              placeholder="Дополнительный телефон"
            />
          </div>
        )}

        <div className="form-group">
          <label>Адрес</label>
          <textarea
            rows={2}
            value={form.address || ''}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Адрес"
          />
        </div>
        <div className="form-group">
          <label>Район</label>
          <input
            value={form.district || ''}
            onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
            placeholder="Район"
          />
        </div>
        <div className="form-group">
          <label>Комментарий</label>
          <textarea
            rows={2}
            value={form.comment || ''}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            placeholder="Комментарий"
          />
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.is_pensioner || false} onChange={e => setForm(f => ({ ...f, is_pensioner: e.target.checked }))} />
            Пенсионер
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.is_regular || false} onChange={e => setForm(f => ({ ...f, is_regular: e.target.checked }))} />
            Постоянный клиент
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.is_problem || false} onChange={e => setForm(f => ({ ...f, is_problem: e.target.checked }))} />
            Проблемный
          </label>
        </div>

        {editClient && allMods.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>Модификаторы цены:</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {allMods.map(m => (
                <label key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={clientMods.includes(m.id)}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        await addClientModifier(editClient.id, m.id)
                        setClientMods(prev => [...prev, m.id])
                      } else {
                        await removeClientModifier(editClient.id, m.id)
                        setClientMods(prev => prev.filter(id => id !== m.id))
                      }
                    }}
                  />
                  {m.name} ({m.percent > 0 ? '+' : ''}{m.percent}%)
                </label>
              ))}
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
      <div className="modal large" onClick={e => e.stopPropagation()}>
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

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [showOrders, setShowOrders] = useState<Client | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [tab, setTab] = useState<'INDIVIDUAL' | 'LEGAL_ENTITY'>('INDIVIDUAL')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getClients()
      setClients(data)
    } catch {
      // ignore
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
        } catch {
          // ignore
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
          <th>Район</th>
          <th>Метки</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={8} className="empty">Клиенты не найдены</td></tr>
        ) : list.map(c => (
          <tr key={c.id}>
            <td>{c.id}</td>
            <td>
              {c.name}
              {c.comment && <div style={{ fontSize: '0.8em', color: '#888' }}>{c.comment}</div>}
            </td>
            <td>{c.phone || '—'}</td>
            <td>{c.extra_phone || '—'}</td>
            <td>{c.address || '—'}</td>
            <td>{c.district || '—'}</td>
            <td>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {c.is_regular && <span className="badge badge-done">Постоянный</span>}
                {c.is_pensioner && <span className="badge badge-lead">Пенсионер</span>}
                {c.is_problem && <span className="badge badge-cancelled">Проблемный</span>}
              </div>
            </td>
            <td>
              <div className="actions">
                <button className="btn-secondary btn-sm" onClick={() => setShowOrders(c)}>Заказы</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditClient(c)}>Изменить</button>
              </div>
            </td>
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
          <th>Метки</th>
          <th>Действия</th>
        </tr>
      </thead>
      <tbody>
        {list.length === 0 ? (
          <tr><td colSpan={9} className="empty">Клиенты не найдены</td></tr>
        ) : list.map(c => (
          <tr key={c.id}>
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
            <td>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {c.is_regular && <span className="badge badge-done">Постоянный</span>}
                {c.is_problem && <span className="badge badge-cancelled">Проблемный</span>}
              </div>
            </td>
            <td>
              <div className="actions">
                <button className="btn-secondary btn-sm" onClick={() => setShowOrders(c)}>Заказы</button>
                <button className="btn-secondary btn-sm" onClick={() => setEditClient(c)}>Изменить</button>
              </div>
            </td>
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
    </div>
  )
}
