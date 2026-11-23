import { useState, useEffect } from 'react'
import axios from 'axios'
import api from '../lib/axios'
import { useDebounce } from '../customHook/useDebounce'

export interface AuditLogItem {
  id: number
  user_id: number | null
  actor_email: string | null
  actor_name: string | null
  action: string
  entity: string | null
  entity_id: string | null
  details: string | null
  created_at: string
}

export interface AuditLogsResponse {
  items: AuditLogItem[]
  page: number
  page_size: number
  total: number
  total_pages: number
  has_more: boolean
}

const COMMON_ACTIONS = [
  'login_success',
  'login_failed',
  'order_created',
  'order_status_changed',
  'order_deleted',
  'import_started',
  'user_updated',
  'user_role_changed',
  'user_status_changed',
]

function getActionBadgeStyle(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('failed') || lower.includes('deleted')) {
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }
  if (lower.includes('success') || lower.includes('created')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (lower.includes('import') || lower.includes('changed') || lower.includes('updated')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  }
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])

  // Query filter state variables matching backend /audit-logs validators
  const [userIdInput, setUserIdInput] = useState('')
  const [user_id, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [from_date, setFromDate] = useState('')
  const [to_date, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [page_size, setPageSize] = useState(40)

  // Pagination & request states
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const debouncedSetUserId = useDebounce((val: string) => {
    setUserId(val)
    setPage(1)
  }, 300)

  useEffect(() => {
    let ignore = false

    const fetchAuditLogs = async () => {
      setLoading(true)
      setError('')

      const params: Record<string, string | number> = {
        page,
        page_size,
      }

      if (user_id.trim()) {
        params.user_id = user_id.trim()
      }

      if (action.trim()) {
        params.action = action.trim()
      }

      if (from_date) {
        params.from_date = from_date
      }

      if (to_date) {
        params.to_date = to_date
      }

      try {
        const response = await api.get<AuditLogsResponse>('/audit-logs', {
          params,
        })

        if (ignore) return

        const data = response.data
        setLogs(data.items || [])
        setTotal(data.total ?? 0)
        setTotalPages(data.total_pages ?? 1)
        setHasMore(Boolean(data.has_more))
      } catch (err) {
        if (ignore) return

        if (axios.isAxiosError(err)) {
          const backendMsg =
            err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to fetch audit logs.'
          setError(backendMsg)
        } else {
          setError('An unexpected error occurred while fetching audit logs.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchAuditLogs()

    return () => {
      ignore = true
    }
  }, [page, page_size, user_id, action, from_date, to_date])

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getPageNumbers = () => {
    const totalP = Math.max(1, totalPages)
    const pages: (number | '...')[] = []

    if (totalP <= 7) {
      for (let i = 1; i <= totalP; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push('...')
      const start = Math.max(2, page - 1)
      const end = Math.min(totalP - 1, page + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (page < totalP - 2) pages.push('...')
      pages.push(totalP)
    }

    return pages
  }

  const startIndex = total === 0 ? 0 : (page - 1) * page_size + 1
  const endIndex = Math.min(page * page_size, total)

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Heading */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Security and activity trail of administrative actions across the system.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs">
          Total Events:{' '}
          <span className="font-bold text-slate-900">
            {total.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Filter by User ID & Action */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* user_id filter */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="audit-user-id"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                User ID
              </label>
              <input
                id="audit-user-id"
                name="user_id"
                type="number"
                min={1}
                value={userIdInput}
                onChange={(e) => {
                  const val = e.target.value
                  setUserIdInput(val)
                  debouncedSetUserId(val)
                }}
                placeholder="e.g. 1"
                className="w-full sm:w-32 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            {/* action filter */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="audit-action"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                Action
              </label>
              <select
                id="audit-action"
                name="action"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value)
                  setPage(1)
                }}
                className="w-full sm:w-56 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              >
                <option value="">All Actions</option>
                {COMMON_ACTIONS.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: Calendar Date Filters (from_date & to_date) */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="audit_from_date"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                From Date
              </label>
              <input
                id="audit_from_date"
                name="from_date"
                type="date"
                value={from_date}
                max={to_date || undefined}
                onChange={(e) => {
                  setFromDate(e.target.value)
                  setPage(1)
                }}
                className="w-full sm:w-44 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="audit_to_date"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                To Date
              </label>
              <input
                id="audit_to_date"
                name="to_date"
                type="date"
                value={to_date}
                min={from_date || undefined}
                onChange={(e) => {
                  setToDate(e.target.value)
                  setPage(1)
                }}
                className="w-full sm:w-44 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {(userIdInput || user_id || action || from_date || to_date) && (
          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setUserIdInput('')
                setUserId('')
                setAction('')
                setFromDate('')
                setToDate('')
                setPage(1)
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="bg-rose-50 border-x border-t border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center justify-between"
        >
          <span>{error}</span>
        </div>
      )}

      {/* Responsive Audit Logs Table */}
      <div className="bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Log ID</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                  Timestamp
                </th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Actor</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Action</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Entity</th>
                <th className="py-3.5 px-4 sm:px-6">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-600">
                      <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                      Loading audit logs...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-slate-500 text-sm"
                  >
                    No audit log entries found matching the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-indigo-600">
                      #{log.id}
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap text-xs sm:text-sm text-slate-600">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {log.actor_name ||
                          (log.user_id ? `User #${log.user_id}` : 'System / Guest')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {log.actor_email || '—'}
                        {log.user_id ? ` (ID: ${log.user_id})` : ''}
                      </div>
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-semibold border ${getActionBadgeStyle(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      {log.entity ? (
                        <div>
                          <span className="font-mono text-xs font-semibold text-slate-800">
                            {log.entity}
                          </span>
                          {log.entity_id && (
                            <div className="text-xs font-mono text-slate-400 truncate max-w-36">
                              #{log.entity_id}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-slate-700 min-w-64">
                      {log.details || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center justify-between sm:justify-start gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <label
              htmlFor="audit_page_size"
              className="text-xs sm:text-sm font-medium text-slate-600"
            >
              Rows per page:
            </label>
            <select
              id="audit_page_size"
              name="page_size"
              value={page_size}
              disabled={loading}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer disabled:opacity-60"
            >
              <option value={20}>20</option>
              <option value={40}>40</option>
              <option value={60}>60</option>
              <option value={80}>80</option>
              <option value={100}>100</option>
            </select>
          </div>
          <span className="text-xs sm:text-sm text-slate-500">
            Showing{' '}
            <span className="font-semibold text-slate-800">
              {startIndex}–{endIndex}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-slate-800">
              {total.toLocaleString()}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-center sm:justify-end gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            Prev
          </button>

          {getPageNumbers().map((num, idx) =>
            num === '...' ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-1.5 text-slate-400 text-sm select-none"
              >
                ...
              </span>
            ) : (
              <button
                key={num}
                type="button"
                disabled={loading}
                onClick={() => setPage(num)}
                className={`min-w-8 h-8 sm:min-w-9 sm:h-9 px-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  page === num
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium'
                }`}
              >
                {num}
              </button>
            )
          )}

          <button
            type="button"
            disabled={!hasMore || page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
