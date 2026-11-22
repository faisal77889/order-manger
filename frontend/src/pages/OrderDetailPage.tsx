import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import api from '../lib/axios'
import type { OrderStatus } from './OrdersPage'

export interface OrderCustomerDetail {
  id: number
  name: string | null
  email: string | null
  city: string | null
  created_at: string | null
}

export interface OrderLineItem {
  id: number
  order_id: number
  product_id: number
  product_name: string | null
  category_id: number | null
  category_name: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export interface OrderDetailResponse {
  id: number
  customer_id: number
  status: OrderStatus
  order_date: string
  total_amount: number
  customer: OrderCustomerDetail | null
  items: OrderLineItem[]
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<OrderDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let ignore = false

    const fetchOrderDetail = async () => {
      if (!id) return
      setLoading(true)
      setError('')

      try {
        const response = await api.get<OrderDetailResponse>(`/orders/${id}`)
        if (ignore) return
        setOrder(response.data)
      } catch (err) {
        if (ignore) return
        if (axios.isAxiosError(err)) {
          const backendMsg =
            err.response?.data?.error ||
            err.response?.data?.message ||
            'Failed to fetch order details.'
          setError(backendMsg)
        } else {
          setError('An unexpected error occurred while fetching order details.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchOrderDetail()

    return () => {
      ignore = true
    }
  }, [id])

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return 'N/A'
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDateOnly = (isoString: string | null) => {
    if (!isoString) return 'N/A'
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center justify-center">
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-slate-200 shadow-xs text-sm font-medium text-slate-700">
          <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
          Loading order #{id}...
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 shadow-xs p-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-50 text-rose-600 mb-4">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Unable to Load Order
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            {error || 'Order not found.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition cursor-pointer"
          >
            &larr; Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const totalQuantity = order.items.reduce((acc, item) => acc + item.quantity, 0)

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Navigation & Order Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition"
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
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to Orders
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Order <span className="font-mono text-indigo-600">#{order.id}</span>
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize border ${
                STATUS_STYLES[order.status] ||
                'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  STATUS_DOTS[order.status] || 'bg-slate-400'
                }`}
              />
              {order.status}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Placed on {formatDateTime(order.order_date)}
          </p>
        </div>

        {/* Quick Summary Pill Cards */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5 shadow-2xs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Line Items
            </div>
            <div className="text-lg font-bold text-slate-900">
              {order.items.length}{' '}
              <span className="text-xs font-normal text-slate-500">
                ({totalQuantity} units)
              </span>
            </div>
          </div>
          <div className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 shadow-sm shadow-indigo-500/20">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">
              Total Amount
            </div>
            <div className="text-lg font-bold">
              ${Number(order.total_amount ?? 0).toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Customer Card + Order Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Customer Details
              </h2>
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-xs font-semibold">
                ID #{order.customer?.id ?? order.customer_id}
              </span>
            </div>

            {order.customer ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold text-base flex items-center justify-center shrink-0">
                    {(order.customer.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900 truncate">
                      {order.customer.name || 'Unnamed Customer'}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {order.customer.email || 'No email provided'}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">City</div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {order.customer.city || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-medium">
                      Customer Since
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {formatDateOnly(order.customer.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Customer #{order.customer_id} details unavailable.
              </p>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Order Reference: <strong className="font-mono text-slate-700">ORD-{order.id}</strong></span>
            <Link
              to={`/customers/${order.customer?.id ?? order.customer_id}`}
              className="font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View Customer Orders &rarr;
            </Link>
          </div>
        </div>

        {/* Order Items Table (Spans 2 columns on desktop) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Order Items</h2>
              <p className="text-xs text-slate-500">
                Products, categories, quantities, and unit pricing for this order
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
              {order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Item ID</th>
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Product</th>
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Category</th>
                  <th className="py-3 px-4 sm:px-6 text-center whitespace-nowrap">
                    Quantity
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Unit Price
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Line Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm">
                {order.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-slate-500 text-sm"
                    >
                      No line items recorded for this order.
                    </td>
                  </tr>
                ) : (
                  order.items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-slate-500">
                        #{item.id}
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {item.product_name || `Product #${item.product_id}`}
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          PID: {item.product_id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        {item.category_name ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium">
                            {item.category_name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center min-w-8 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold text-xs">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap text-slate-600">
                        ${Number(item.unit_price ?? 0).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-bold text-slate-900">
                        ${Number(item.line_total ?? item.quantity * item.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {order.items.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50/90 border-t border-slate-200 text-sm">
                    <td
                      colSpan={3}
                      className="py-3.5 px-4 sm:px-6 font-semibold text-slate-600 text-right"
                    >
                      Order Summary
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-center font-bold text-slate-800">
                      {totalQuantity}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right text-slate-500 font-medium">
                      Total
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right text-base font-extrabold text-indigo-600">
                      ${Number(order.total_amount ?? 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
