import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import api from '../lib/axios'
import { useDebounce } from '../customHook/useDebounce'

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled'
export type SortOption =
  | 'order_date_desc'
  | 'order_date_asc'
  | 'total_amount_desc'
  | 'total_amount_asc'

export interface OrderItem {
  id: number
  customer_id: number
  customer_name: string | null
  customer_email: string | null
  status: OrderStatus
  order_date: string
  total_amount: number
  items_count: number
}

export interface OrdersResponse {
  items: OrderItem[]
  page: number
  page_size: number
  total: number
  total_pages: number
  has_more: boolean
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200/80',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200/80',
}

const STATUS_DOTS: Record<OrderStatus, string> = {
  pending: 'bg-amber-500',
  paid: 'bg-emerald-500',
  shipped: 'bg-indigo-500',
  cancelled: 'bg-rose-500',
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderItem[]>([])


  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [from_date, setFromDate] = useState('')
  const [to_date, setToDate] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('order_date_desc')
  const [page, setPage] = useState(1)
  const [page_size, setPageSize] = useState(40)

  const debouncedSearch = useDebounce((value: string) => {
    setQ(value)
    setPage(1)
  }, 300)


  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const fetchOrders = async () => {
      setLoading(true)
      setError('')

      const params: Record<string, string | number> = {
        page,
        page_size,
      }

      if (q.trim()) {
        params.q = q.trim()
      }

      if (status !== 'all') {
        params.status = status
      }

      if (from_date) {
        params.from_date = from_date
      }

      if (to_date) {
        params.to_date = to_date
      }

      if (sortBy === 'order_date_desc') {
        params.order_date = 'desc'
      } else if (sortBy === 'order_date_asc') {
        params.order_date = 'asc'
      } else if (sortBy === 'total_amount_desc') {
        params.total_amount = 'desc'
      } else if (sortBy === 'total_amount_asc') {
        params.total_amount = 'asc'
      }

      try {
        const response = await api.get<OrdersResponse>('/orders', {
          params,
          signal: controller.signal,
        })

        const data = response.data
        setOrder(data.items || [])
        setTotal(data.total ?? 0)
        setTotalPages(data.total_pages ?? 1)
        setHasMore(Boolean(data.has_more))
      } catch (err) {
        if (axios.isCancel(err)) {
          return
        }
        if (axios.isAxiosError(err)) {
          const backendMsg =
            err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to fetch orders.'
          setError(backendMsg)
        } else {
          setError('An unexpected error occurred while fetching orders.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchOrders()

    return () => {
      controller.abort()
    }
  }, [page, page_size, q, status, from_date, to_date, sortBy])

  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
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
            Orders
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor, filter, and manage all customer orders in one place.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs">
          Total Orders:{' '}
          <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Search Bar (q) */}
          <div className="relative flex-1 max-w-full lg:max-w-md">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
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
                  d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              name="q"
              value={searchInput}
              onChange={(e) => {
                const val = e.target.value
                setSearchInput(val)
                debouncedSearch(val)
              }}
              placeholder="Search customer name or email..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Right: Status & Sort By */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Filter by Status */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="status-filter"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                Status
              </label>
              <select
                id="status-filter"
                name="status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as 'all' | OrderStatus)
                  setPage(1)
                }}
                className="w-full sm:w-40 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Sort By (order_date / total_amount) */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="sort-filter"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                Sort By
              </label>
              <select
                id="sort-filter"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption)
                  setPage(1)
                }}
                className="w-full sm:w-48 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              >
                <option value="order_date_desc">Date: Newest First</option>
                <option value="order_date_asc">Date: Oldest First</option>
                <option value="total_amount_desc">Total: High to Low</option>
                <option value="total_amount_asc">Total: Low to High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Second Row: Calendar Date Filters (from_date and to_date) */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* from_date */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="from_date"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap min-w-16 sm:min-w-0"
              >
                From Date
              </label>
              <input
                id="from_date"
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

            {/* to_date */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="to_date"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap min-w-16 sm:min-w-0"
              >
                To Date
              </label>
              <input
                id="to_date"
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

          {(searchInput || q || status !== 'all' || from_date || to_date || sortBy !== 'order_date_desc') && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setQ('')
                setStatus('all')
                setFromDate('')
                setToDate('')
                setSortBy('order_date_desc')
                setPage(1)
              }}
              className="self-start sm:self-auto text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
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

      {/* Responsive Table Container */}
      <div className="bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Order ID</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Customer Name</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Date</th>
                <th className="py-3.5 px-4 sm:px-6 text-center whitespace-nowrap">
                  Items Count
                </th>
                <th className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-600">
                      <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                      Loading orders...
                    </div>
                  </td>
                </tr>
              ) : order.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    No orders found matching the selected filters.
                  </td>
                </tr>
              ) : (
                order.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/orders/${item.id}`)}
                    className="hover:bg-indigo-50/50 transition-colors group cursor-pointer"
                  >
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <span className="font-mono font-semibold text-indigo-600 group-hover:text-indigo-700">
                        #{item.id}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <div className="font-medium text-slate-900">
                        {item.customer_name || `Customer #${item.customer_id}`}
                      </div>
                      {item.customer_email && (
                        <div className="text-xs text-slate-500">
                          {item.customer_email}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize border ${STATUS_STYLES[item.status] ||
                          'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[item.status] || 'bg-slate-400'
                            }`}
                        />
                        {item.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap text-slate-600">
                      {formatDate(item.order_date)}
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-xs">
                        {item.items_count}
                      </span>
                    </td>
                    <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap font-semibold text-slate-900">
                      ${Number(item.total_amount ?? 0).toFixed(2)}
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
        {/* Left: Page Size Dropdown */}
        <div className="flex items-center justify-between sm:justify-start gap-3 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <label
              htmlFor="page_size"
              className="text-xs sm:text-sm font-medium text-slate-600"
            >
              Rows per page:
            </label>
            <select
              id="page_size"
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
            </span>{' '}
            (Orders loaded: {order.length})
          </span>
        </div>

        {/* Right: Page Numbers 1 to n */}
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
                className={`min-w-8 h-8 sm:min-w-9 sm:h-9 px-2 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${page === num
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
