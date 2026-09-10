import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscapeClose } from '../hooks/useEscapeClose'

export interface PrintMenuItem {
  label: string
  /** Пояснение мелким шрифтом под названием. */
  hint?: string
  onClick: () => void
  /** Отделить чертой от предыдущего пункта. */
  separated?: boolean
}

/**
 * Кнопка печати с выпадающим списком документов.
 *
 * Правка №4 (09.09): рядом с маршрутным листом появились пустые бланки накладных.
 * Отдельные кнопки под каждый документ в строку развозки уже не помещались —
 * она и так занята водителем, днём и «Завершить», поэтому документы собраны
 * под одной 🖨.
 */
export default function PrintMenuButton({ items, title, label = '🖨' }: {
  items: PrintMenuItem[]
  title?: string
  label?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEscapeClose(open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-secondary"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >{label}</button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it, i) => (
            <div key={it.label}>
              {it.separated && i > 0 && <div className="menu-sep" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); it.onClick() }}
              >
                {it.label}
                {it.hint && <span className="menu-hint">{it.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
