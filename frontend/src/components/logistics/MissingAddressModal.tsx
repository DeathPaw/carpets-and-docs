import { useState } from 'react'
import AddressInput, { type AddressResolved } from '../AddressInput'
import DistrictSelect from '../DistrictSelect'
import { updateOrderDetails } from '../../api/orders'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import { formatOrderNumber } from '../../utils/format'
import type { Order } from '../../types'

/**
 * Ввод недостающего адреса сразу после назначения заказа на слот.
 *
 * Заказ без адреса нельзя развезти: водитель получит точку без адреса, и на
 * карте её тоже не будет. Раньше это всплывало только в день развозки. Теперь
 * окно поднимается в момент постановки в слот — его можно закрыть и вернуться
 * позже, но проблема уже перед глазами.
 */
export default function MissingAddressModal({ order, type, onClose, onSaved }: {
  order: Order
  /** Какой адрес заполняем: забора или доставки. */
  type: 'pickup' | 'delivery'
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const isPickup = type === 'pickup'
  const [address, setAddress] = useState('')
  const [apartment, setApartment] = useState(
    (isPickup ? order.pickup_apartment : order.delivery_apartment) || ''
  )
  const [district, setDistrict] = useState(
    (isPickup ? order.pickup_district : order.delivery_district) || ''
  )
  const [coords, setCoords] = useState<{ lat: number | null; lon: number | null }>({ lat: null, lon: null })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEscapeClose(true, onClose)

  const onResolved = (r: AddressResolved) => {
    setAddress(r.address)
    if (r.district) setDistrict(r.district)
    setCoords({ lat: r.lat, lon: r.lon })
  }

  const submit = async () => {
    if (!address.trim()) { setError('Укажите адрес'); return }
    setSaving(true)
    setError('')
    try {
      // Шлём только адресную часть выбранного направления — остальные поля
      // заказа тянем как есть, чтобы ничего не затереть.
      await updateOrderDetails(order.id, {
        pickup_address: isPickup ? address.trim() : (order.pickup_address ?? null),
        delivery_address: isPickup ? (order.delivery_address ?? null) : address.trim(),
        pickup_apartment: isPickup ? (apartment || null) : (order.pickup_apartment ?? null),
        delivery_apartment: isPickup ? (order.delivery_apartment ?? null) : (apartment || null),
        legacy_id: order.legacy_id ?? null,
        pickup_date: order.pickup_date ?? null,
        pickup_time_slot: order.pickup_time_slot ?? null,
        delivery_date: order.delivery_date ?? null,
        delivery_time_slot: order.delivery_time_slot ?? null,
        pickup_district: isPickup ? (district || null) : (order.pickup_district ?? null),
        delivery_district: isPickup ? (order.delivery_district ?? null) : (district || null),
        pickup_lat: isPickup ? coords.lat : (order.pickup_lat ?? null),
        pickup_lon: isPickup ? coords.lon : (order.pickup_lon ?? null),
        delivery_lat: isPickup ? (order.delivery_lat ?? null) : coords.lat,
        delivery_lon: isPickup ? (order.delivery_lon ?? null) : coords.lon,
      } as never)
      await onSaved()
      onClose()
    } catch (e: unknown) {
      setError((e as any)?.response?.data?.message || 'Не удалось сохранить адрес')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>
          Не указан адрес {isPickup ? 'забора' : 'доставки'}
        </h2>
        <p style={{ color: '#666', marginTop: 0, fontSize: '0.92em' }}>
          Заказ {formatOrderNumber(order.id, order.created_at)} — {order.client_name}.
          Заказ поставлен в слот, но развозить его некуда: без адреса он не попадёт
          ни в маршрутный лист, ни на карту.
        </p>

        <div className="form-group">
          <label>Адрес {isPickup ? 'забора' : 'доставки'} *</label>
          <AddressInput
            value={address}
            onChange={v => { setAddress(v); setCoords({ lat: null, lon: null }) }}
            onResolved={onResolved}
            placeholder="Начните вводить адрес…"
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Район</label>
            <DistrictSelect value={district} onChange={setDistrict} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Кв./офис</label>
            <input value={apartment} onChange={e => setApartment(e.target.value)} placeholder="—" />
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Позже</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить адрес'}
          </button>
        </div>
      </div>
    </div>
  )
}
