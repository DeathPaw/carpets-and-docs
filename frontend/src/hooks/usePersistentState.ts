import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Чтение сохранённого значения из localStorage. Хранилище может быть недоступно
 * (приватное окно, запрет сайта) — тогда тихо возвращаем null.
 */
export function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? null : JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeStored(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* хранилище недоступно */ }
}

export function removeStored(key: string): void {
  try { localStorage.removeItem(key) } catch { /* хранилище недоступно */ }
}

/** useState, который переживает уход со страницы и перезагрузку (localStorage браузера). */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored<T>(key) ?? initial)
  useEffect(() => { writeStored(key, value) }, [key, value])
  return [value, setValue]
}
