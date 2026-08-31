import { useEffect, useState, useRef, useMemo } from 'react'
import { getDistricts } from '../api/districts'
import type { District } from '../types'

// Кэш районов на сессию: чтобы не перезагружать список на каждый ререндер.
let cachedDistricts: District[] | null = null
let cachePromise: Promise<District[]> | null = null

function loadDistricts(): Promise<District[]> {
  if (cachedDistricts) return Promise.resolve(cachedDistricts)
  if (cachePromise) return cachePromise
  cachePromise = getDistricts(true).then(d => {
    cachedDistricts = d
    cachePromise = null
    return d
  }).catch(e => {
    cachePromise = null
    throw e
  })
  return cachePromise
}

/** Сбросить кэш — после CRUD-операций со справочником районов. */
export function invalidateDistrictCache() {
  cachedDistricts = null
  cachePromise = null
}

interface Props {
  value: string
  onChange: (district: string) => void
  placeholder?: string
  autoDetected?: boolean
  warning?: string
  width?: number | string
  disabled?: boolean
}

/**
 * Выпадающий список районов с поиском по подстроке.
 * - Подгружает справочник районов (только активные) с кэшем.
 * - Если введённого значения нет в справочнике — подсвечивает оранжевым и предлагает кнопку «Добавить как новый».
 * - Поддерживает клавиатурную навигацию: ↑/↓ выбор, Enter подтвердить, Esc закрыть.
 */
export default function DistrictSelect({
  value, onChange, placeholder = 'Район', autoDetected, warning, width = 220, disabled
}: Props) {
  const [districts, setDistricts] = useState<District[]>(cachedDistricts ?? [])
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(value)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setInput(value) }, [value])

  useEffect(() => {
    if (cachedDistricts) {
      setDistricts(cachedDistricts)
      return
    }
    loadDistricts().then(setDistricts).catch(() => {})
  }, [])

  // Закрытие при клике вне компонента
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase()
    if (!q) return districts
    return districts.filter(d => d.name.toLowerCase().includes(q))
  }, [districts, input])

  const exactMatch = useMemo(() => {
    const q = input.trim().toLowerCase()
    return districts.some(d => d.name.toLowerCase() === q)
  }, [districts, input])

  const select = (name: string) => {
    setInput(name)
    onChange(name)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true); setHighlight(0); return
    }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) select(filtered[highlight].name)
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const onBlurInput = () => {
    // Сохраняем как есть при потере фокуса (даже если нет в справочнике —
    // оператор может ввести вручную, а потом завести через справочник).
    if (input !== value) onChange(input)
  }

  const isUnknown = input.trim() !== '' && !exactMatch && districts.length > 0

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: typeof width === 'number' ? `${width}px` : width }}>
      <input
        ref={inputRef}
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onBlur={onBlurInput}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: '100%',
          borderColor: isUnknown ? '#e67e22' : undefined,
        }}
      />
      {autoDetected && !isUnknown && (
        <div style={{ fontSize: 'var(--font-sm)', color: '#27ae60', marginTop: 2 }}>определён автоматически</div>
      )}
      {isUnknown && (
        <div style={{ fontSize: 'var(--font-sm)', color: '#e67e22', marginTop: 2 }}>
          Нет в справочнике — добавьте через «Справочники → Районы»
        </div>
      )}
      {warning && !isUnknown && (
        <div style={{ fontSize: 'var(--font-sm)', color: '#e67e22', marginTop: 2 }}>{warning}</div>
      )}
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: '#fff', border: '1px solid #ddd', borderRadius: 4,
          maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2,
        }}>
          {filtered.map((d, i) => (
            <div
              key={d.id}
              onMouseDown={e => { e.preventDefault(); select(d.name) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '6px 10px', cursor: 'pointer',
                background: i === highlight ? '#f0f6ff' : '#fff',
                fontSize: 'var(--font-sm)',
              }}
            >
              {d.name}
            </div>
          ))}
        </div>
      )}
      {open && input.trim() && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          background: '#fff', border: '1px solid #ddd', borderRadius: 4,
          padding: '8px 10px', fontSize: 'var(--font-sm)', color: '#888',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginTop: 2,
        }}>
          Ничего не найдено
        </div>
      )}
    </div>
  )
}
