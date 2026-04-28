import { NavLink, Outlet } from 'react-router-dom'
import './Layout.css'

export default function Layout() {
  return (
    <div className="app">
      <nav className="navbar">
        <span className="navbar-brand">🏭 Учёт заказов</span>
        <div className="nav-links">
          <NavLink to="/orders" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Заказы
          </NavLink>
          <NavLink to="/logistics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Логистика
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
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
