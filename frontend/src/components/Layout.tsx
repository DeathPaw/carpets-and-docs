import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import './Layout.css'

export default function Layout() {
  const navigate = useNavigate()

  const logout = () => {
    sessionStorage.removeItem('auth')
    navigate('/login')
  }

  return (
    <div className="app">
      <nav className="navbar">
        <span className="navbar-brand">Учёт заказов</span>
        <div className="nav-links">
          <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Главная
          </NavLink>
          <NavLink to="/orders" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Заказы
          </NavLink>
          <NavLink to="/logistics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Логистика
          </NavLink>
          <NavLink to="/production" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Производство
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Аналитика
          </NavLink>
          <NavLink to="/items" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Позиции
          </NavLink>
          <NavLink to="/references" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Справочники
          </NavLink>
          <NavLink to="/employees" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Сотрудники
          </NavLink>
          <NavLink to="/clients" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Клиенты
          </NavLink>
          <NavLink to="/error-log" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Лог ошибок
          </NavLink>
          <NavLink to="/audit-log" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Лог
          </NavLink>
          <button onClick={logout} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.7 }}>
            Выход
          </button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
