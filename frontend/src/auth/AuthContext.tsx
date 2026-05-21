import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import client from '../api/client'

export type UserRole = 'SUPERVISOR' | 'ADMIN' | 'OPERATOR' | 'READONLY'

export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: UserRole
  employee_id: number | null
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  /** Перезапросить /api/me (после логина). */
  refresh: () => Promise<void>
  /** Есть ли доступ к супервизорским разделам (Доходность, Логи). */
  isSupervisor: boolean
  /** Может ли видеть админские разделы (Справочники, Сотрудники, Обращения). */
  isAdmin: boolean
  /** Может ли читать и писать рабочие разделы. */
  isOperator: boolean
  /** Только чтение (моноблок). */
  isReadonly: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, refresh: async () => {},
  isSupervisor: false, isAdmin: false, isOperator: false, isReadonly: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    // Если в sessionStorage нет токена — не дёргаем /api/me (получим 401 → редирект → цикл).
    if (!sessionStorage.getItem('auth')) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const res = await client.get<AuthUser>('/api/me')
      const u = res.data
      // employee_id=0 от бэка → null на фронте
      setUser({ ...u, employee_id: u.employee_id === 0 ? null : u.employee_id })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const role = user?.role
  const isSupervisor = role === 'SUPERVISOR'
  const isAdmin = role === 'SUPERVISOR' || role === 'ADMIN'
  const isOperator = role === 'SUPERVISOR' || role === 'ADMIN' || role === 'OPERATOR'
  const isReadonly = role === 'READONLY'

  return (
    <AuthContext.Provider value={{ user, loading, refresh, isSupervisor, isAdmin, isOperator, isReadonly }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
