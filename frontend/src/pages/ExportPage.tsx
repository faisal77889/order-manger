import { useState } from 'react'
import axios from 'axios'
import api from '../lib/axios'
import type { OrderStatus } from './OrdersPage'

interface ExportHistoryEntry {
  id: string
  status: 'all' | OrderStatus
  from_date: string
  to_date: string
  filename: string
  sizeBytes: number
  timestamp: string
}

export default function ExportPage() {
  const [status, setStatus] = useState<'all' | OrderStatus>('all')
  const [from_date, setFromDate] = useState('')
  const [to_date, setToDate] = useState('')

  const [exporting, setExporting] = useState(false)
  const [downloadedBytes, setDownloadedBytes] = useState(0)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [history, setHistory] = useState<ExportHistoryEntry[]>([])

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setDownloadedBytes(0)

    if (from_date && to_date && new Date(from_date) > new Date(to_date)) {
      setError("'from_date' cannot be greater than 'to_date'.")
      return
    }

    const params: Record<string, string> = {}
    if (status !== 'all') {
      params.status = status
    }
    if (from_date) {
      params.from_date = from_date
    }
    if (to_date) {
      params.to_date = to_date
    }

    setExporting(true)

    try {
      const response = await api.get('/export/orders', {
        params,
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.loaded) {
            setDownloadedBytes(progressEvent.loaded)
          }
        },
      })

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const suffixParts = ['orders_export']
      if (status !== 'all') suffixParts.push(status)
      if (from_date) suffixParts.push(`from_${from_date}`)
      if (to_date) suffixParts.push(`to_${to_date}`)
      const filename = `${suffixParts.join('_')}.csv`

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      setSuccessMessage(`Successfully exported and downloaded ${filename}`)
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          status,
          from_date: from_date || 'Any',
          to_date: to_date || 'Any',
          filename,
          sizeBytes: blob.size,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev,
      ])
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text()
            const parsed = JSON.parse(text)
            setError(parsed.error || parsed.message || 'Failed to export orders.')
          } catch {
            setError('Failed to export orders.')
          }
        } else {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to export orders.'
          )
        }
      } else {
        setError('An unexpected error occurred during CSV export.')
      }
    } finally {
      setExporting(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Export Orders CSV
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Stream filtered order records in 5,000-row chunks directly into a downloadable CSV file.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-600 shadow-2xs">
          Endpoint: <span className="font-bold text-indigo-600">GET /export/orders</span>
        </div>
      </div>

      {/* Alerts */}
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

      {successMessage && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center justify-between"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            className="text-emerald-600 hover:text-emerald-800 font-bold text-xs ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Export Filter Form */}
        <form
          onSubmit={handleExport}
          className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6"
        >
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Configure Export Filters
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Leave filters blank to export the entire orders table.
            </p>
          </div>

          {/* Status Pill Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Order Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {(
                [
                  { id: 'all', label: 'All Statuses' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'paid', label: 'Paid' },
                  { id: 'shipped', label: 'Shipped' },
                  { id: 'cancelled', label: 'Cancelled' },
                ] as { id: 'all' | OrderStatus; label: string }[]
              ).map((opt) => {
                const active = status === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStatus(opt.id)}
                    className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold capitalize transition cursor-pointer ${
                      active
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 bg-slate-50/60 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date Range Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="export_from_date"
                className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5"
              >
                From Date (Optional)
              </label>
              <input
                id="export_from_date"
                name="from_date"
                type="date"
                value={from_date}
                max={to_date || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <label
                htmlFor="export_to_date"
                className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5"
              >
                To Date (Optional)
              </label>
              <input
                id="export_to_date"
                name="to_date"
                type="date"
                value={to_date}
                min={from_date || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              />
            </div>
          </div>

          {/* Actions Row */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStatus('all')
                setFromDate('')
                setToDate('')
                setError('')
                setSuccessMessage('')
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition cursor-pointer self-start sm:self-auto"
            >
              Clear Filters
            </button>

            <button
              type="submit"
              disabled={exporting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 text-white text-sm font-semibold shadow-sm shadow-indigo-500/20 transition cursor-pointer disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Streaming CSV{' '}
                  {downloadedBytes > 0 ? `(${formatBytes(downloadedBytes)})` : '...'}
                </>
              ) : (
                <>
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
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  Download Orders CSV
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Column: CSV Output Specification Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              CSV Output Schema
            </h2>
            <p className="text-xs text-slate-500">
              The exported file (<span className="font-mono">orders_export.csv</span>) includes formula-injection protection and the following 7 columns:
            </p>

            <div className="flex flex-wrap gap-1.5">
              {[
                'id',
                'customer_id',
                'customer_name',
                'customer_email',
                'status',
                'order_date',
                'total_amount',
              ].map((col) => (
                <span
                  key={col}
                  className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono font-semibold text-slate-700"
                >
                  {col}
                </span>
              ))}
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Selected Status</span>
                <span className="font-mono font-bold text-indigo-600 uppercase">
                  {status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">From Date</span>
                <span className="font-mono text-slate-700">
                  {from_date || 'All Dates'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">To Date</span>
                <span className="font-mono text-slate-700">
                  {to_date || 'All Dates'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            Streamed in batches of 5,000 orders ordered by ID ascending.
          </div>
        </div>
      </div>

      {/* Session Export Downloads History */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              Recent Downloads in Session
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">File Name</th>
                  <th className="py-3 px-4 sm:px-6">Status Filter</th>
                  <th className="py-3 px-4 sm:px-6">Date Range</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Size</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 sm:px-6 font-mono text-xs font-semibold text-indigo-600">
                      {item.filename}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 capitalize font-medium text-slate-800">
                      {item.status}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-xs font-mono text-slate-600">
                      {item.from_date} &rarr; {item.to_date}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right font-semibold text-slate-700">
                      {formatBytes(item.sizeBytes)}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right text-xs text-slate-500">
                      {item.timestamp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
