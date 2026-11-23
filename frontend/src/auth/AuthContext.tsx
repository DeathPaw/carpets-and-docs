import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import client from '../api/client'

export type UserRole = 'SUPERVISOR' | 'ADMIN' | 'OPERATOR' | 'READONLY'

export interface AuthUser {
  id: number
  username: string
  display_name: string
  role: UserRole
  employee_id: number | null
  /** V62 (ПР-016): выборочные права поверх роли. */
  permissions?: Permission[]
}

/** ПР-016: права, которые супервизор выдаёт галочками на странице «Пользователи». */
export type Permission = 'REPORTS' | 'PAYROLL_VIEW' | 'PAYROLL_SHIFTS' | 'PAYROLL_EDIT'

export const PERMISSION_LABELS: Record<Permission, string> = {
  REPORTS: 'Отчёты',
  PAYROLL_VIEW: 'Просмотр зарплаты',
  PAYROLL_SHIFTS: 'Правка табеля смен',
  PAYROLL_EDIT: 'Начисление зарплаты',
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
  /** ПР-016: раздел «Отчёты» (супервизор или право REPORTS). */
  canReports: boolean
  /** ПР-016: раздел «Зарплата» — любое из прав на зарплату. */
  canPayroll: boolean
  /** ПР-016: правка табеля смен. */
  canPayrollShifts: boolean
  /** ПР-016: начисление зарплаты (пересчёт, правки, схемы, закрытие месяца). */
  canPayrollEdit: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, refresh: async () => {},
  isSupervisor: false, isAdmin: false, isOperator: false, isReadonly: false,
  canReports: false, canPayroll: false, canPayrollShifts: false, canPayrollEdit: false,
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
  const has = (p: Permission) => isSupervisor || !!user?.permissions?.includes(p)
  const canReports = has('REPORTS')
  const canPayrollEdit = has('PAYROLL_EDIT')
  const canPayrollShifts = canPayrollEdit || has('PAYROLL_SHIFTS')
  const canPayroll = canPayrollShifts || has('PAYROLL_VIEW')

  return (
    <AuthContext.Provider value={{
      user, loading, refresh, isSupervisor, isAdmin, isOperator, isReadonly,
      canReports, canPayroll, canPayrollShifts, canPayrollEdit,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
