import { useEffect } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CustomersPage from './pages/CustomersPage'
import ImportPage from './pages/ImportPage'
import ExportPage from './pages/ExportPage'
import ReportsPage from './pages/ReportsPage'
import AuditPage from './pages/AuditPage'

function ProtectedRoute() {
  const navigate = useNavigate()
  const token = localStorage.getItem('token')

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
    }
  }, [token, navigate])

  if (!token) {
    return null
  }

  return <Outlet />
}

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('token')

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login', { replace: true })
  }

  const navLinkClass = (path: string) => {
    const isActive =
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    return `transition ${
      isActive
        ? 'text-indigo-600 font-semibold'
        : 'text-slate-700 hover:text-slate-900'
    }`
  }

  return (
    <nav className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-6 text-sm font-medium text-slate-700">
      <Link to="/orders" className={navLinkClass('/orders')}>
        Orders
      </Link>
      <Link to="/customers" className={navLinkClass('/customers')}>
        Customers
      </Link>
      <Link to="/import" className={navLinkClass('/import')}>
        Import
      </Link>
      <Link to="/export" className={navLinkClass('/export')}>
        Export
      </Link>
      <Link to="/reports" className={navLinkClass('/reports')}>
        Reports
      </Link>
      <Link to="/audit" className={navLinkClass('/audit')}>
        Audit Logs
      </Link>

      <div className="ml-auto flex items-center gap-3">
        {token ? (
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
              />
            </svg>
            Logout
          </button>
        ) : (
          <Link to="/login" className="hover:text-slate-900">
            Login
          </Link>
        )}
      </div>
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Navbar />

        <main className="flex-1 flex items-center justify-center">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/orders" replace />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomersPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/audit-logs" element={<AuditPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/orders" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
