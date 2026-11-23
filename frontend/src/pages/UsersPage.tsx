import { useState, useEffect } from 'react'
import axios from 'axios'
import api from '../lib/axios'
import { useDebounce } from '../customHook/useDebounce'

export type UserRole = 'admin' | 'viewer'

export interface UserItem {
  id: number
  name: string
  email: string
  role: UserRole
  is_active: boolean
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt?: string
}

export interface UsersListResponse {
  users: UserItem[]
  items: UserItem[]
  page: number
  page_size: number
  total: number
  total_pages: number
  has_more: boolean
}

export interface StoredAuthUser {
  id: number
  name: string
  email: string
  role: UserRole
}

export function getStoredUser(): StoredAuthUser | null {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.role) {
      return parsed as StoredAuthUser
    }
  } catch {
    // ignore malformed localStorage entry
  }

  try {
    const token = localStorage.getItem('token')
    if (!token) return null
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]))
      if (payload && payload.role) {
        return {
          id: Number(payload.id),
          name: payload.name || payload.email || 'User',
          email: payload.email || '',
          role: payload.role === 'admin' ? 'admin' : 'viewer',
        }
      }
    }
  } catch {
    // ignore token decode errors
  }

  return null
}

export default function UsersPage() {
  const currentUser = getStoredUser()
  const isAdmin = currentUser?.role === 'admin'

  const [users, setUsers] = useState<UserItem[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all')
  const [page, setPage] = useState(1)
  const [page_size, setPageSize] = useState(20)

  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [draftEdits, setDraftEdits] = useState<
    Record<number, { role?: UserRole; is_active?: boolean }>
  >({})
  const [updatingIds, setUpdatingIds] = useState<Record<number, boolean>>({})

  const debouncedSearch = useDebounce((value: string) => {
    setQ(value)
    setPage(1)
  }, 300)

  useEffect(() => {
    if (!isAdmin) return

    let ignore = false

    const fetchUsers = async () => {
      setLoading(true)
      setError('')

      const params: Record<string, string | number> = {
        page,
        page_size,
      }

      if (q.trim()) {
        params.q = q.trim()
      }
      if (roleFilter !== 'all') {
        params.role = roleFilter
      }
      if (statusFilter !== 'all') {
        params.is_active = statusFilter
      }

      try {
        const response = await api.get<UsersListResponse>('/users', { params })
        if (ignore) return

        const data = response.data
        const list = data.users || data.items || []
        setUsers(list)
        setTotal(data.total ?? list.length)
        setTotalPages(Math.max(1, data.total_pages ?? 1))
        setHasMore(Boolean(data.has_more))
      } catch (err) {
        if (ignore) return
        if (axios.isAxiosError(err)) {
          setError(
            err.response?.data?.error ||
              err.response?.data?.message ||
              'Failed to fetch users.'
          )
        } else {
          setError('An unexpected error occurred while fetching users.')
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    fetchUsers()

    return () => {
      ignore = true
    }
  }, [isAdmin, page, page_size, q, roleFilter, statusFilter])

  const handlePatchUser = async (
    userId: number,
    payload: { role?: UserRole; is_active?: boolean }
  ) => {
    if (!isAdmin) return

    const hasRole = payload.role !== undefined
    const hasIsActive = payload.is_active !== undefined

    if (!hasRole && !hasIsActive) {
      setError("At least one of 'role' or 'is_active' must be provided.")
      return
    }

    setError('')
    setSuccessMessage('')
    setUpdatingIds((prev) => ({ ...prev, [userId]: true }))

    try {
      const response = await api.patch<{
        message: string
        user: UserItem
      }>(`/users/${userId}`, payload)

      const updated = response.data.user
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...updated } : u))
      )
      setDraftEdits((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })

      setSuccessMessage(
        response.data.message || 'User updated successfully.'
      )
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg =
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to update user.'
        setError(msg)
      } else {
        setError('An unexpected error occurred while updating user.')
      }
    } finally {
      setUpdatingIds((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const formatDate = (isoString: string | undefined) => {
    if (!isoString) return '—'
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

  if (!isAdmin) {
    return null
  }

  const startIndex = total === 0 ? 0 : (page - 1) * page_size + 1
  const endIndex = Math.min(page * page_size, total)

  return (
    <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Heading */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Users
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            View and manage user accounts, roles, and statuses.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs">
          Total Users:{' '}
          <span className="font-bold text-slate-900">
            {total.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-t-2xl border border-b-0 border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Search input (q) */}
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
              placeholder="Search user by name or email..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          {/* Right: Role & Account Status Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="user-role-filter"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                Role
              </label>
              <select
                id="user-role-filter"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as 'all' | UserRole)
                  setPage(1)
                }}
                className="w-full sm:w-40 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="user-status-filter"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap"
              >
                Status
              </label>
              <select
                id="user-status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as 'all' | 'true' | 'false')
                  setPage(1)
                }}
                className="w-full sm:w-44 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/60 text-sm font-medium text-slate-700 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="true">Active</option>
                <option value="false">Disabled</option>
              </select>
            </div>

            {(searchInput ||
              q ||
              roleFilter !== 'all' ||
              statusFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setQ('')
                  setRoleFilter('all')
                  setStatusFilter('all')
                  setPage(1)
                }}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition cursor-pointer whitespace-nowrap"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Banners */}
      {error && (
        <div
          role="alert"
          className="bg-rose-50 border-x border-t border-rose-200 px-4 py-3 text-sm text-rose-700 flex items-center justify-between"
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
          className="bg-emerald-50 border-x border-t border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center justify-between"
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

      {/* Responsive Table */}
      <div className="bg-white border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                  User ID
                </th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Name</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Email</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">Role</th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                  Status
                </th>
                <th className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                  Joined Date
                </th>
                <th className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-600">
                      <span className="w-4 h-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                      Loading users...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-slate-500 text-sm"
                  >
                    No users found matching the selected filters.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSaving = Boolean(updatingIds[user.id])
                  const isUserAdmin = user.role === 'admin'
                  const draft = draftEdits[user.id] || {}
                  const selectedRole = draft.role ?? user.role
                  const selectedActive = draft.is_active ?? user.is_active
                  const hasPendingChanges =
                    selectedRole !== user.role ||
                    selectedActive !== user.is_active

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap font-mono text-xs font-semibold text-indigo-600">
                        #{user.id}
                      </td>

                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap font-medium text-slate-900">
                        {user.name}
                      </td>

                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap text-slate-600">
                        {user.email}
                      </td>

                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize border ${
                            user.role === 'admin'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.role === 'admin'
                                ? 'bg-indigo-600'
                                : 'bg-amber-500'
                            }`}
                          />
                          {user.role}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            user.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.is_active
                                ? 'bg-emerald-500'
                                : 'bg-rose-500'
                            }`}
                          />
                          {user.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      <td className="py-4 px-4 sm:px-6 whitespace-nowrap text-slate-600">
                        {formatDate(user.createdAt)}
                      </td>

                      <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                        {isUserAdmin ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-2">
                            <select
                              aria-label={`Role for ${user.name}`}
                              value={selectedRole}
                              disabled={isSaving}
                              onChange={(e) => {
                                const newRole = e.target.value as UserRole
                                setDraftEdits((prev) => ({
                                  ...prev,
                                  [user.id]: {
                                    ...prev[user.id],
                                    role: newRole,
                                  },
                                }))
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer disabled:opacity-60"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                            </select>

                            <select
                              aria-label={`Status for ${user.name}`}
                              value={selectedActive ? 'true' : 'false'}
                              disabled={isSaving}
                              onChange={(e) => {
                                const newActive = e.target.value === 'true'
                                setDraftEdits((prev) => ({
                                  ...prev,
                                  [user.id]: {
                                    ...prev[user.id],
                                    is_active: newActive,
                                  },
                                }))
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer disabled:opacity-60"
                            >
                              <option value="true">Active</option>
                              <option value="false">Disabled</option>
                            </select>

                            {hasPendingChanges && (
                              <>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => {
                                    const payload: {
                                      role?: UserRole
                                      is_active?: boolean
                                    } = {}
                                    if (selectedRole !== user.role) {
                                      payload.role = selectedRole
                                    }
                                    if (selectedActive !== user.is_active) {
                                      payload.is_active = selectedActive
                                    }
                                    handlePatchUser(user.id, payload)
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
                                >
                                  {isSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() =>
                                    setDraftEdits((prev) => {
                                      const next = { ...prev }
                                      delete next[user.id]
                                      return next
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
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
              htmlFor="users_page_size"
              className="text-xs sm:text-sm font-medium text-slate-600"
            >
              Rows per page:
            </label>
            <select
              id="users_page_size"
              name="page_size"
              value={page_size}
              disabled={loading}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 cursor-pointer disabled:opacity-60"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={40}>40</option>
              <option value={60}>60</option>
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
