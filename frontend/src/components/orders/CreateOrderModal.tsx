import { useState } from 'react'
import { createOrder, updateOrderDetails } from '../../api/orders'
import { searchClients, createClient, getClientModifiers } from '../../api/clients'
import DistrictSelect from '../DistrictSelect'
import AddressInput, { type AddressResolved } from '../AddressInput'
import { formatPhone } from '../PhoneInput'
import ClientFormFields, {
  type ClientFormState, emptyClientForm, validateClientForm,
} from '../ClientFormFields'
import type { Order, CreateOrderRequest, Client, PriceModifier } from '../../types'

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
  // V19 (#4, #9): квартира — отдельное поле, в адрес не ввести (мешает геокодированию).
  const [pickupApartment, setPickupApartment] = useState('')
  const [deliveryApartment, setDeliveryApartment] = useState('')
  const [pickupDistrict, setPickupDistrict] = useState('')
  const [deliveryDistrict, setDeliveryDistrict] = useState('')
  const [pickupCoords, setPickupCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null })
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null })
  const [legacyId, setLegacyId] = useState('')
  // V5: при импорте из старой системы (legacyId задан) можно указать дату прошлой.
  const [legacyCreatedAt, setLegacyCreatedAt] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const doClientSearch = (q: string) => {
    setClientSearch(q)
    setSelectedClientId(null)
    setSelectedClientName('')
    setSelectedClient(null)
    setSelectedClientMods([])
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

  // Исходный адрес из карточки выбранного клиента — нужен, чтобы показывать
  // подсказку «адрес клиента / изменён вручную» под полем. Сравниваем с тем,
  // что сейчас в поле адреса; равно — значит оператор ничего не правил.
  const [clientSourceAddress, setClientSourceAddress] = useState<string>('')
  // Флаги/модификаторы выбранного клиента — оператор должен сразу видеть,
  // что клиент проблемный или что у него привязана скидка/наценка.
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedClientMods, setSelectedClientMods] = useState<PriceModifier[]>([])

  const selectClient = (c: Client) => {
    setSelectedClientId(c.id)
    setSelectedClientName(c.name)
    setSelectedClient(c)
    setClientSearch(c.name)
    setClients([])
    // Модификаторы клиента подгружаем сразу, чтобы отрисовать плашки под полем поиска.
    getClientModifiers(c.id).then(setSelectedClientMods).catch(() => setSelectedClientMods([]))
    // Старый сценарий открывал модалку «Использовать адрес клиента?» — это лишний клик
    // (Миша на встрече: «вот этот поп-ап точно лишний клик, у тебя адрес уже есть»).
    // Теперь сразу подставляем адрес в поля забора и доставки, включая координаты и район.
    // Оператор видит подсказку «адрес клиента» и при желании правит прямо в поле.
    if (c.address && c.address.trim()) {
      setCustomAddress(true)
      setSameAddress(true)
      setPickupAddress(c.address)
      setDeliveryAddress(c.address)
      setClientSourceAddress(c.address)
      if (c.district) {
        setPickupDistrict(c.district)
        setDeliveryDistrict(c.district)
      }
      if (c.lat != null && c.lon != null) {
        setPickupCoords({ lat: Number(c.lat), lon: Number(c.lon) })
        setDeliveryCoords({ lat: Number(c.lat), lon: Number(c.lon) })
      }
      // V19 (#7, #9): квартира из карточки клиента тянется в оба адреса заказа.
      if (c.apartment) {
        setPickupApartment(c.apartment)
        setDeliveryApartment(c.apartment)
      }
    } else {
      setClientSourceAddress('')
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

  /** «адрес клиента» если поле не редактировалось, «изменён» если оператор что-то поправил. */
  const addressBadge = (current: string): { text: string; color: string } | null => {
    if (!clientSourceAddress) return null
    if (current.trim() === clientSourceAddress.trim()) {
      return { text: 'адрес клиента', color: '#27ae60' }
    }
    return { text: 'изменён вручную', color: '#e67e22' }
  }

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
            apartment: newClientForm.apartment.trim() || undefined,
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
        // V19 (#7, #9): квартира из новой карточки клиента — в забор/доставку заказа.
        if (newClient.apartment && !pickupApartment) setPickupApartment(newClient.apartment)
        if (newClient.apartment && !deliveryApartment) setDeliveryApartment(newClient.apartment)
      } else {
        if (!selectedClientId) {
          setError('Введите имя клиента и выберите из списка')
          setLoading(false)
          return
        }
        clientName = selectedClientName
      }

      // Адреса: если customAddress — берём из полей, иначе из адреса клиента.
      // ⚠ Раньше искали через clients.find, но после selectClient массив clients
      // очищается (закрываем dropdown), и find возвращал undefined. Используем
      // state selectedClient — он выставляется в selectClient и живёт до сброса.
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
        // V5: дата создания «задним числом» — только при импорте (legacy_id задан).
        created_at: (legacyId && legacyCreatedAt) ? `${legacyCreatedAt}T12:00:00` : null,
      }

      const order = await createOrder(orderData)
      // Установить районы, координаты и квартиры через updateDetails.
      // V19 (#9): квартиру всегда сохраняем (даже если районы/координаты пустые).
      const hasAnyDetail = finalPickupDistrict || finalDeliveryDistrict
        || finalPickupLat != null || finalDeliveryLat != null
        || pickupApartment || deliveryApartment
      if (hasAnyDetail) {
        await updateOrderDetails(order.id, {
          pickup_address: finalPickupAddress || null,
          delivery_address: finalDeliveryAddress || null,
          pickup_apartment: pickupApartment || null,
          delivery_apartment: sameAddress ? (pickupApartment || null) : (deliveryApartment || null),
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
          // tabIndex=-1: крестик закрытия не нужен в табовой навигации,
          // оператор использует Esc или кнопку «Отмена» внизу формы.
          tabIndex={-1}
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
              {selectedClientId && selectedClient?.is_problem && (
                <div style={{
                  marginTop: 8, padding: '8px 10px', background: '#fdecea',
                  border: '1px solid #e74c3c', borderRadius: 4, fontSize: '0.88em', color: '#922b21',
                }}>
                  ⚠ Проблемный клиент
                </div>
              )}
              {selectedClientId && selectedClientMods.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedClientMods.map(m => {
                    const isDiscount = Number(m.percent) < 0
                    return (
                      <span key={m.id} style={{
                        padding: '3px 8px', borderRadius: 12, fontSize: '0.82em',
                        background: isDiscount ? '#eafaf1' : '#fef5e7',
                        color: isDiscount ? '#186a3b' : '#7d6608',
                        border: `1px solid ${isDiscount ? '#a9dfbf' : '#f9e79f'}`,
                      }}>
                        {m.name} {Number(m.percent) > 0 ? '+' : ''}{m.percent}%
                      </span>
                    )
                  })}
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
              {/* Плашка-подсказка: оператор видит, откуда взялся адрес — из карточки
                  клиента или он его уже отредактировал. Заменила поп-ап
                  «Использовать адрес клиента?». */}
              {(() => {
                const b = addressBadge(pickupAddress)
                return b ? (
                  <div style={{ fontSize: '0.8em', color: b.color, marginTop: 2 }}>
                    {b.text}
                  </div>
                ) : null
              })()}
              <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <DistrictSelect
                  value={pickupDistrict}
                  onChange={v => {
                    setPickupDistrict(v)
                    if (sameAddress) { setDeliveryDistrict(v) }
                  }}
                  width={220}
                />
                {/* V19 (#4, #9): отдельное поле «Квартира/офис» — не идёт в геокодирование. */}
                <div className="form-group" style={{ marginBottom: 0, flex: '0 0 130px' }}>
                  <label style={{ fontSize: '0.85em' }}>Кв./офис</label>
                  <input
                    value={pickupApartment}
                    onChange={e => {
                      setPickupApartment(e.target.value)
                      if (sameAddress) setDeliveryApartment(e.target.value)
                    }}
                    placeholder="25"
                  />
                </div>
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
                {(() => {
                  const b = addressBadge(deliveryAddress)
                  return b ? (
                    <div style={{ fontSize: '0.8em', color: b.color, marginTop: 2 }}>
                      {b.text}
                    </div>
                  ) : null
                })()}
                <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <DistrictSelect
                    value={deliveryDistrict}
                    onChange={v => { setDeliveryDistrict(v) }}
                    width={220}
                  />
                  <div className="form-group" style={{ marginBottom: 0, flex: '0 0 130px' }}>
                    <label style={{ fontSize: '0.85em' }}>Кв./офис</label>
                    <input
                      value={deliveryApartment}
                      onChange={e => setDeliveryApartment(e.target.value)}
                      placeholder="25"
                    />
                  </div>
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
          {/* V5: только при импорте показываем поле «дата создания» — оператор
              переносит исторический заказ с реальной датой. */}
          {legacyId && (
            <div style={{ marginTop: 6, padding: '6px 10px', background: '#fff8e1', borderRadius: 4 }}>
              <label style={{ fontSize: '0.9em', color: '#7c5e00', marginBottom: 4, display: 'block' }}>
                Дата создания (из старой системы):
              </label>
              <input
                type="date"
                value={legacyCreatedAt}
                onChange={e => setLegacyCreatedAt(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
              <div style={{ fontSize: '0.75em', color: '#888', marginTop: 4 }}>
                Если пусто — заказ создастся текущей датой.
              </div>
            </div>
          )}
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
