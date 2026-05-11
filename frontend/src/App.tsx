import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ItemsPage from './pages/ItemsPage'
import ItemDetailPage from './pages/ItemDetailPage'
import ReferencesPage from './pages/ReferencesPage'
import EmployeesPage from './pages/EmployeesPage'
import ClientsPage from './pages/ClientsPage'
import ErrorLogPage from './pages/ErrorLogPage'
import AuditLogPage from './pages/AuditLogPage'
import LogisticsPage from './pages/LogisticsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import DashboardPage from './pages/DashboardPage'
import ProductionPage from './pages/ProductionPage'
import ProfitabilityPage from './pages/ProfitabilityPage'
import FeedbackPage from './pages/FeedbackPage'
import WorkerLoginPage from './pages/worker/WorkerLoginPage'
import WorkerHomePage from './pages/worker/WorkerHomePage'
import WorkerRoutePage from './pages/worker/WorkerRoutePage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = sessionStorage.getItem('auth')
  if (!auth) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Гард для маршрутов работника — отдельная сессия, sessionStorage.worker_id. */
function RequireWorker({ children }: { children: React.ReactNode }) {
  const id = sessionStorage.getItem('worker_id')
  if (!id) return <Navigate to="/worker-login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Личный кабинет работника (Спринт D) — отдельная авторизация по PIN,
                полностью отдельный layout (без оператора-сайдбара). */}
            <Route path="/worker-login" element={<WorkerLoginPage />} />
            <Route path="/worker" element={<RequireWorker><WorkerHomePage /></RequireWorker>} />
            <Route path="/worker/route" element={<RequireWorker><WorkerRoutePage /></RequireWorker>} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="logistics" element={<LogisticsPage />} />
              <Route path="production" element={<ProductionPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="profitability" element={<ProfitabilityPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="items/:id" element={<ItemDetailPage />} />
              <Route path="references" element={<ReferencesPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="error-log" element={<ErrorLogPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}
