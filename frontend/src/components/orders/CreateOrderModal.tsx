import { useState } from 'react'
import { createOrder, updateOrderDetails } from '../../api/orders'
import { searchClients, createClient } from '../../api/clients'
import DistrictSelect from '../DistrictSelect'
import AddressInput, { type AddressResolved } from '../AddressInput'
import { formatPhone } from '../PhoneInput'
import ClientFormFields, {
  type ClientFormState, emptyClientForm, validateClientForm,
} from '../ClientFormFields'
import type { Order, CreateOrderRequest, Client } from '../../types'

/**
 * Модалка создания заказа. Раньше жила прямо в OrdersPage.tsx и занимала ~450 строк
 * из его 1100. Вынесена отдельно — OrdersPage стало проще читать, тестировать
 * и менять модалку независимо.
 */
export default function CreateOrderModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (o: Order) => void
}) {
  const [form, setForm] = useState<CreateOrderRequest>({ client_name: '', comment: '' })
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  // Состояние формы нового клиента — общая структура из ClientFormFields.
  const [newClientForm, setNewClientForm] = useState<ClientFormState>(emptyClientForm())
  const [customAddress, setCustomAddress] = useState(false)
  const [sameAddress, setSameAddress] = useState(true)
  const [pickupAddress, setPickupAddress] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [pickupDistrict, setPickupDistrict] = useState('')
  const [deliveryDistrict, setDeliveryDistrict] = useState('')
  const [pickupCoords, setPickupCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null })
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null })
  const [legacyId, setLegacyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

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

  // Диалог: «У клиента уже есть адрес — использовать его?». Срабатывает когда выбрали клиента
  // с заполненным address. Если оператор подтверждает — заполняем pickup/delivery и координаты,
  // включаем customAddress, чтобы поля показались. Если «нет» — оставляем поля пустыми.
  const [pendingClientAddress, setPendingClientAddress] = useState<Client | null>(null)

  const selectClient = (c: Client) => {
    setSelectedClientId(c.id)
    setSelectedClientName(c.name)
    setClientSearch(c.name)
    setClients([])
    if (c.address && c.address.trim()) {
      setPendingClientAddress(c)
    }
  }

  // Дедуп по телефону: при создании нового клиента ищем существующих с таким же телефоном.
  const [phoneDuplicates, setPhoneDuplicates] = useState<Client[]>([])

  const checkPhoneDuplicates = async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '')
    if (digits.length < 7) { setPhoneDuplicates([]); return }
    try {
      const found = await searchClients(digits.slice(-10))
      setPhoneDuplicates(found.slice(0, 5))
    } catch { setPhoneDuplicates([]) }
  }

  const acceptClientAddress = () => {
    if (!pendingClientAddress) return
    const c = pendingClientAddress
    setCustomAddress(true)
    setSameAddress(true)
    setPickupAddress(c.address || '')
    setDeliveryAddress(c.address || '')
    if (c.district) {
      setPickupDistrict(c.district)
      setDeliveryDistrict(c.district)
    }
    if (c.lat != null && c.lon != null) {
      setPickupCoords({ lat: Number(c.lat), lon: Number(c.lon) })
      setDeliveryCoords({ lat: Number(c.lat), lon: Number(c.lon) })
    }
    setPendingClientAddress(null)
  }

  const declineClientAddress = () => setPendingClientAddress(null)

  const submit = async () => {
    setLoading(true)
    try {
      let clientId = selectedClientId
      let clientName = ''

      if (showNewClient) {
        const validationError = validateClientForm(newClientForm)
        if (validationError) {
          setError(validationError)
          setLoading(false)
          return
        }

        const resolvedName = newClientForm.client_type === 'INDIVIDUAL'
          ? `${newClientForm.last_name} ${newClientForm.first_name}`.trim() || newClientForm.name.trim()
          : newClientForm.name.trim()

        let newClient: Client
        try {
          newClient = await createClient({
            client_type: newClientForm.client_type,
            name: resolvedName,
            first_name: newClientForm.first_name.trim() || undefined,
            last_name: newClientForm.last_name.trim() || undefined,
            phone: newClientForm.phone.trim() ? formatPhone(newClientForm.phone) : undefined,
            extra_phone: newClientForm.extra_phone.trim() ? formatPhone(newClientForm.extra_phone) : undefined,
            address: newClientForm.address.trim() || undefined,
            district: newClientForm.district.trim() || undefined,
            inn: newClientForm.inn.trim() || undefined,
            contact_person: newClientForm.contact_person.trim() || undefined,
            contact_person_phone: newClientForm.contact_person_phone.trim() ? formatPhone(newClientForm.contact_person_phone) : undefined,
            comment: newClientForm.comment.trim() || undefined,
            lat: newClientForm.lat,
            lon: newClientForm.lon,
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
      const selectedClient = clients.find(c => c.id === clientId)
      const clientAddr = showNewClient ? newClientForm.address.trim() : (selectedClient?.address || '')
      const clientDist = showNewClient ? newClientForm.district.trim() : (selectedClient?.district || '')
      const clientLat = showNewClient ? newClientForm.lat : (selectedClient?.lat ?? null)
      const clientLon = showNewClient ? newClientForm.lon : (selectedClient?.lon ?? null)

      const finalPickupAddress = customAddress ? pickupAddress.trim() : clientAddr
      const finalPickupDistrict = customAddress ? pickupDistrict.trim() : clientDist
      const finalDeliveryAddress = customAddress ? (sameAddress ? pickupAddress.trim() : deliveryAddress.trim()) : clientAddr
      const finalDeliveryDistrict = customAddress ? (sameAddress ? pickupDistrict.trim() : deliveryDistrict.trim()) : clientDist
      const finalPickupLat = customAddress ? pickupCoords.lat : clientLat
      const finalPickupLon = customAddress ? pickupCoords.lon : clientLon
      const finalDeliveryLat = customAddress ? (sameAddress ? pickupCoords.lat : deliveryCoords.lat) : clientLat
      const finalDeliveryLon = customAddress ? (sameAddress ? pickupCoords.lon : deliveryCoords.lon) : clientLon

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
      // Установить районы и координаты через updateDetails
      if (finalPickupDistrict || finalDeliveryDistrict || finalPickupLat != null || finalDeliveryLat != null) {
        await updateOrderDetails(order.id, {
          pickup_address: finalPickupAddress || null,
          delivery_address: finalDeliveryAddress || null,
          pickup_district: finalPickupDistrict || null,
          delivery_district: finalDeliveryDistrict || finalPickupDistrict || null,
          pickup_lat: finalPickupLat,
          pickup_lon: finalPickupLon,
          delivery_lat: finalDeliveryLat ?? finalPickupLat,
          delivery_lon: finalDeliveryLon ?? finalPickupLon,
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
              <ClientFormFields
                value={newClientForm}
                onChange={setNewClientForm}
                onPhoneValid={p => void checkPhoneDuplicates(p)}
                phoneExtra={phoneDuplicates.length > 0 && (
                  <div style={{
                    marginTop: 6, padding: 8, background: '#fef9e7', border: '1px solid #f1c40f',
                    borderRadius: 4, fontSize: '0.85em',
                  }}>
                    <div style={{ marginBottom: 4, color: '#7d6608' }}>
                      Найдены клиенты с похожим номером — может это они?
                    </div>
                    {phoneDuplicates.map(c => (
                      <div
                        key={c.id}
                        onClick={() => { selectClient(c); setShowNewClient(false); setPhoneDuplicates([]) }}
                        style={{ padding: '3px 6px', cursor: 'pointer', borderRadius: 3 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fcf3cf'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <strong>{c.name}</strong> · {c.phone || c.contact_person_phone || '—'}
                      </div>
                    ))}
                    <div style={{ marginTop: 4, color: '#7d6608', fontSize: '0.92em' }}>
                      Или продолжите создание нового клиента ниже.
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={customAddress} onChange={e => {
              setCustomAddress(e.target.checked)
              if (!e.target.checked) {
                setPickupAddress('')
                setPickupDistrict('')
                setDeliveryAddress('')
                setDeliveryDistrict('')
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
              <AddressInput
                value={pickupAddress}
                onChange={v => {
                  setPickupAddress(v)
                  // При ручном изменении адреса координаты устаревают — обнуляем,
                  // чтобы на карте не висели «фантомные» точки.
                  setPickupCoords({ lat: null, lon: null })
                  if (sameAddress) {
                    setDeliveryAddress(v)
                    setDeliveryCoords({ lat: null, lon: null })
                  }
                }}
                onResolved={(r: AddressResolved) => {
                  setPickupAddress(r.address)
                  if (r.district) { setPickupDistrict(r.district) }
                  setPickupCoords({ lat: r.lat, lon: r.lon })
                  if (sameAddress) {
                    setDeliveryAddress(r.address)
                    if (r.district) { setDeliveryDistrict(r.district) }
                    setDeliveryCoords({ lat: r.lat, lon: r.lon })
                  }
                }}
                // Если адрес уже подставлен из карточки клиента (с координатами) —
                // считаем подтверждённым, не плодим лишнее предупреждение.
                externallyConfirmed={pickupCoords.lat != null && pickupCoords.lon != null}
              />
              <div style={{ marginTop: 4 }}>
                <DistrictSelect
                  value={pickupDistrict}
                  onChange={v => {
                    setPickupDistrict(v)
                    if (sameAddress) { setDeliveryDistrict(v) }
                  }}
                  width={220}
                />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!sameAddress} onChange={e => {
                  const diff = e.target.checked
                  setSameAddress(!diff)
                  if (!diff) {
                    setDeliveryAddress(pickupAddress)
                    setDeliveryDistrict(pickupDistrict)
                  }
                }} />
                Адреса забора и доставки отличаются
              </label>
            </div>
            {!sameAddress && (
              <div className="form-group">
                <label>Адрес доставки</label>
                <AddressInput
                  value={deliveryAddress}
                  onChange={v => {
                    setDeliveryAddress(v)
                    setDeliveryCoords({ lat: null, lon: null })
                  }}
                  onResolved={(r: AddressResolved) => {
                    setDeliveryAddress(r.address)
                    if (r.district) { setDeliveryDistrict(r.district) }
                    setDeliveryCoords({ lat: r.lat, lon: r.lon })
                  }}
                  externallyConfirmed={deliveryCoords.lat != null && deliveryCoords.lon != null}
                />
                <div style={{ marginTop: 4 }}>
                  <DistrictSelect
                    value={deliveryDistrict}
                    onChange={v => { setDeliveryDistrict(v) }}
                    width={220}
                  />
                </div>
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

      {/* Подтверждение: использовать адрес клиента для заказа? */}
      {pendingClientAddress && (
        <div className="modal-overlay" onClick={declineClientAddress} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ marginTop: 0 }}>Адрес клиента</h3>
            <p style={{ color: '#555' }}>
              У клиента <strong>{pendingClientAddress.name}</strong> уже есть адрес:
            </p>
            <div style={{
              padding: '8px 12px', background: '#f4f6f7', borderRadius: 4, marginBottom: 12,
            }}>
              {pendingClientAddress.address}
              {pendingClientAddress.district && <span style={{ color: '#888' }}> · {pendingClientAddress.district}</span>}
            </div>
            <p style={{ color: '#555' }}>Использовать его как адрес забора и доставки?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary" onClick={declineClientAddress}>Нет, ввести другой</button>
              <button className="btn-primary" onClick={acceptClientAddress}>Да, использовать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
