import { useState, useRef } from 'react'
import axios from 'axios'
import api from '../lib/axios'

export type ImportTable =
  | 'categories'
  | 'products'
  | 'customers'
  | 'orders'
  | 'order_items'

export interface TableConfig {
  id: ImportTable
  label: string
  description: string
  columns: string[]
  example: string
}

export interface TableMetrics {
  total_rows: number
  inserted: number
  updated_or_skipped: number
  failed: number
}

export interface ImportJobStatusResponse {
  job_id: string
  table: ImportTable | 'bundle'
  current_table?: ImportTable
  status: 'running' | 'done' | 'failed'
  total_rows: number
  inserted: number
  updated_or_skipped: number
  failed: number
  breakdown?: Record<ImportTable, TableMetrics>
  time_taken_seconds: number
  error_csv_url: string | null
  error_message?: string
}

const TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'categories',
    label: '1. Categories',
    description: 'Product categories catalog (categories.csv)',
    columns: ['id', 'name'],
    example: '1,Electronics',
  },
  {
    id: 'products',
    label: '2. Products',
    description: 'Products linked to categories (products.csv)',
    columns: ['id', 'category_id', 'name', 'price'],
    example: '1,1,Wireless Mouse,45',
  },
  {
    id: 'customers',
    label: '3. Customers',
    description: 'Customer profiles and cities (customers.csv)',
    columns: ['id', 'name', 'email', 'city', 'created_at'],
    example: '1,Aarav Sharma,aarav@example.com,Mumbai,2026-11-01',
  },
  {
    id: 'orders',
    label: '4. Orders',
    description: 'Customer order headers & totals (orders.csv)',
    columns: [
      'id',
      'customer_id',
      'status (pending|paid|shipped|cancelled)',
      'order_date',
      'total_amount (must equal sum of items)',
    ],
    example: '1,1,paid,2026-11-22T10:30:00Z,90',
  },
  {
    id: 'order_items',
    label: '5. Order Items',
    description: 'Line items belonging to orders (order_items.csv)',
    columns: ['id', 'order_id', 'product_id', 'quantity', 'unit_price'],
    example: '1,1,1,2,45',
  },
]

const STATUS_BADGE: Record<
  ImportJobStatusResponse['status'],
  { label: string; style: string; dot: string }
> = {
  running: {
    label: 'Running',
    style: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500 animate-pulse',
  },
  done: {
    label: 'Completed',
    style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  failed: {
    label: 'Failed',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
}

export default function ImportPage() {
  const [files, setFiles] = useState<Record<ImportTable, File | null>>({
    categories: null,
    products: null,
    customers: null,
    orders: null,
    order_items: null,
  })

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [currentJob, setCurrentJob] = useState<ImportJobStatusResponse | null>(
    null
  )
  const [jobHistory, setJobHistory] = useState<ImportJobStatusResponse[]>([])
  const [lookupJobId, setLookupJobId] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [downloadingErrors, setDownloadingErrors] = useState(false)

  const fileInputRefs = useRef<Record<ImportTable, HTMLInputElement | null>>({
    categories: null,
    products: null,
    customers: null,
    orders: null,
    order_items: null,
  })
  const multiFolderInputRef = useRef<HTMLInputElement | null>(null)

  const allFilesSelected = TABLE_CONFIGS.every((t) => files[t.id] !== null)
  const selectedCount = TABLE_CONFIGS.filter((t) => files[t.id] !== null).length

  const handleCheckStatus = async (jobId: string) => {
    if (!jobId) return
    setCheckingStatus(true)
    setError('')

    try {
      const res = await api.get<ImportJobStatusResponse>(
        `/import/jobs/${jobId}`
      )
      const updatedJob = res.data
      setCurrentJob(updatedJob)
      setJobHistory((prev) => {
        const exists = prev.some((j) => j.job_id === updatedJob.job_id)
        if (exists) {
          return prev.map((j) =>
            j.job_id === updatedJob.job_id ? updatedJob : j
          )
        }
        return [updatedJob, ...prev]
      })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to fetch job status.'
        setError(msg)
      } else {
        setError('Unable to fetch job status.')
      }
    } finally {
      setCheckingStatus(false)
    }
  }

  const validateSingleCsv = (chosen: File): string | null => {
    const isCsv =
      chosen.name.toLowerCase().endsWith('.csv') ||
      chosen.type === 'text/csv' ||
      chosen.type === 'application/vnd.ms-excel'

    if (!isCsv) {
      return `File "${chosen.name}" is not a .csv file.`
    }
    if (chosen.size > 100 * 1024 * 1024) {
      return `File "${chosen.name}" exceeds the 100 MB limit.`
    }
    return null
  }

  const handleSelectFileForTable = (table: ImportTable, chosen: File | null) => {
    setError('')
    setSuccessMessage('')
    if (!chosen) {
      setFiles((prev) => ({ ...prev, [table]: null }))
      return
    }

    const validationErr = validateSingleCsv(chosen)
    if (validationErr) {
      setError(validationErr)
      return
    }

    setFiles((prev) => ({ ...prev, [table]: chosen }))
  }

  const handleQuickMultiSelect = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError('')
    setSuccessMessage('')

    const updated: Partial<Record<ImportTable, File>> = {}
    for (const f of Array.from(fileList)) {
      const err = validateSingleCsv(f)
      if (err) {
        setError(err)
        return
      }
      const lower = f.name.toLowerCase()
      if (lower.includes('order_items') || lower.includes('orderitems')) {
        updated.order_items = f
      } else if (lower.includes('categories') || lower.includes('category')) {
        updated.categories = f
      } else if (lower.includes('products') || lower.includes('product')) {
        updated.products = f
      } else if (lower.includes('customers') || lower.includes('customer')) {
        updated.customers = f
      } else if (lower.includes('orders') || lower.includes('order')) {
        updated.orders = f
      }
    }

    setFiles((prev) => ({ ...prev, ...updated }))
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    const missing = TABLE_CONFIGS.filter((t) => !files[t.id]).map((t) => t.id)
    if (missing.length > 0) {
      setError(
        `Please select all 5 CSV files before starting the import. Missing: ${missing.join(', ')}`
      )
      return
    }

    const formData = new FormData()
    for (const t of TABLE_CONFIGS) {
      if (files[t.id]) {
        formData.append(t.id, files[t.id]!)
      }
    }

    setUploading(true)

    try {
      const response = await api.post<{
        message: string
        job_id: string
        table: 'bundle'
        status: 'running'
        status_url: string
      }>('/import/bulk', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      const { job_id, message } = response.data
      setSuccessMessage(
        message || 'All 5 CSV files queued for coordinated bundle import'
      )

      const initialJob: ImportJobStatusResponse = {
        job_id,
        table: 'bundle',
        status: 'running',
        total_rows: 0,
        inserted: 0,
        updated_or_skipped: 0,
        failed: 0,
        time_taken_seconds: 0,
        error_csv_url: null,
      }

      setCurrentJob(initialJob)
      setJobHistory((prev) => [initialJob, ...prev])
      setFiles({
        categories: null,
        products: null,
        customers: null,
        orders: null,
        order_items: null,
      })
      for (const t of TABLE_CONFIGS) {
        const ref = fileInputRefs.current[t.id]
        if (ref) ref.value = ''
      }
      if (multiFolderInputRef.current) {
        multiFolderInputRef.current.value = ''
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const backendMsg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to queue bulk import job.'
        setError(backendMsg)
      } else {
        setError('An unexpected error occurred during upload.')
      }
    } finally {
      setUploading(false)
    }
  }

  const handleLookupJob = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedId = lookupJobId.trim()
    if (!trimmedId) return
    await handleCheckStatus(trimmedId)
    setLookupJobId('')
  }

  const handleDownloadErrors = async (jobId: string, tableName?: string) => {
    setDownloadingErrors(true)
    setError('')
    try {
      const response = await api.get(`/import/jobs/${jobId}/errors`, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `${tableName || 'bundle'}_import_errors_${jobId}.csv`
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError('No error CSV found or failed to download error CSV.')
      } else {
        setError('Failed to download error CSV.')
      }
    } finally {
      setDownloadingErrors(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Coordinated 5-CSV Bundle Import
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload all 5 CSV files together. IDs are automatically remapped in memory and order totals are verified against order items.
          </p>
        </div>

        {/* Lookup Existing Job ID */}
        <form
          onSubmit={handleLookupJob}
          className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto"
        >
          <input
            type="text"
            value={lookupJobId}
            onChange={(e) => setLookupJobId(e.target.value)}
            placeholder="Check Job ID..."
            className="w-full sm:w-56 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 transition cursor-pointer whitespace-nowrap"
          >
            Track Job
          </button>
        </form>
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
            className="text-rose-500 hover:text-rose-700 font-bold text-xs ml-4 cursor-pointer"
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

      {/* Main Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols on desktop): 5 Required CSV File Slots */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                Select All 5 Required CSV Files ({selectedCount} / 5 Ready)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Import runs automatically in order: Categories &rarr; Products &rarr; Customers &rarr; Orders &rarr; Order Items
              </p>
            </div>

            <div>
              <input
                ref={multiFolderInputRef}
                type="file"
                multiple
                accept=".csv,text/csv"
                onChange={(e) => handleQuickMultiSelect(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => multiFolderInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition cursor-pointer whitespace-nowrap"
              >
                Auto-Select All 5 CSVs at Once
              </button>
            </div>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-3">
              {TABLE_CONFIGS.map((table) => {
                const chosenFile = files[table.id]
                return (
                  <div
                    key={table.id}
                    className={`rounded-xl border p-4 transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                      chosenFile
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {table.label}
                        </span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                          {table.id}.csv
                        </span>
                        {chosenFile && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Ready ({formatFileSize(chosenFile.size)})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Columns:{' '}
                        <span className="font-mono text-slate-700">
                          {table.columns.join(', ')}
                        </span>
                      </div>
                      {chosenFile && (
                        <div className="text-xs font-mono text-emerald-800 truncate">
                          Selected: {chosenFile.name}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        ref={(el) => {
                          fileInputRefs.current[table.id] = el
                        }}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) =>
                          handleSelectFileForTable(
                            table.id,
                            e.target.files?.[0] || null
                          )
                        }
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[table.id]?.click()}
                        className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
                      >
                        {chosenFile ? 'Change CSV' : 'Choose CSV'}
                      </button>
                      {chosenFile && (
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectFileForTable(table.id, null)
                            const ref = fileInputRefs.current[table.id]
                            if (ref) ref.value = ''
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-xs font-semibold text-rose-600 transition cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500">
                {allFilesSelected
                  ? 'All 5 files selected and ready for coordinated import.'
                  : `Please select ${5 - selectedCount} more CSV file(s) to enable import.`}
              </span>
              <button
                type="submit"
                disabled={!allFilesSelected || uploading}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 text-white font-semibold text-sm shadow-sm shadow-indigo-500/20 transition cursor-pointer disabled:cursor-not-allowed"
              >
                {uploading
                  ? 'Uploading All 5 CSVs...'
                  : 'Start Coordinated 5-File Import'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Job Progress Monitor */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Active Import Job
              </h2>
              {currentJob && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    STATUS_BADGE[currentJob.status].style
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      STATUS_BADGE[currentJob.status].dot
                    }`}
                  />
                  {STATUS_BADGE[currentJob.status].label}
                </span>
              )}
            </div>

            {!currentJob ? (
              <div className="py-12 text-center space-y-2">
                <div className="text-sm font-medium text-slate-600">
                  No active import job selected
                </div>
                <p className="text-xs text-slate-400">
                  Upload all 5 CSV files or enter a Job ID above to track real-time row insertion metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Mode</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {currentJob.table === 'bundle'
                        ? '5-CSV Bundle'
                        : currentJob.table}
                    </span>
                  </div>
                  {currentJob.current_table && currentJob.status === 'running' && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Current Step</span>
                      <span className="font-mono font-semibold text-blue-600">
                        {currentJob.current_table}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Job ID</span>
                    <span
                      className="font-mono text-slate-700 truncate max-w-44"
                      title={currentJob.job_id}
                    >
                      {currentJob.job_id}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-medium">Time Taken</span>
                    <span className="font-semibold text-slate-800">
                      {currentJob.time_taken_seconds ?? 0}s
                    </span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Total Rows
                    </div>
                    <div className="text-xl font-extrabold text-slate-900 mt-1">
                      {(currentJob.total_rows ?? 0).toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      Inserted
                    </div>
                    <div className="text-xl font-extrabold text-emerald-700 mt-1">
                      {(currentJob.inserted ?? 0).toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                      Skipped / Dup
                    </div>
                    <div className="text-xl font-extrabold text-amber-700 mt-1">
                      {(currentJob.updated_or_skipped ?? 0).toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                      Failed
                    </div>
                    <div className="text-xl font-extrabold text-rose-700 mt-1">
                      {(currentJob.failed ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Per-Table Breakdown if bundle */}
                {currentJob.breakdown && (
                  <div className="rounded-xl border border-slate-200 p-3 space-y-1.5 text-xs">
                    <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                      Per-Table Breakdown
                    </div>
                    {TABLE_CONFIGS.map((t) => {
                      const b = currentJob.breakdown?.[t.id]
                      if (!b) return null
                      return (
                        <div
                          key={t.id}
                          className="flex items-center justify-between text-[11px] border-t border-slate-100 pt-1"
                        >
                          <span className="font-mono text-slate-600">{t.id}</span>
                          <span className="text-slate-700">
                            <span className="text-emerald-700 font-semibold">
                              {b.inserted.toLocaleString()}
                            </span>{' '}
                            in /{' '}
                            <span className="text-rose-600 font-semibold">
                              {b.failed.toLocaleString()}
                            </span>{' '}
                            err
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {currentJob.error_message && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                    <span className="font-bold">Worker Error:</span>{' '}
                    {currentJob.error_message}
                  </div>
                )}

                {/* Check Live Status Button */}
                <button
                  type="button"
                  disabled={checkingStatus}
                  onClick={() => handleCheckStatus(currentJob.job_id)}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-400 text-white text-xs sm:text-sm font-semibold shadow-sm shadow-indigo-500/20 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg
                    className={`w-4 h-4 ${checkingStatus ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  {checkingStatus ? 'Checking Status...' : 'Check Live Status'}
                </button>

                {/* Download Error CSV Button if available */}
                {(currentJob.error_csv_url ||
                  currentJob.failed > 0 ||
                  currentJob.updated_or_skipped > 0) &&
                  currentJob.status === 'done' && (
                    <button
                      type="button"
                      disabled={downloadingErrors}
                      onClick={() =>
                        handleDownloadErrors(currentJob.job_id, currentJob.table)
                      }
                      className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2"
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
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                        />
                      </svg>
                      {downloadingErrors
                        ? 'Downloading Error CSV...'
                        : 'Download Rejected Rows CSV'}
                    </button>
                  )}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400">
            Click &ldquo;Check Live Status&rdquo; anytime to fetch the latest progress from GET /import/jobs/:job_id.
          </div>
        </div>
      </div>

      {/* Recent Jobs History Table */}
      {jobHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Session Import Jobs
            </h2>
            <span className="text-xs text-slate-500">
              Click a row to inspect job details
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Job ID</th>
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Mode</th>
                  <th className="py-3 px-4 sm:px-6 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Total Rows
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Inserted
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Skipped
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Failed
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Duration
                  </th>
                  <th className="py-3 px-4 sm:px-6 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm">
                {jobHistory.map((job) => (
                  <tr
                    key={job.job_id}
                    onClick={() => setCurrentJob(job)}
                    className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                      currentJob?.job_id === job.job_id ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-indigo-600">
                      {job.job_id}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-slate-800">
                      {job.table}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          STATUS_BADGE[job.status].style
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            STATUS_BADGE[job.status].dot
                          }`}
                        />
                        {STATUS_BADGE[job.status].label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-medium text-slate-700">
                      {(job.total_rows ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-semibold text-emerald-700">
                      {(job.inserted ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-semibold text-amber-700">
                      {(job.updated_or_skipped ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap font-semibold text-rose-700">
                      {(job.failed ?? 0).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap text-slate-600">
                      {job.time_taken_seconds ?? 0}s
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={checkingStatus}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCheckStatus(job.job_id)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                        >
                          Check Status
                        </button>
                        {job.status === 'done' &&
                        (job.error_csv_url ||
                          job.failed > 0 ||
                          job.updated_or_skipped > 0) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadErrors(job.job_id, job.table)
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                          >
                            Download CSV
                          </button>
                        ) : null}
                      </div>
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
