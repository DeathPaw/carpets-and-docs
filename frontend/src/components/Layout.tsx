import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import FeedbackButton from './FeedbackButton'
import SuggesterButton from './SuggesterButton'
import UpdatesButton from './UpdatesButton'
import NotificationBell from './NotificationBell'
import TrainingBanner from '../training/TrainingBanner'
import { isTrainingMode } from '../training'
import { useAuth } from '../auth/AuthContext'
import './Layout.css'

/**
 * V11: роль определяется при логине (SUPERVISOR / ADMIN / OPERATOR / READONLY).
 * Тумблер «Супервизор ВКЛ» и чекбокс «Режим просмотра» убраны.
 *
 * Видимость разделов:
 *   SUPERVISOR — всё, включая Пользователи / Доходность / Логи
 *   ADMIN      — Справочники / Сотрудники / Обращения (без Логов, Доходности, Пользователей)
 *   OPERATOR   — Заказы / Позиции / Логистика / Производство / Аналитика / Клиенты
 *   READONLY   — то же что OPERATOR, но с баннером «Только просмотр» и скрытыми кнопками мутаций
 */
export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const trainingMode = isTrainingMode()
  const { user, isSupervisor, isAdmin, isReadonly } = useAuth()

  const logout = () => {
    sessionStorage.removeItem('auth')
    window.location.href = '/login'
  }

  const ROOT_PATHS = new Set(['/login'])
  const showBack = !ROOT_PATHS.has(location.pathname)

  const navClass = (extra = '') =>
    ({ isActive }: { isActive: boolean }) =>
      `nav-link${extra ? ' ' + extra : ''}${isActive ? ' active' : ''}`

  return (
    <div className={`app${isSupervisor ? ' supervisor-frame' : ''}`}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          Учёт заказов
          {trainingMode && <span style={{ display: 'block', fontSize: 11, color: '#16a085', marginTop: 2 }}>Тренажёр</span>}
        </div>

        {showBack && (
          <button onClick={() => navigate(-1)} className="sidebar-back" title="Назад">
            ← Назад
          </button>
        )}

        <div className="sidebar-section-label">Оператор</div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard"  className={navClass()} data-tour="nav-dashboard">Главная</NavLink>
          <NavLink to="/orders"     className={navClass()} data-tour="nav-orders">Заказы</NavLink>
          <NavLink to="/items"      className={navClass()} data-tour="nav-items">Позиции</NavLink>
          <NavLink to="/logistics"  className={navClass()} data-tour="nav-logistics">Логистика</NavLink>
          <NavLink to="/production" className={navClass()} data-tour="nav-production">Производство</NavLink>
          <NavLink to="/analytics"  className={navClass()} data-tour="nav-analytics">Аналитика</NavLink>
          <NavLink to="/clients"    className={navClass()} data-tour="nav-clients">Клиенты</NavLink>
        </nav>

        {/* Админские разделы: SUPERVISOR + ADMIN */}
        {isAdmin && (
          <>
            <div className="sidebar-section-label" style={{ color: '#e67e22' }}>
              {isSupervisor ? 'Супервизор' : 'Администратор'}
            </div>
            <nav className="sidebar-nav">
              {isSupervisor && <NavLink to="/profitability" className={navClass('supervisor-link')}>Доходность</NavLink>}
              <NavLink to="/references"    className={navClass('supervisor-link')}>Справочники</NavLink>
              <NavLink to="/employees"     className={navClass('supervisor-link')}>Сотрудники</NavLink>
              <NavLink to="/feedback"      className={navClass('supervisor-link')}>Обращения</NavLink>
              {isSupervisor && <NavLink to="/expenses" className={navClass('supervisor-link')}>Расходы</NavLink>}
              {isSupervisor && <NavLink to="/users" className={navClass('supervisor-link')}>Пользователи</NavLink>}
              {isSupervisor && <NavLink to="/error-log"  className={navClass('supervisor-link')}>Лог ошибок</NavLink>}
              {isSupervisor && <NavLink to="/audit-log"  className={navClass('supervisor-link')}>Лог действий</NavLink>}
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          {/* Информация о пользователе вместо тумблера */}
          {user && (
            <div style={{
              padding: '6px 12px', fontSize: 12, color: '#95a5a6',
              borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: 4,
            }}>
              <div style={{ fontWeight: 500, color: '#bdc3c7' }}>{user.display_name}</div>
              <div>{user.role === 'SUPERVISOR' ? '👑 Супервизор' :
                    user.role === 'ADMIN' ? '🔧 Администратор' :
                    user.role === 'READONLY' ? '👁 Только просмотр' :
                    '👤 Оператор'}</div>
            </div>
          )}
          <button onClick={logout} className="nav-link" style={{ opacity: 0.7 }}>
            Выход
          </button>
        </div>
      </aside>

      <div className="app-with-banner">
        {trainingMode && <TrainingBanner />}
        {/* Полоса READONLY — аналог старого «Режим просмотра» */}
        {isReadonly && (
          <div style={{
            background: '#34495e', color: '#fff', padding: '6px 16px',
            fontSize: 13, fontWeight: 500, letterSpacing: 0.3,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
          }}>
            👁 Режим просмотра — изменения отключены
          </div>
        )}
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      <FeedbackButton />
      <SuggesterButton />
      <UpdatesButton />
      {!isReadonly && <NotificationBell />}
    </div>
  )
}
