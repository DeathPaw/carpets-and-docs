import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ItemsPage from './pages/ItemsPage'
import ReferencesPage from './pages/ReferencesPage'
import EmployeesPage from './pages/EmployeesPage'
import ClientsPage from './pages/ClientsPage'
import ErrorLogPage from './pages/ErrorLogPage'
import AuditLogPage from './pages/AuditLogPage'
import LogisticsPage from './pages/LogisticsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/orders" replace />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="logistics" element={<LogisticsPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="references" element={<ReferencesPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="error-log" element={<ErrorLogPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
