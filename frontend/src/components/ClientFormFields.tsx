import { useState } from 'react'
import PhoneInput, { isValidPhone } from './PhoneInput'
import AddressInput, { type AddressResolved } from './AddressInput'
import DistrictSelect from './DistrictSelect'
import { isValidInn } from '../utils/inn'
import { CLIENT_SOURCE_LABELS, RESTART_STATUS_LABELS, GENDER_LABELS } from '../constants/statuses'

/**
 * Состояние формы клиента — общая структура для модалки в ClientsPage и
 * inline-формы в OrdersPage. Раньше эти две формы дублировались — те же поля,
 * та же валидация, но разные имена state-переменных.
 *
 * Координаты (`lat`/`lon`) хранятся прямо в форме и сбрасываются в null,
 * если оператор отредактировал адрес руками без выбора подсказки DaData.
 */
export interface ClientFormState {
  client_type: 'INDIVIDUAL' | 'LEGAL_ENTITY'
  first_name: string
  last_name: string
  /** Для физлица — собирается из first_name + last_name перед отправкой; для юрлица — название организации. */
  name: string
  phone: string
  extra_phone: string
  contact_person: string
  contact_person_phone: string
  inn: string
  address: string
  /** V19 (#4, #9): квартира — отдельно от адреса. */
  apartment: string
  district: string
  comment: string
  lat: number | null
  lon: number | null
  /**
   * V46 (правка №3 от 13.09): маркетинг. Статус относительно перезапуска
   * заполняется один раз, источник — при заведении клиента; у существующего
   * клиента ранее выбранное значение подставляется само.
   */
  restart_status: string
  source: string
  /** Обязательное уточнение для источника «Другой». */
  source_note: string
  /**
   * V47 (правка №1 от 13.09): пол и возраст — для портрета базы. Пустой пол
   * при создании клиента бэкенд предположит по отчеству.
   */
  gender: string
  age: string
}

export const emptyClientForm = (): ClientFormState => ({
  client_type: 'INDIVIDUAL',
  first_name: '',
  last_name: '',
  name: '',
  phone: '',
  extra_phone: '',
  contact_person: '',
  contact_person_phone: '',
  inn: '',
  address: '',
  apartment: '',
  district: '',
  comment: '',
  lat: null,
  lon: null,
  restart_status: '',
  source: '',
  source_note: '',
  gender: '',
  age: '',
})

/**
 * Валидация формы. Возвращает текст ошибки или null, если всё ок.
 * Вызывается из родителя перед submit'ом — сама форма ничего не отправляет.
 */
export function validateClientForm(v: ClientFormState): string | null {
  // Правка №3 (13.09): «Другой источник» без расшифровки бесполезен для аналитики.
  if (v.source === 'OTHER' && !v.source_note.trim()) {
    return 'Для источника «Другой» укажите уточнение'
  }
  if (v.client_type === 'INDIVIDUAL') {
    if (!v.first_name.trim() && !v.name.trim()) return 'Имя клиента обязательно'
    if (!isValidPhone(v.phone)) return 'Укажите корректный телефон клиента в формате +7 (XXX) XXX-XX-XX'
  } else {
    if (!v.name.trim()) return 'Название организации обязательно'
    if (!isValidPhone(v.contact_person_phone)) return 'Укажите корректный телефон контактного лица'
    if (v.inn.trim() && !isValidInn(v.inn)) return 'ИНН некорректен (контрольная сумма не сходится)'
  }
  if (v.extra_phone.trim() && !isValidPhone(v.extra_phone)) {
    return 'Дополнительный телефон указан в неверном формате'
  }
  return null
}

interface Props {
  value: ClientFormState
  onChange: (v: ClientFormState) => void
  /**
   * Слот под полем «Телефон» — например, для баннера найденных дублей.
   * Используется в OrdersPage; в ClientsPage не нужен.
   */
  phoneExtra?: React.ReactNode
  /** Колбэк когда телефон стал валидным — для триггера поиска дублей. */
  onPhoneValid?: (phone: string) => void
}

/**
 * Универсальная форма клиента. Только поля; родитель оборачивает в модалку/секцию,
 * валидирует через {@link validateClientForm} и сам делает submit.
 */
export default function ClientFormFields({ value, onChange, phoneExtra, onPhoneValid }: Props) {
  const v = value
  const set = (patch: Partial<ClientFormState>) => onChange({ ...v, ...patch })

  // Опциональные поля (доп. телефон / ИНН) скрыты по умолчанию, разворачиваются чекбоксом.
  // Открыты сразу, если значение уже есть (режим редактирования).
  const [showExtraPhone, setShowExtraPhone] = useState(!!v.extra_phone)
  const [showInn, setShowInn] = useState(!!v.inn)

  const onAddressResolved = (r: AddressResolved) => {
    set({
      address: r.address,
      district: r.district || v.district,
      lat: r.lat,
      lon: r.lon,
    })
  }

  const onAddressManualChange = (val: string) => {
    // Координаты валидны только пока адрес совпадает с тем, для которого их получили.
    // Любой ручной ввод их сбрасывает — иначе на карте будет неверная точка.
    set({ address: val, lat: null, lon: null })
  }

  return (
    <>
      <div className="form-group">
        <label>Тип клиента</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={v.client_type === 'INDIVIDUAL' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => set({ client_type: 'INDIVIDUAL' })}
          >Физ. лицо</button>
          <button
            type="button"
            className={v.client_type === 'LEGAL_ENTITY' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
            onClick={() => set({ client_type: 'LEGAL_ENTITY' })}
          >Юр. лицо</button>
        </div>
      </div>

      {v.client_type === 'INDIVIDUAL' ? (
        <>
          <div className="form-group">
            <label>Фамилия</label>
            <input value={v.last_name} onChange={e => set({ last_name: e.target.value })} placeholder="Фамилия" />
          </div>
          <div className="form-group">
            <label>Имя *</label>
            <input value={v.first_name} onChange={e => set({ first_name: e.target.value })} placeholder="Имя" />
          </div>
          <div className="form-group">
            <label>Телефон *</label>
            <PhoneInput
              value={v.phone}
              onChange={p => {
                set({ phone: p })
                if (onPhoneValid && isValidPhone(p)) onPhoneValid(p)
              }}
              showValidation
              required
            />
            {phoneExtra}
          </div>
        </>
      ) : (
        <>
          <div className="form-group">
            <label>Название организации *</label>
            <input value={v.name} onChange={e => set({ name: e.target.value })} placeholder="Название организации" />
          </div>
          <div className="form-group">
            <label>Контактное лицо</label>
            <input value={v.contact_person} onChange={e => set({ contact_person: e.target.value })} placeholder="ФИО контактного лица" />
          </div>
          <div className="form-group">
            <label>Телефон контактного лица *</label>
            <PhoneInput
              value={v.contact_person_phone}
              onChange={p => set({ contact_person_phone: p })}
              showValidation
              required
            />
          </div>
          <div className="form-group">
            <label>Телефон организации</label>
            <PhoneInput value={v.phone} onChange={p => set({ phone: p })} showValidation />
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
                value={v.inn}
                onChange={e => set({ inn: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                placeholder="10 или 12 цифр"
                maxLength={12}
                style={v.inn && !isValidInn(v.inn) ? { borderColor: '#e67e22' } : undefined}
              />
              {v.inn && !isValidInn(v.inn) && (
                <div style={{ color: '#e67e22', fontSize: 'var(--font-sm)', marginTop: 2 }}>
                  Контрольная сумма ИНН не сходится
                </div>
              )}
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
          <PhoneInput value={v.extra_phone} onChange={p => set({ extra_phone: p })} showValidation />
        </div>
      )}

      <div className="form-group">
        <label>Адрес</label>
        <AddressInput
          value={v.address}
          onChange={onAddressManualChange}
          onResolved={onAddressResolved}
          externallyConfirmed={v.lat != null && v.lon != null}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label>Район</label>
          <DistrictSelect value={v.district} onChange={d => set({ district: d })} width="100%" />
        </div>
        {/* V19 (#4): квартира — в адрес не вводим, оператор ломает поиск. */}
        <div className="form-group" style={{ flex: '0 0 130px' }}>
          <label>Кв./офис</label>
          <input
            value={v.apartment}
            onChange={e => set({ apartment: e.target.value })}
            placeholder="25"
          />
        </div>
      </div>
      <div className="form-group">
        <label>Комментарий</label>
        <textarea
          rows={2}
          value={v.comment}
          onChange={e => set({ comment: e.target.value })}
          placeholder="Комментарий"
        />
      </div>
      {/* Правка №3 (13.09): маркетинг. Откуда клиент пришёл и был ли он
          клиентом «Возрождения» до перезапуска — CRM этого не знает, историю
          заказов до перезапуска она не видела. Автоматику «новый/повторный»
          эти поля не заменяют, они рядом. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '1 1 240px' }}>
          <label>Источник обращения</label>
          <select value={v.source} onChange={e => set({ source: e.target.value })}>
            <option value="">— не указан —</option>
            {Object.entries(CLIENT_SOURCE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: '1 1 240px' }}>
          <label>Статус относительно перезапуска</label>
          <select value={v.restart_status} onChange={e => set({ restart_status: e.target.value })}>
            <option value="">— не указан —</option>
            {Object.entries(RESTART_STATUS_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      {v.source === 'OTHER' && (
        <div className="form-group">
          <label>Уточнение источника *</label>
          <input
            value={v.source_note}
            onChange={e => set({ source_note: e.target.value })}
            placeholder="Откуда именно узнал о нас"
          />
        </div>
      )}
      {/* Правка №1 (13.09): пол и возраст — только для портрета базы, оба
          необязательные. Пол у нового клиента подставляется по отчеству
          («…вна» / «…вич»), здесь его видно и можно поправить. */}
      {v.client_type === 'INDIVIDUAL' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 180px' }}>
            <label>Пол</label>
            <select value={v.gender} onChange={e => set({ gender: e.target.value })}>
              <option value="">— определим по имени —</option>
              {Object.entries(GENDER_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '0 0 120px' }}>
            <label>Возраст</label>
            <input
              type="number" min="1" max="119"
              value={v.age}
              onChange={e => set({ age: e.target.value })}
              placeholder="—"
            />
          </div>
        </div>
      )}
    </>
  )
}
