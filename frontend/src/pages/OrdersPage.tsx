import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOrders, createOrder, updateOrderDetails } from '../api/orders'
import { searchClients, createClient } from '../api/clients'
import { geocodeAddress } from '../api/geocode'
import { useToast } from '../components/Toast'
import type { Order, OrderStatus, CreateOrderRequest, Client } from '../types'

const STATUS_LABELS: Record<string, string> = {
  LEAD: 'Лид',
  CREATED: 'Создан',
  FOR_PICKUP: 'К забору',
  IN_PROGRESS: 'В работе',
  PARTIALLY_DONE: 'Частично готов',
  DONE: 'Готов',
  DELIVERED: 'Доставлен',
  CANCELLED: 'Отменен',
}

const PAYMENT_LABELS: Record<string, string> = {
  TRANSFER: 'Перевод',
  CARD: 'Карта',
  CASH: 'Наличные',
}

const ALL_STATUSES: OrderStatus[] = ['LEAD', 'CREATED', 'FOR_PICKUP', 'IN_PROGRESS', 'PARTIALLY_DONE', 'DONE', 'DELIVERED', 'CANCELLED']

function formatOrderNumber(id: number, createdAt: string): string {
  const num = String(id).padStart(5, '0')
  const date = new Date(createdAt).toLocaleDateString('ru')
  return `${num} от ${date}`
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (o: Order) => void }) {
  const [form, setForm] = useState<CreateOrderRequest>({ client_name: '', comment: '' })
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientType, setNewClientType] = useState<'INDIVIDUAL' | 'LEGAL_ENTITY'>('INDIVIDUAL')
  const [newClientData, setNewClientData] = useState({
    name: '',
    first_name: '',
    last_name: '',
    phone: '',
    extra_phone: '',
    address: '',
    district: '',
    inn: '',
    contact_person: '',
    contact_person_phone: '',
    comment: '',
  })
  const [showExtraPhone, setShowExtraPhone] = useState(false)
  const [showInn, setShowInn] = useState(false)
  const [customAddress, setCustomAddress] = useState(false)
  const [sameAddress, setSameAddress] = useState(true)
  const [pickupAddress, setPickupAddress] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [pickupDistrict, setPickupDistrict] = useState('')
  const [deliveryDistrict, setDeliveryDistrict] = useState('')
  const [pickupDistrictAuto, setPickupDistrictAuto] = useState(false)
  const [deliveryDistrictAuto, setDeliveryDistrictAuto] = useState(false)
  const [pickupGeoWarn, setPickupGeoWarn] = useState('')
  const [deliveryGeoWarn, setDeliveryGeoWarn] = useState('')
  const [legacyId, setLegacyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [geoTimer, setGeoTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const doClientSearch = (q: string) => {
    setClientSearch(q)
    setSelectedClientId(null)
    setSelectedClientName('')
    if (searchTimer) clearTimeout(searchTimer)
    if (!q.trim()) { setClients([]); return }
    const timer = setTimeout(async () => {
      try {
        const results = await searchClients(q.trim())
        setClients(results)
      } catch { /* ignore */ }
    }, 300)
    setSearchTimer(timer)
  }

  const selectClient = (c: Client) => {
    setSelectedClientId(c.id)
    setSelectedClientName(c.name)
    setClientSearch(c.name)
    setClients([])
  }

  const doGeocode = useCallback(async (address: string, type: 'pickup' | 'delivery') => {
    if (!address.trim()) return
    const setDistrict = type === 'pickup' ? setPickupDistrict : setDeliveryDistrict
    const setAuto = type === 'pickup' ? setPickupDistrictAuto : setDeliveryDistrictAuto
    const setWarn = type === 'pickup' ? setPickupGeoWarn : setDeliveryGeoWarn

    const result = await geocodeAddress(address)
    if (!result.found) {
      setWarn('Адрес не найден. Укажите район вручную.')
      setAuto(false)
      return
    }
    if (!result.isSPB) {
      setWarn('Адрес не в Санкт-Петербурге. Укажите район вручную.')
      setAuto(false)
      return
    }
    if (!result.district) {
      setWarn('Не удалось определить район. Укажите вручную.')
      setAuto(false)
      return
    }
    setDistrict(result.district)
    setAuto(true)
    setWarn('')
  }, [])

  const handlePickupAddressChange = (val: string) => {
    setPickupAddress(val)
    setPickupDistrictAuto(false)
    setPickupGeoWarn('')
    if (geoTimer) clearTimeout(geoTimer)
    if (val.trim().length > 5) {
      const t = setTimeout(() => void doGeocode(val, 'pickup'), 1000)
      setGeoTimer(t)
    }
  }

  const handleDeliveryAddressChange = (val: string) => {
    setDeliveryAddress(val)
    setDeliveryDistrictAuto(false)
    setDeliveryGeoWarn('')
    if (geoTimer) clearTimeout(geoTimer)
    if (val.trim().length > 5) {
      const t = setTimeout(() => void doGeocode(val, 'delivery'), 1000)
      setGeoTimer(t)
    }
  }

  const submit = async () => {
    setLoading(true)
    try {
      let clientId = selectedClientId
      let clientName = ''

      if (showNewClient) {
        if (newClientType === 'INDIVIDUAL') {
          if (!newClientData.first_name.trim() && !newClientData.name.trim()) {
            setError('Имя клиента обязательно')
            setLoading(false)
            return
          }
        } else {
          if (!newClientData.name.trim()) {
            setError('Название организации обязательно')
            setLoading(false)
            return
          }
        }

        const resolvedName = newClientType === 'INDIVIDUAL'
          ? `${newClientData.last_name} ${newClientData.first_name}`.trim() || newClientData.name.trim()
          : newClientData.name.trim()

        let newClient: Client
        try {
          newClient = await createClient({
            client_type: newClientType,
            name: resolvedName,
            first_name: newClientData.first_name.trim() || undefined,
            last_name: newClientData.last_name.trim() || undefined,
            phone: newClientData.phone.trim() || undefined,
            extra_phone: newClientData.extra_phone.trim() || undefined,
            address: newClientData.address.trim() || undefined,
            district: newClientData.district.trim() || undefined,
            inn: newClientData.inn.trim() || undefined,
            contact_person: newClientData.contact_person.trim() || undefined,
            contact_person_phone: newClientData.contact_person_phone.trim() || undefined,
            comment: newClientData.comment.trim() || undefined,
          })
        } catch {
          setError('Ошибка при создании клиента')
          setLoading(false)
          return
        }
        clientId = newClient.id
        clientName = newClient.name
        if (newClient.address && !pickupAddress) setPickupAddress(newClient.address)
        if (newClient.address && !deliveryAddress) setDeliveryAddress(newClient.address)
      } else {
        if (!selectedClientId) {
          setError('Введите имя клиента и выберите из списка')
          setLoading(false)
          return
        }
        clientName = selectedClientName
      }

      // Адреса: если customAddress — берём из полей, иначе из адреса клиента
      const clientAddr = showNewClient ? newClientData.address.trim() : (clients.find(c => c.id === clientId)?.address || '')
      const clientDist = showNewClient ? newClientData.district.trim() : ''

      const finalPickupAddress = customAddress ? pickupAddress.trim() : clientAddr
      const finalPickupDistrict = customAddress ? pickupDistrict.trim() : clientDist
      const finalDeliveryAddress = customAddress ? (sameAddress ? pickupAddress.trim() : deliveryAddress.trim()) : clientAddr
      const finalDeliveryDistrict = customAddress ? (sameAddress ? pickupDistrict.trim() : deliveryDistrict.trim()) : clientDist

      // Валидация районов (только если адрес заполнен)
      if (finalPickupAddress && !finalPickupDistrict) {
        setError('Укажите район (не удалось определить автоматически)')
        setLoading(false)
        return
      }
      if (finalDeliveryAddress && !finalDeliveryDistrict && finalDeliveryAddress !== finalPickupAddress) {
        setError('Укажите район доставки (не удалось определить автоматически)')
        setLoading(false)
        return
      }

      const orderData: CreateOrderRequest = {
        client_id: clientId,
        client_name: clientName,
        comment: form.comment || null,
        pickup_address: finalPickupAddress || null,
        delivery_address: finalDeliveryAddress || null,
        legacy_id: legacyId ? Number(legacyId) : null,
      }

      const order = await createOrder(orderData)
      // Установить районы через updateDetails
      if (finalPickupDistrict || finalDeliveryDistrict) {
        await updateOrderDetails(order.id, {
          pickup_address: finalPickupAddress || null,
          delivery_address: finalDeliveryAddress || null,
          pickup_district: finalPickupDistrict || null,
          delivery_district: finalDeliveryDistrict || finalPickupDistrict || null,
        })
      }
      onCreated(order)
    } catch {
      setError('Ошибка при создании заказа')
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
        <h2>Новый заказ</h2>

        <div className="form-group">
          <label>Клиент</label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className={!showNewClient ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setShowNewClient(false)}
            >
              Выбрать существующего
            </button>
            <button
              type="button"
              className={showNewClient ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => setShowNewClient(true)}
            >
              Создать нового
            </button>
          </div>

          {!showNewClient ? (
            <div style={{ position: 'relative' }}>
              <input
                value={clientSearch}
                onChange={e => doClientSearch(e.target.value)}
                placeholder="Начните вводить имя, телефон, организацию..."
                autoComplete="off"
              />
              {clients.length > 0 && !selectedClientId && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: '#fff', border: '1px solid #ddd', borderRadius: 4,
                  maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                  {clients.map(c => (
                    <div
                      key={c.id}
                      onClick={() => selectClient(c)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f6ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                    >
                      <div><strong>{c.name}</strong>{c.client_type === 'LEGAL_ENTITY' ? ' (юр.)' : ''}</div>
                      <div style={{ fontSize: '0.85em', color: '#666' }}>
                        {c.phone || ''}{c.address ? ` · ${c.address}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedClientId && (
                <div style={{ marginTop: 4, fontSize: '0.9em', color: '#27ae60' }}>
                  Выбран: {selectedClientName} (#{selectedClientId})
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label>Тип клиента</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" className={newClientType === 'INDIVIDUAL' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setNewClientType('INDIVIDUAL')}>Физ. лицо</button>
                  <button type="button" className={newClientType === 'LEGAL_ENTITY' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setNewClientType('LEGAL_ENTITY')}>Юр. лицо</button>
                </div>
              </div>

              {newClientType === 'INDIVIDUAL' ? (
                <>
                  <div className="form-group">
                    <label>Фамилия</label>
                    <input value={newClientData.last_name} onChange={e => setNewClientData(d => ({ ...d, last_name: e.target.value }))} placeholder="Фамилия" />
                  </div>
                  <div className="form-group">
                    <label>Имя *</label>
                    <input value={newClientData.first_name} onChange={e => setNewClientData(d => ({ ...d, first_name: e.target.value }))} placeholder="Имя" />
                  </div>
                  <div className="form-group">
                    <label>Телефон</label>
                    <input value={newClientData.phone} onChange={e => setNewClientData(d => ({ ...d, phone: e.target.value }))} placeholder="Телефон" />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label>Название организации *</label>
                    <input value={newClientData.name} onChange={e => setNewClientData(d => ({ ...d, name: e.target.value }))} placeholder="Название организации" />
                  </div>
                  <div className="form-group">
                    <label>Контактное лицо</label>
                    <input value={newClientData.contact_person} onChange={e => setNewClientData(d => ({ ...d, contact_person: e.target.value }))} placeholder="ФИО контактного лица" />
                  </div>
                  <div className="form-group">
                    <label>Телефон контактного лица</label>
                    <input value={newClientData.contact_person_phone} onChange={e => setNewClientData(d => ({ ...d, contact_person_phone: e.target.value }))} placeholder="Телефон контактного лица" />
                  </div>
                  <div className="form-group">
                    <label>Телефон организации</label>
                    <input value={newClientData.phone} onChange={e => setNewClientData(d => ({ ...d, phone: e.target.value }))} placeholder="Телефон организации" />
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
                      <input value={newClientData.inn} onChange={e => setNewClientData(d => ({ ...d, inn: e.target.value }))} placeholder="ИНН" />
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
                  <input value={newClientData.extra_phone} onChange={e => setNewClientData(d => ({ ...d, extra_phone: e.target.value }))} placeholder="Дополнительный телефон" />
                </div>
              )}

              <div className="form-group">
                <label>Адрес</label>
                <textarea rows={2} value={newClientData.address} onChange={e => setNewClientData(d => ({ ...d, address: e.target.value }))} placeholder="Адрес" />
              </div>
              <div className="form-group">
                <label>Район</label>
                <input value={newClientData.district} onChange={e => setNewClientData(d => ({ ...d, district: e.target.value }))} placeholder="Район" />
              </div>
              <div className="form-group">
                <label>Комментарий</label>
                <textarea rows={2} value={newClientData.comment} onChange={e => setNewClientData(d => ({ ...d, comment: e.target.value }))} placeholder="Комментарий" />
              </div>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={customAddress} onChange={e => {
              setCustomAddress(e.target.checked)
              if (!e.target.checked) {
                // Сбрасываем адреса заказа — будут браться из клиента
                setPickupAddress('')
                setPickupDistrict('')
                setPickupDistrictAuto(false)
                setPickupGeoWarn('')
                setDeliveryAddress('')
                setDeliveryDistrict('')
                setDeliveryDistrictAuto(false)
                setDeliveryGeoWarn('')
                setSameAddress(true)
              }
            }} />
            Указать другие адреса для заказа
          </label>
        </div>
        {customAddress && (
          <>
            <div className="form-group">
              <label>Адрес забора</label>
              <input
                value={pickupAddress}
                onChange={e => {
                  handlePickupAddressChange(e.target.value)
                  if (sameAddress) handleDeliveryAddressChange(e.target.value)
                }}
                placeholder="Введите улицу и дом..."
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                <input
                  value={pickupDistrict}
                  onChange={e => {
                    setPickupDistrict(e.target.value); setPickupDistrictAuto(false); setPickupGeoWarn('')
                    if (sameAddress) { setDeliveryDistrict(e.target.value); setDeliveryDistrictAuto(false); setDeliveryGeoWarn('') }
                  }}
                  placeholder="Район"
                  style={{ width: 180 }}
                />
                {pickupDistrictAuto && <span style={{ fontSize: '0.8em', color: '#27ae60' }}>определён автоматически</span>}
              </div>
              {pickupGeoWarn && <div style={{ fontSize: '0.85em', color: '#e67e22', marginTop: 2 }}>{pickupGeoWarn}</div>}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!sameAddress} onChange={e => {
                  const diff = e.target.checked
                  setSameAddress(!diff)
                  if (!diff) {
                    setDeliveryAddress(pickupAddress)
                    setDeliveryDistrict(pickupDistrict)
                    setDeliveryDistrictAuto(pickupDistrictAuto)
                    setDeliveryGeoWarn('')
                  }
                }} />
                Адреса забора и доставки отличаются
              </label>
            </div>
            {!sameAddress && (
              <div className="form-group">
                <label>Адрес доставки</label>
                <input
                  value={deliveryAddress}
                  onChange={e => handleDeliveryAddressChange(e.target.value)}
                  placeholder="Введите улицу и дом..."
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <input
                    value={deliveryDistrict}
                    onChange={e => { setDeliveryDistrict(e.target.value); setDeliveryDistrictAuto(false); setDeliveryGeoWarn('') }}
                    placeholder="Район"
                    style={{ width: 180 }}
                  />
                  {deliveryDistrictAuto && <span style={{ fontSize: '0.8em', color: '#27ae60' }}>определён автоматически</span>}
                </div>
                {deliveryGeoWarn && <div style={{ fontSize: '0.85em', color: '#e67e22', marginTop: 2 }}>{deliveryGeoWarn}</div>}
              </div>
            )}
          </>
        )}
        <div className="form-group">
          <label>Legacy ID</label>
          <input
            type="number"
            value={legacyId}
            onChange={e => setLegacyId(e.target.value)}
            placeholder="ID из старой системы (необязательно)"
          />
        </div>

        <div className="form-group">
          <label>Комментарий</label>
          <textarea
            rows={3}
            value={form.comment ?? ''}
            onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            placeholder="Необязательный комментарий"
          />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>(searchParams.get('status') as OrderStatus || '')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [orderIdSearch, setOrderIdSearch] = useState('')
  const [legacyIdSearch, setLegacyIdSearch] = useState('')
  const [clientPhoneSearch, setClientPhoneSearch] = useState('')
  const [clientNameSearch, setClientNameSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [sortBy, setSortBy] = useState('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const PAGE_SIZE = 20

  // Синхронизация фильтра статуса из URL при навигации
  useEffect(() => {
    const s = searchParams.get('status')
    if (s) setStatusFilter(s as OrderStatus)
  }, [searchParams])

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  const exportCSV = () => {
    const headers = ['Номер', 'Клиент', 'Статус', 'Сумма', 'Оплачен', 'Создан']
    const rows = orders.map(o => [
      o.id,
      o.client_name,
      STATUS_LABELS[o.status] || o.status,
      Number(o.total_amount).toFixed(2),
      o.paid ? 'Да' : 'Нет',
      new Date(o.created_at).toLocaleDateString('ru'),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await getOrders(
        statusFilter || undefined,
        page,
        PAGE_SIZE,
        dateFrom || undefined,
        dateTo || undefined,
        legacyIdSearch ? Number(legacyIdSearch) : undefined,
        paymentFilter || undefined,
        orderIdSearch ? Number(orderIdSearch) : undefined,
        clientPhoneSearch || undefined,
        clientNameSearch || undefined,
        sortBy,
        sortDir,
      )
      // Support both paginated and array responses
      if (Array.isArray(data)) {
        setOrders(data as unknown as Order[])
        setTotalElements(0)
        setHasMore((data as unknown as Order[]).length === PAGE_SIZE)
      } else {
        setOrders(data.content)
        setTotalElements(data.total_elements)
        setHasMore(data.content.length === PAGE_SIZE)
      }
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка загрузки заказов'
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter, paymentFilter, orderIdSearch, legacyIdSearch, clientPhoneSearch, clientNameSearch, dateFrom, dateTo, page, sortBy, sortDir])

  const handleCreated = (order: Order) => {
    setShowCreate(false)
    navigate(`/orders/${order.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Заказы</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={exportCSV}>Экспорт CSV</button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Новый заказ</button>
        </div>
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Статус</label>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as OrderStatus | ''); setPage(0) }}>
            <option value="">Все статусы</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Номер заказа</label>
          <input
            type="number"
            value={orderIdSearch}
            onChange={e => { setOrderIdSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по номеру"
            style={{ minWidth: 130 }}
          />
        </div>
        <div className="form-group">
          <label>Тип оплаты</label>
          <select value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(0) }}>
            <option value="">Все</option>
            <option value="CARD">Карта</option>
            <option value="CASH">Наличные</option>
            <option value="TRANSFER">Перевод</option>
          </select>
        </div>
        <div className="form-group">
          <label>Legacy ID</label>
          <input
            type="number"
            value={legacyIdSearch}
            onChange={e => { setLegacyIdSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по legacy ID"
            style={{ minWidth: 140 }}
          />
        </div>
        <div className="form-group">
          <label>Телефон клиента</label>
          <input
            value={clientPhoneSearch}
            onChange={e => { setClientPhoneSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по телефону"
            style={{ minWidth: 140 }}
          />
        </div>
        <div className="form-group">
          <label>Имя клиента</label>
          <input
            value={clientNameSearch}
            onChange={e => { setClientNameSearch(e.target.value); setPage(0) }}
            placeholder="Поиск по имени"
            style={{ minWidth: 140 }}
          />
        </div>
        <div className="form-group">
          <label>Дата с</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
        </div>
        <div className="form-group">
          <label>Дата по</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          {totalElements > 0 && (
            <div style={{ marginBottom: 8, color: '#666', fontSize: '0.9em' }}>
              Показано {orders.length} из {totalElements}
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th onClick={() => toggleSort('id')} style={{ cursor: 'pointer' }}>
                  # {sortBy === 'id' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleSort('client_name')} style={{ cursor: 'pointer' }}>
                  Клиент {sortBy === 'client_name' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>
                  Статус {sortBy === 'status' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleSort('total_amount')} style={{ cursor: 'pointer' }}>
                  Сумма {sortBy === 'total_amount' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th>Оплачен</th>
                <th>Гарантийный</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={6} className="empty">Заказы не найдены</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/orders/${o.id}`)}>
                  <td>{formatOrderNumber(o.id, o.created_at)}{o.legacy_id ? ` (${o.legacy_id})` : ''}</td>
                  <td>{o.client_name}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{Number(o.total_amount).toFixed(2)} &#8381;</td>
                  <td>{o.paid ? (PAYMENT_LABELS[o.payment_type ?? ''] ?? 'Да') : '—'}</td>
                  <td>{o.is_warranty ? 'Да' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(page > 0 || hasMore) && (
            <div className="pagination">
              <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>&#8592; Назад</button>
              <span>Стр. {page + 1}</span>
              <button className="btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Вперёд &#8594;</button>
            </div>
          )}
        </>
      )}

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  )
}
