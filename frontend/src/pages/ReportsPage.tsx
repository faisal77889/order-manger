import { useState, useEffect } from 'react'
import axios from 'axios'
import api from '../lib/axios'

export interface SalesByCategoryItem {
  category_id: number
  category_name: string
  total_quantity_sold: number
  total_revenue: number
}

export interface TopCustomerItem {
  customer_id: number
  customer_name: string
  customer_email: string
  customer_city: string
  order_count: number
  total_spent: number
}

export interface NeverOrderedProductItem {
  product_id: number
  product_name: string
  price: number
  category_id: number
  category_name: string
}

export interface MonthlySalesItem {
  month: string
  order_count: number
  revenue: number
}

type ActiveTab = 'overview' | 'categories' | 'customers' | 'unused-products'

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')

  // Data states for all 4 report APIs
  const [salesByCategory, setSalesByCategory] = useState<SalesByCategoryItem[]>(
    []
  )
  const [topCustomers, setTopCustomers] = useState<TopCustomerItem[]>([])
  const [topCustomersLimit, setTopCustomersLimit] = useState<number>(10)
  const [neverOrderedProducts, setNeverOrderedProducts] = useState<
    NeverOrderedProductItem[]
  >([])
  const [neverOrderedTotal, setNeverOrderedTotal] = useState<number>(0)
  const [monthlySales, setMonthlySales] = useState<MonthlySalesItem[]>([])

  // Loading & error states
  const [loading, setLoading] = useState<boolean>(true)
  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  // Search filter for Never-Ordered Products
  const [productSearch, setProductSearch] = useState<string>('')

  // Fetch core reports on mount
  useEffect(() => {
    let ignore = false

    const fetchCoreReports = async () => {
      setLoading(true)
      setError('')

      try {
        const [catRes, prodRes, monthRes] = await Promise.all([
          api.get<{ items: SalesByCategoryItem[] }>(
            '/reports/sales-by-category'
          ),
          api.get<{ total: number; items: NeverOrderedProductItem[] }>(
            '/reports/never-ordered-products'
          ),
          api.get<{ items: MonthlySalesItem[] }>('/reports/monthly-sales'),
        ])

        if (ignore) return

        setSalesByCategory(catRes.data.items || [])
        setNeverOrderedProducts(prodRes.data.items || [])
        setNeverOrderedTotal(
          prodRes.data.total ?? (prodRes.data.items || []).length
        )
        setMonthlySales(monthRes.data.items || [])
      } catch (err) {
        if (ignore) return
        if (axios.isAxiosError(err)) {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to load analytics reports.'
          )
        } else {
          setError('An unexpected error occurred while loading reports.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchCoreReports()

    return () => {
      ignore = true
    }
  }, [])

  // Fetch Top Customers whenever topCustomersLimit changes
  useEffect(() => {
    let ignore = false

    const fetchTopCustomers = async () => {
      setLoadingCustomers(true)

      try {
        const res = await api.get<{ limit: number; items: TopCustomerItem[] }>(
          '/reports/top-customers',
          {
            params: { limit: topCustomersLimit },
          }
        )
        if (ignore) return
        setTopCustomers(res.data.items || [])
      } catch (err) {
        if (ignore) return
        if (axios.isAxiosError(err)) {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to generate top-customers report.'
          )
        }
      } finally {
        if (!ignore) {
          setLoadingCustomers(false)
        }
      }
    }

    fetchTopCustomers()

    return () => {
      ignore = true
    }
  }, [topCustomersLimit])

  // Aggregate metrics
  const totalCategoryRevenue = salesByCategory.reduce(
    (sum, item) => sum + item.total_revenue,
    0
  )
  const totalUnitsSold = salesByCategory.reduce(
    (sum, item) => sum + item.total_quantity_sold,
    0
  )
  const maxCategoryRevenue = Math.max(
    1,
    ...salesByCategory.map((c) => c.total_revenue)
  )

  const total12MoRevenue = monthlySales.reduce(
    (sum, item) => sum + item.revenue,
    0
  )
  const total12MoOrders = monthlySales.reduce(
    (sum, item) => sum + item.order_count,
    0
  )
  const maxMonthlyRevenue = Math.max(1, ...monthlySales.map((m) => m.revenue))

  const filteredNeverOrdered = productSearch.trim()
    ? neverOrderedProducts.filter(
        (p) =>
          p.product_name
            .toLowerCase()
            .includes(productSearch.trim().toLowerCase()) ||
          p.category_name
            .toLowerCase()
            .includes(productSearch.trim().toLowerCase()) ||
          String(p.product_id).includes(productSearch.trim())
      )
    : neverOrderedProducts

  const formatCurrency = (amount: number) =>
    `$${Number(amount ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Analytics &amp; Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time revenue breakdown, category performance, top customers, and catalog health.
          </p>
        </div>

        {/* Section Tabs */}
        <div className="inline-flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-white border border-slate-200 shadow-2xs self-start lg:self-auto">
          {(
            [
              { id: 'overview', label: 'All Reports Overview' },
              { id: 'categories', label: 'Sales by Category' },
              { id: 'customers', label: 'Top Customers' },
              {
                id: 'unused-products',
                label: `Never Ordered (${neverOrderedTotal.toLocaleString()})`,
              },
            ] as { id: ActiveTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center justify-between"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-600 hover:text-rose-800 font-bold text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Total Category Revenue
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5">
            {loading ? '...' : formatCurrency(totalCategoryRevenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Across {salesByCategory.length} product categories
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Total Units Sold
          </div>
          <div className="text-2xl font-extrabold text-indigo-600 mt-1.5">
            {loading ? '...' : totalUnitsSold.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Cumulative item quantity ordered
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            12-Month Order Volume
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1.5">
            {loading ? '...' : total12MoOrders.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            12-Mo Revenue: {formatCurrency(total12MoRevenue)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Never-Ordered Products
          </div>
          <div className="text-2xl font-extrabold text-amber-600 mt-1.5">
            {loading ? '...' : neverOrderedTotal.toLocaleString()}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Products with zero order items
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <div className="inline-flex items-center gap-3 text-sm font-medium text-slate-600">
            <span className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            Generating reports...
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Monthly Sales Report (GET /reports/monthly-sales) */}
          {activeTab === 'overview' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Monthly Sales Trend (Last 12 Months)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Monthly order volume and total revenue from{' '}
                    <span className="font-mono">GET /reports/monthly-sales</span>
                  </p>
                </div>
                <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                  {monthlySales.length} Months Recorded
                </span>
              </div>

              {monthlySales.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No monthly sales data available.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Visual Bar Chart */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-3 pt-4 items-end">
                    {monthlySales.map((m) => {
                      const heightPct = Math.max(
                        8,
                        Math.round((m.revenue / maxMonthlyRevenue) * 100)
                      )
                      return (
                        <div
                          key={m.month}
                          className="flex flex-col items-center p-2.5 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition"
                        >
                          <div className="text-[11px] font-bold text-slate-800 truncate max-w-full">
                            {formatCurrency(m.revenue)}
                          </div>
                          <div className="text-[10px] text-slate-400 mb-2">
                            {m.order_count.toLocaleString()} ord
                          </div>
                          <div className="w-full h-28 bg-slate-200/70 rounded-lg flex items-end overflow-hidden p-1">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full rounded-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all"
                            />
                          </div>
                          <div className="mt-2 font-mono text-xs font-bold text-slate-700">
                            {m.month}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Monthly Sales Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4 sm:px-6">Month</th>
                          <th className="py-3 px-4 sm:px-6 text-right">
                            Order Count
                          </th>
                          <th className="py-3 px-4 sm:px-6 text-right">
                            Revenue
                          </th>
                          <th className="py-3 px-4 sm:px-6 text-right">
                            Avg Order Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/80 text-sm">
                        {monthlySales.map((m) => (
                          <tr
                            key={m.month}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3 px-4 sm:px-6 font-mono font-semibold text-indigo-600">
                              {m.month}
                            </td>
                            <td className="py-3 px-4 sm:px-6 text-right font-medium text-slate-800">
                              {m.order_count.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 sm:px-6 text-right font-bold text-slate-900">
                              {formatCurrency(m.revenue)}
                            </td>
                            <td className="py-3 px-4 sm:px-6 text-right text-slate-600">
                              {m.order_count > 0
                                ? formatCurrency(
                                    Math.round(m.revenue / m.order_count)
                                  )
                                : '$0'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Sales by Category & 3. Top Customers Grid */}
          <div
            className={`grid grid-cols-1 ${
              activeTab === 'overview' ? 'xl:grid-cols-2' : ''
            } gap-6`}
          >
            {/* Sales by Category (GET /reports/sales-by-category) */}
            {(activeTab === 'overview' || activeTab === 'categories') && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Sales by Category
                    </h2>
                    <p className="text-xs text-slate-500">
                      Units sold and revenue per category (
                      <span className="font-mono">
                        GET /reports/sales-by-category
                      </span>
                      )
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                    {salesByCategory.length} Categories
                  </span>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4 sm:px-6">Category</th>
                        <th className="py-3 px-4 sm:px-6 text-right">
                          Qty Sold
                        </th>
                        <th className="py-3 px-4 sm:px-6 text-right">
                          Total Revenue
                        </th>
                        <th className="py-3 px-4 sm:px-6 w-36">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 text-sm">
                      {salesByCategory.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-10 text-center text-slate-500"
                          >
                            No category sales data found.
                          </td>
                        </tr>
                      ) : (
                        salesByCategory.map((cat) => {
                          const sharePct =
                            totalCategoryRevenue > 0
                              ? (cat.total_revenue / totalCategoryRevenue) * 100
                              : 0
                          const barPct = Math.round(
                            (cat.total_revenue / maxCategoryRevenue) * 100
                          )
                          return (
                            <tr
                              key={cat.category_id}
                              className="hover:bg-slate-50/80 transition-colors"
                            >
                              <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                                <div className="font-semibold text-slate-900">
                                  {cat.category_name}
                                </div>
                                <div className="text-xs font-mono text-slate-400">
                                  ID #{cat.category_id}
                                </div>
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-medium text-slate-700">
                                {cat.total_quantity_sold.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-bold text-slate-900">
                                {formatCurrency(cat.total_revenue)}
                              </td>
                              <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      style={{ width: `${barPct}%` }}
                                      className="h-full bg-indigo-600 rounded-full"
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-slate-500">
                                    {sharePct.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top Customers (GET /reports/top-customers?limit=N) */}
            {(activeTab === 'overview' || activeTab === 'customers') && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
                <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Top Customers
                    </h2>
                    <p className="text-xs text-slate-500">
                      Ranked by total spent on paid &amp; shipped orders
                    </p>
                  </div>

                  {/* Limit Selector (1-100) */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <label
                      htmlFor="top-customers-limit"
                      className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Limit
                    </label>
                    <select
                      id="top-customers-limit"
                      value={topCustomersLimit}
                      onChange={(e) =>
                        setTopCustomersLimit(Number(e.target.value))
                      }
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
                    >
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                      <option value={25}>Top 25</option>
                      <option value={50}>Top 50</option>
                      <option value={100}>Top 100</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4 sm:px-6">Rank</th>
                        <th className="py-3 px-4 sm:px-6">Customer</th>
                        <th className="py-3 px-4 sm:px-6">City</th>
                        <th className="py-3 px-4 sm:px-6 text-center">
                          Orders
                        </th>
                        <th className="py-3 px-4 sm:px-6 text-right">
                          Total Spent
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 text-sm">
                      {loadingCustomers ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-slate-500"
                          >
                            Loading top customers...
                          </td>
                        </tr>
                      ) : topCustomers.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-10 text-center text-slate-500"
                          >
                            No top customer records found.
                          </td>
                        </tr>
                      ) : (
                        topCustomers.map((cust, index) => (
                          <tr
                            key={cust.customer_id}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                                  index === 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : index === 1
                                      ? 'bg-slate-200 text-slate-800'
                                      : index === 2
                                        ? 'bg-orange-100 text-orange-800'
                                        : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {index + 1}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">
                                {cust.customer_name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {cust.customer_email}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-slate-600">
                              {cust.customer_city}
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 text-center whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs">
                                {cust.order_count}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-bold text-emerald-700">
                              {formatCurrency(cust.total_spent)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 4. Never-Ordered Products (GET /reports/never-ordered-products) */}
          {(activeTab === 'overview' || activeTab === 'unused-products') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Never-Ordered Products
                  </h2>
                  <p className="text-xs text-slate-500">
                    Catalog products that have never appeared in any customer order (
                    <span className="font-mono">
                      GET /reports/never-ordered-products
                    </span>
                    )
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter by product or category..."
                    className="w-full sm:w-64 px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold whitespace-nowrap">
                    {filteredNeverOrdered.length} / {neverOrderedTotal} Products
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3 px-4 sm:px-6">Product ID</th>
                      <th className="py-3 px-4 sm:px-6">Product Name</th>
                      <th className="py-3 px-4 sm:px-6">Category</th>
                      <th className="py-3 px-4 sm:px-6 text-right">
                        Unit Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 text-sm">
                    {filteredNeverOrdered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-10 text-center text-slate-500"
                        >
                          {neverOrderedTotal === 0
                            ? 'Every product in the catalog has been ordered at least once!'
                            : 'No products match your search filter.'}
                        </td>
                      </tr>
                    ) : (
                      filteredNeverOrdered.slice(0, 200).map((prod) => (
                        <tr
                          key={prod.product_id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-indigo-600">
                            #{prod.product_id}
                          </td>
                          <td className="py-3 px-4 sm:px-6 whitespace-nowrap font-semibold text-slate-900">
                            {prod.product_name}
                          </td>
                          <td className="py-3 px-4 sm:px-6 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                              {prod.category_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 sm:px-6 text-right whitespace-nowrap font-bold text-slate-900">
                            {formatCurrency(prod.price)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
