import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  /** Необязательная подпись справа — например счётчик. */
  hint?: string
}

/**
 * Выпадающий список в стиле приложения.
 *
 * Нативный `<select>` рисует раскрытый список средствами ОС — на macOS это
 * тёмно-серая панель, которая выбивается из бело-голубой палитры. Здесь список
 * рисуем сами: белый фон, голубая подсветка выбранного и наведённого пункта.
 *
 * Поведение как у обычного select: клик по полю раскрывает, клик мимо и Esc
 * закрывают, стрелки и Enter работают с клавиатуры.
 */
export default function StyledSelect<T extends string | number>({
  value, options, onChange, placeholder = '— не выбрано —', disabled, width, ariaLabel, portal = false,
}: {
  value: T | null
  options: SelectOption<T>[]
  onChange: (v: T) => void
  placeholder?: string
  disabled?: boolean
  width?: number | string
  ariaLabel?: string
  /** Раскрывать поверх страницы, вне контейнеров с overflow (таблиц и модалок). */
  portal?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()
  const [menuPosition, setMenuPosition] = useState<{
    left: number; top: number; width: number; maxHeight: number
  } | null>(null)

  const selected = options.find(o => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)
        && !menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) setHighlight(Math.max(0, options.findIndex(o => o.value === value)))
  }, [open, options, value])

  useLayoutEffect(() => {
    if (!open || !portal) {
      setMenuPosition(null)
      return
    }
    const updatePosition = () => {
      if (!wrapRef.current || !menuRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const margin = 8, gap = 4
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = document.documentElement.clientHeight
      const width = Math.min(rect.width, Math.max(0, viewportWidth - margin * 2))
      const below = Math.max(0, viewportHeight - rect.bottom - gap - margin)
      const above = Math.max(0, rect.top - gap - margin)
      const desiredHeight = Math.min(280, menuRef.current.scrollHeight + 2)
      const openAbove = desiredHeight > below && above > below
      const maxHeight = Math.min(280, openAbove ? above : below, Math.max(0, viewportHeight - margin * 2))
      const height = Math.min(desiredHeight, maxHeight)
      setMenuPosition({
        left: Math.max(margin, Math.min(rect.left, viewportWidth - width - margin)),
        top: Math.max(margin, Math.min(
          openAbove ? rect.top - gap - height : rect.bottom + gap,
          viewportHeight - margin - height,
        )),
        width,
        maxHeight,
      })
    }
    updatePosition()
    // Capture нужен и для прокрутки самой таблицы, а не только всей страницы.
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    const observer = new ResizeObserver(updatePosition)
    if (wrapRef.current) observer.observe(wrapRef.current)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      observer.disconnect()
    }
  }, [open, portal, options.length])

  const pick = (v: T) => { onChange(v); setOpen(false) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault(); setOpen(true); return
    }
    if (!open) return
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (options[highlight]) pick(options[highlight].value)
    }
  }

  const menu = open && (
    <div
      ref={menuRef}
      id={listId}
      role="listbox"
      style={{
        // z-index выше слоёв Leaflet (панели карты — 400+, контролы до 1000):
        // иначе раскрытый список уходил под карту и было видно только первый пункт.
        ...(portal ? {
          position: 'fixed' as const,
          left: menuPosition?.left ?? 0,
          top: menuPosition?.top ?? 0,
          width: menuPosition?.width,
          maxHeight: menuPosition?.maxHeight ?? 280,
          visibility: menuPosition ? 'visible' as const : 'hidden' as const,
        } : {
          position: 'absolute' as const, top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', maxHeight: 280,
        }),
        zIndex: 2000,
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 'var(--radius)', boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
        overflowY: 'auto', padding: 4,
      }}
    >
      {options.length === 0 ? (
        <div style={{ padding: '8px 10px', color: 'var(--c-text-muted)', fontSize: 'var(--font-sm)' }}>
          Нет вариантов
        </div>
      ) : options.map((o, i) => {
        const isSelected = o.value === value
        const isHot = i === highlight
        return (
          <div
            key={String(o.value)}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={isSelected}
            onMouseEnter={() => setHighlight(i)}
            onClick={() => pick(o.value)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '7px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontSize: 14, whiteSpace: 'nowrap',
              background: isSelected ? 'var(--c-primary)' : (isHot ? 'var(--c-primary-light)' : 'transparent'),
              color: isSelected ? '#fff' : 'var(--c-text)',
              fontWeight: isSelected ? 600 : 400,
            }}
          >
            <span>{o.label}</span>
            {o.hint && (
              <span style={{
                fontSize: 'var(--font-sm)',
                color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--c-text-secondary)',
              }}>{o.hint}</span>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: width ?? '100%' }}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[highlight] ? `${listId}-${highlight}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          background: disabled ? 'var(--c-bg-hover)' : '#fff',
          color: disabled ? 'var(--c-text-muted)' : 'var(--c-text)',
          border: `1px solid ${open ? 'var(--c-primary)' : '#ddd'}`,
          borderRadius: 'var(--radius-sm)',
          // Высота общая с input и мульти-фильтром (--control-h): раньше
          // считалась от паддинга и была на пиксель ниже соседей.
          height: 'var(--control-h)', padding: '0 10px', fontSize: 14,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? undefined : 'var(--c-text-muted)',
        }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: 'var(--c-primary)', fontSize: 'var(--font-sm)', flexShrink: 0 }}>▼</span>
      </button>

      {menu && (portal ? createPortal(menu, document.body) : menu)}
    </div>
  )
}
