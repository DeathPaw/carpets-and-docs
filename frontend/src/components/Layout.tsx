import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import FeedbackButton from './FeedbackButton'
import './Layout.css'

/**
 * Боковая навигация — вертикальный sidebar слева. Заменил горизонтальный navbar,
 * который не вмещал ~15 разделов (особенно с включённым режимом супервизора).
 *
 * Структура:
 *   • Бренд сверху
 *   • Секция «Оператор» — повседневные страницы
 *   • Секция «Супервизор» — настройки и логи (видна только в режиме супервизора)
 *   • Внизу — переключатель режима, кнопка «Назад» и выход
 */
export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()

  // Режим супервизора: скрывает «системные» разделы от обычного оператора —
  // справочники, сотрудников, логи, доходность. Хранится в localStorage.
  const [supervisorMode, setSupervisorMode] = useState<boolean>(
    () => localStorage.getItem('supervisor_mode') === '1'
  )
  useEffect(() => {
    localStorage.setItem('supervisor_mode', supervisorMode ? '1' : '0')
  }, [supervisorMode])

  const logout = () => {
    sessionStorage.removeItem('auth')
    navigate('/login')
  }

  // Кнопка «Назад» скрыта только на login.
  const ROOT_PATHS = new Set(['/login'])
  const showBack = !ROOT_PATHS.has(location.pathname)

  // Хелпер для NavLink с одинаковыми классами — меньше JSX-шума.
  const navClass = (extra = '') =>
    ({ isActive }: { isActive: boolean }) =>
      `nav-link${extra ? ' ' + extra : ''}${isActive ? ' active' : ''}`

  return (
    <div className={`app${supervisorMode ? ' supervisor-frame' : ''}`}>
      <aside className="app-sidebar">
        <div className="sidebar-brand">Учёт заказов</div>

        {showBack && (
          <button onClick={() => navigate(-1)} className="sidebar-back" title="Назад">
            ← Назад
          </button>
        )}

        <div className="sidebar-section-label">Оператор</div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard"  className={navClass()}>Главная</NavLink>
          <NavLink to="/orders"     className={navClass()}>Заказы</NavLink>
          <NavLink to="/items"      className={navClass()}>Позиции</NavLink>
          <NavLink to="/logistics"  className={navClass()}>Логистика</NavLink>
          <NavLink to="/production" className={navClass()}>Производство</NavLink>
          <NavLink to="/analytics"  className={navClass()}>Аналитика</NavLink>
          <NavLink to="/clients"    className={navClass()}>Клиенты</NavLink>
        </nav>

        {supervisorMode && (
          <>
            <div className="sidebar-section-label" style={{ color: '#e67e22' }}>Супервизор</div>
            <nav className="sidebar-nav">
              <NavLink to="/profitability" className={navClass('supervisor-link')}>Доходность</NavLink>
              <NavLink to="/references"    className={navClass('supervisor-link')}>Справочники</NavLink>
              <NavLink to="/employees"     className={navClass('supervisor-link')}>Сотрудники</NavLink>
              <NavLink to="/feedback"      className={navClass('supervisor-link')}>Обращения</NavLink>
              <NavLink to="/error-log"     className={navClass('supervisor-link')}>Лог ошибок</NavLink>
              <NavLink to="/audit-log"     className={navClass('supervisor-link')}>Лог действий</NavLink>
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          <button
            onClick={() => setSupervisorMode(s => !s)}
            className="nav-link"
            title={supervisorMode ? 'Выключить режим супервизора' : 'Включить режим супервизора'}
            style={{
              background: supervisorMode ? 'rgba(230, 126, 34, 0.25)' : 'transparent',
              color: supervisorMode ? '#f5b041' : '#bdc3c7',
              fontWeight: supervisorMode ? 500 : 400,
            }}
          >
            👑 {supervisorMode ? 'Супервизор: ВКЛ' : 'Режим супервизора'}
          </button>
          <button onClick={logout} className="nav-link" style={{ opacity: 0.7 }}>
            Выход
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* Плавающая кнопка «Связь с разработчиком» — глобально, на всех авторизованных страницах. */}
      <FeedbackButton />
    </div>
  )
}
