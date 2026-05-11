import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import FeedbackButton from './FeedbackButton'
import TrainingBanner from '../training/TrainingBanner'
import { isTrainingMode } from '../training'
import { isViewerMode } from '../utils/viewer'
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
 *
 * В режиме тренажёра (VITE_TRAINING=1) сверху появляется зелёный баннер
 * «Тренажёр — изменения не сохраняются» с кнопками «Начать тур» и «Начать заново».
 */
export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const trainingMode = isTrainingMode()
  const viewerMode = isViewerMode()

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
  // tour — id для data-tour, чтобы Joyride мог подсветить пункт.
  const navClass = (extra = '') =>
    ({ isActive }: { isActive: boolean }) =>
      `nav-link${extra ? ' ' + extra : ''}${isActive ? ' active' : ''}`

  return (
    <div className={`app${supervisorMode ? ' supervisor-frame' : ''}`}>
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
            data-tour="supervisor-toggle"
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

      <div className="app-with-banner">
        {trainingMode && <TrainingBanner />}
        {/* Полоса «Режим просмотра» — видна на всех страницах оператора в viewer-mode.
            Сделана тёмно-серой, чтобы заметно отличалось от обычного UI и от
            тренажёрного зелёного. */}
        {viewerMode && (
          <div style={{
            background: '#34495e', color: '#fff', padding: '6px 16px',
            fontSize: 13, fontWeight: 500, letterSpacing: 0.3,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>👁 Режим просмотра — изменения отключены</span>
            <button
              onClick={() => { sessionStorage.removeItem('viewer_mode'); window.location.reload() }}
              style={{
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', padding: '4px 10px',
                borderRadius: 4, fontSize: 12, cursor: 'pointer',
              }}
            >Выключить режим просмотра</button>
          </div>
        )}
        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {/* Плавающая кнопка «Связь с разработчиком» — глобально, на всех авторизованных страницах. */}
      <FeedbackButton />
    </div>
  )
}
