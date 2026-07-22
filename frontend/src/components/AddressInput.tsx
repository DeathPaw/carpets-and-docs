import { useEffect, useRef, useState } from 'react'
import { detectDistrictByCoords } from '../api/districts-by-coords'

/**
 * Структура подсказки от DaData (только нужные поля).
 * Полный ответ: https://dadata.ru/api/suggest/address/
 */
interface DadataSuggestion {
  value: string         // полный отображаемый адрес
  unrestricted_value: string
  data: {
    geo_lat: string | null
    geo_lon: string | null
    city_district: string | null            // административный район Москвы
    city_district_with_type: string | null
    city: string | null
    settlement: string | null
    settlement_with_type: string | null
    region: string | null
    region_with_type: string | null
    street_with_type: string | null
    house: string | null
    flat: string | null
    qc_geo: string | null  // 0=точные координаты, 1=улица, 2=город...
    fias_level: string | null
    // Для СПб район можно достать из city_district / city_district_with_type
    // или, если центральных нет — fall back на settlement
  }
}

export interface AddressResolved {
  address: string
  district: string | null
  lat: number | null
  lon: number | null
  /** true если DaData нашла точные координаты дома (qc_geo === '0'). */
  precise: boolean
}

interface Props {
  value: string
  onChange: (address: string) => void
  /** Вызывается когда пользователь выбрал подсказку. */
  onResolved?: (resolved: AddressResolved) => void
  placeholder?: string
  /**
   * Ограничение по городу (DaData принимает массив локаций).
   * По умолчанию — Санкт-Петербург. Передайте null чтобы убрать ограничение.
   */
  cityFilter?: string | null
  disabled?: boolean
  /**
   * Внешнее подтверждение адреса (например, адрес взят из карточки клиента,
   * у которой уже сохранены координаты — тогда DaData-валидация не нужна).
   * При {@code true} бейдж «адрес не подтверждён» не показывается, пока пользователь
   * не начал редактировать поле руками.
   */
  externallyConfirmed?: boolean
}

const DADATA_TOKEN: string | undefined = import.meta.env.VITE_DADATA_TOKEN
const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address'

/**
 * Поле ввода адреса с подсказками DaData.
 * - Если ключ DADATA_TOKEN не задан — работает как обычный текстовый input,
 *   а пользователь видит ненавязчивое уведомление в подсказке.
 * - При выборе подсказки в onResolved уходят: адрес, район, координаты.
 */
export default function AddressInput({
  value, onChange, onResolved, placeholder = 'Введите адрес...',
  cityFilter = 'Санкт-Петербург', disabled, externallyConfirmed,
}: Props) {
  const [suggestions, setSuggestions] = useState<DadataSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)
  // Адрес считается «подтверждённым», когда пользователь выбрал подсказку DaData
  // (есть координаты). При ручном изменении сбрасывается — нужно для бейджа «не подтверждён».
  const [isResolved, setIsResolved] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQuery = useRef('')

  const fetchSuggestions = async (query: string) => {
    if (!DADATA_TOKEN) return
    if (!query || query.trim().length < 3) {
      setSuggestions([])
      return
    }
    setLoading(true)
    try {
      const body: Record<string, unknown> = { query, count: 10 }
      if (cityFilter) {
        // Оператор просил показывать пригороды/Ленобласть (Гатчина, Всеволожск, и т.д.),
        // а также «пропущенные» СПб-пригороды типа Петергоф/Пушкин.
        // DaData locations = OR: адрес подходит, если попадает под ЛЮБУЮ из локаций.
        // Для СПб оставляем city-фильтр (включает внутригородские территории —
        // Пушкин, Петергоф, Кронштадт), для области — фильтр по региону.
        body.locations = [
          { city: cityFilter },
          { region: 'Ленинградская' },
        ]
        body.from_bound = { value: 'street' }
        body.to_bound = { value: 'house' }
      }
      const res = await fetch(DADATA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${DADATA_TOKEN}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) { setSuggestions([]); return }
      const json = await res.json()
      setSuggestions(json.suggestions || [])
    } catch {
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  const onInputChange = (val: string) => {
    onChange(val)
    setOpen(true)
    setHighlight(0)
    setIsResolved(false) // ручной ввод — адрес снова неподтверждён
    lastQuery.current = val
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (lastQuery.current === val) void fetchSuggestions(val)
    }, 250)
  }

  const select = (s: DadataSuggestion) => {
    onChange(s.value)
    setOpen(false)
    setSuggestions([])
    setIsResolved(true)
    if (onResolved) {
      const lat = s.data.geo_lat ? parseFloat(s.data.geo_lat) : null
      const lon = s.data.geo_lon ? parseFloat(s.data.geo_lon) : null
      // 1. Сначала пытаемся взять район из ответа DaData.
      const districtRaw = s.data.city_district || ''
      let district = normalizeDistrict(districtRaw, s.data.city_district_with_type)
      // 2. Если DaData вернула пусто (часто бывает для подсказок без дома) —
      //    fallback: определяем район по координатам через bbox-таблицу районов СПб.
      if (!district && lat != null && lon != null) {
        district = detectDistrictByCoords(lat, lon)
      }
      onResolved({
        address: s.value,
        district,
        lat,
        lon,
        precise: s.data.qc_geo === '0',
      })
    }
  }

  // Закрытие при клике вне
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      if (suggestions[highlight]) { e.preventDefault(); select(suggestions[highlight]) }
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const noToken = !DADATA_TOKEN

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        value={value}
        onChange={e => onInputChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        style={{ width: '100%' }}
      />
      {noToken && (
        <div style={{ fontSize: '0.75em', color: '#888', marginTop: 2 }}>
          Подсказки адреса отключены: не задан VITE_DADATA_TOKEN. Поле работает как обычный ввод.
        </div>
      )}
      {/* Бейдж «не подтверждён» — когда адрес введён руками без выбора подсказки.
          Координат не будет, на карте точка не отобразится.
          Скрываем, если адрес «подтверждён извне» (взят из карточки клиента,
          у которой уже есть валидные координаты) — пока оператор не начал редактировать. */}
      {!noToken && value.trim().length > 0 && !isResolved && !externallyConfirmed && (
        <div style={{
          display: 'inline-block', marginTop: 4, padding: '1px 8px', borderRadius: 3,
          fontSize: '0.78em', fontWeight: 500,
          background: '#fef5e7', color: '#d35400',
        }}
        title="Адрес не выбран из подсказок DaData — координат нет, на карте точка не отобразится. Выберите вариант из списка для подтверждения.">
          адрес не подтверждён
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: '#fff', border: '1px solid #ddd', borderRadius: 4,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          marginTop: 2,
        }}>
          {suggestions.map((s, i) => (
            <div
              key={`${s.value}-${i}`}
              onMouseDown={e => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: '0.92em',
                background: i === highlight ? '#f0f6ff' : '#fff',
                borderBottom: i < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}
            >
              <div>{s.value}</div>
              {s.data.city_district && (
                <div style={{ fontSize: '0.85em', color: '#888', marginTop: 2 }}>
                  Район: {s.data.city_district_with_type || s.data.city_district}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open && loading && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: '#fff', border: '1px solid #ddd', borderRadius: 4,
          padding: '8px 12px', fontSize: '0.85em', color: '#888',
          marginTop: 2,
        }}>
          Загрузка подсказок...
        </div>
      )}
    </div>
  )
}

/**
 * DaData возвращает район в виде "Центральный". Для СПб этого достаточно,
 * наш справочник хранит ровно такие имена. На случай если придёт что-то с лишним
 * суффиксом ("Центральный район") — обрезаем " район".
 */
function normalizeDistrict(name: string, withType: string | null): string | null {
  const v = (name || '').trim()
  if (!v) {
    // Иногда city_district пуст, но в city_district_with_type что-то есть
    if (withType) {
      const m = withType.match(/^(.+?)\s+район$/i)
      if (m) return m[1].trim()
      return withType.trim()
    }
    return null
  }
  return v.replace(/\s+район$/i, '').trim()
}
