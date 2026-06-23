import { useEffect } from 'react'

/**
 * V19 (#6): универсальное закрытие модалок по Escape.
 *
 * <p>Используется во всех модалках вместо ручного слушателя. Закрывает по
 * самой свежей модалке (stack-эффект — поверх лежащая закрывается первой),
 * потому что последний эффект подписался последним.
 *
 * <p>Использование:
 *   useEscapeClose(open, () => setOpen(false))
 */
export function useEscapeClose(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])
}
