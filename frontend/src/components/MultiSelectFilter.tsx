import { useEffect, useRef, useState } from 'react'

export interface MultiSelectOption {
  value: string
  label: string
}

interface Props {
  options: MultiSelectOption[]
  value: string[]
  onChange: (newValues: string[]) => void
  placeholder?: string         // подпись когда ничего не выбрано — «Все статусы», «Все типы»…
  width?: number | string
  /** Количество выбранных пунктов после которого вместо имён показываем «N выбрано». */
  collapseThreshold?: number
  /**
   * Принудительно показывать поле поиска независимо от количества опций.
   * По умолчанию поиск появляется только при ≥7 опций (когда визуальная польза очевидна).
   * Передавайте {@code true} для фильтров, где оператор хочет вводить текст с клавиатуры
   * даже если опций мало (типы оплаты, исполнители в производстве и т.п.).
   */
  searchable?: boolean
}

/**
 * Универсальный мульти-фильтр:
 * - Кнопка-триггер показывает либо «Все», либо имена выбранных, либо «N выбрано».
 * - Выпадающий список с чекбоксами.
 * - Кнопки «Сбросить» (очищает) и «Закрыть».
 *
 * Используется для статусов, типов оплаты, временных слотов, типов позиций,
 * исполнителей и т.п. — везде, где раньше был одиночный <select>.
 */
/** Порог по количеству опций, после которого показываем поле поиска. */
const SEARCH_THRESHOLD = 7

export default function MultiSelectFilter({
  options, value, onChange, placeholder = 'Все', width = 220, collapseThreshold = 2,
  searchable = false,
}: Props) {
  const showSearch = searchable || options.length >= SEARCH_THRESHOLD
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Автофокус в поле поиска при открытии (если оно показывается).
  useEffect(() => {
    if (open && showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open, showSearch])

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  /** Фильтрация по подстроке, регистр-нечувствительно. Уже выбранные пункты всегда показываем
      сверху, чтобы их легко было снять, даже если они не подходят под поисковый запрос. */
  const filteredOptions = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => value.includes(o.value) || o.label.toLowerCase().includes(q))
  })()

  const triggerLabel = (() => {
    if (value.length === 0) return placeholder
    if (value.length <= collapseThreshold) {
      return value
        .map(v => options.find(o => o.value === v)?.label || v)
        .join(', ')
    }
    return `${value.length} выбрано`
  })()

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: typeof width === 'number' ? `${width}px` : width }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          // Высота общая с полями ввода рядом (см. --control-h в index.css):
          // раньше триггер был на пару пикселей ниже соседнего input.
          width: '100%', height: 'var(--control-h)',
          textAlign: 'left', padding: '0 10px',
          border: '1px solid #ccc', borderRadius: 4, background: '#fff', cursor: 'pointer',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {triggerLabel}
        <span style={{ float: 'right' }}>▾</span>
      </button>
      {open && (
        <div style={{
          // z-index с запасом: список раскрывается поверх таблиц и карты Leaflet
          // (её панели используют 400+). На 30 содержимое страницы просвечивало.
          position: 'absolute', top: '100%', left: 0, marginTop: 2, zIndex: 2000,
          background: '#ffffff', border: '1px solid #ddd', borderRadius: 4,
          minWidth: '100%', boxShadow: '0 6px 18px rgba(0,0,0,0.18)', padding: 8,
          maxHeight: 320, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#3498db', cursor: 'pointer', padding: 0, fontSize: 'var(--font-sm)' }}
              onClick={() => onChange([])}
              disabled={value.length === 0}
            >
              Сбросить
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: 'var(--font-sm)' }}
              onClick={() => { setOpen(false); setSearch('') }}
            >
              Закрыть
            </button>
          </div>
          {showSearch && (
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              style={{
                width: '100%', padding: '4px 8px', marginBottom: 6,
                border: '1px solid #ddd', borderRadius: 3, fontSize: 'var(--font-sm)',
                boxSizing: 'border-box',
              }}
            />
          )}
          {filteredOptions.length === 0 && (
            <div style={{ color: '#aaa', fontSize: 'var(--font-sm)', padding: '4px 0' }}>
              Ничего не найдено
            </div>
          )}
          {filteredOptions.map(o => {
            const checked = value.includes(o.value)
            return (
              <label
                key={o.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '5px 6px', borderRadius: 3,
                  background: checked ? 'var(--c-primary-light)' : 'transparent',
                  fontWeight: checked ? 600 : 400,
                }}
                onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--c-bg-hover)' }}
                onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  style={{ width: 'auto' }}
                />
                <span style={{ whiteSpace: 'nowrap' }}>{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
