import axios from 'axios'
import { useEffect, useState } from 'react'
import { adminApiClient } from '../../api/client'
import { ROLE_LABELS } from '../../utils/roles'

interface HrUser {
  id: number
  email: string
  full_name: string
  role: string
}

// This page is only ever reached as an admin (see AdminProtectedRoute) —
// unlike pages/hr/Employees.tsx (hr_manager's version, scoped to granting
// only "hr"), an admin can grant any tier.
const ASSIGNABLE_ROLES = ['hr', 'hr_manager', 'admin']

interface EditForm {
  full_name: string
  email: string
  role: string
  password: string
}

function toEditForm(user: HrUser): EditForm {
  return { full_name: user.full_name, email: user.email, role: user.role, password: '' }
}

export default function AdminEmployees() {
  const [me, setMe] = useState<HrUser | null>(null)
  const [users, setUsers] = useState<HrUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ full_name: '', email: '', password: '', role: 'hr' })
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function load() {
    return Promise.all([adminApiClient.get<HrUser>('/users/me'), adminApiClient.get<HrUser[]>('/users')])
      .then(([meRes, usersRes]) => {
        setMe(meRes.data)
        setUsers(usersRes.data)
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setForbidden(true)
        } else {
          setError('Çalışanlar yüklenemedi. Lütfen tekrar deneyin.')
        }
      })
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    setAdding(true)
    setAddError(null)
    try {
      await adminApiClient.post('/users', addForm)
      setAddForm({ full_name: '', email: '', password: '', role: 'hr' })
      setShowAddForm(false)
      await load()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setAddError(typeof detail === 'string' ? detail : 'Çalışan eklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setAdding(false)
    }
  }

  function startEdit(user: HrUser) {
    setEditingId(user.id)
    setEditForm(toEditForm(user))
    setEditError(null)
  }

  async function handleSaveEdit(userId: number) {
    if (!editForm) return
    setSaving(true)
    setEditError(null)
    try {
      await adminApiClient.put(`/users/${userId}`, {
        full_name: editForm.full_name,
        email: editForm.email,
        role: editForm.role,
        ...(editForm.password ? { password: editForm.password } : {}),
      })
      setEditingId(null)
      setEditForm(null)
      await load()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setEditError(typeof detail === 'string' ? detail : 'Kaydedilemedi. Lütfen tekrar deneyin.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(user: HrUser) {
    if (!window.confirm(`${user.full_name} silinsin mi? Bu işlem geri alınamaz.`)) return
    try {
      await adminApiClient.delete(`/users/${user.id}`)
      await load()
    } catch (err) {
      const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined
      setError(typeof detail === 'string' ? detail : 'Çalışan silinemedi. Lütfen tekrar deneyin.')
    }
  }

  if (forbidden) {
    return <p className="text-sm font-medium text-rose-400">Bu sayfayı görüntüleme yetkiniz yok.</p>
  }
  if (error) return <p className="text-sm font-medium text-rose-400">{error}</p>
  if (!users || !me) return <p className="text-sm text-slate-500">Çalışanlar yükleniyor...</p>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">Çalışanlar</h2>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showAddForm ? 'Vazgeç' : '+ Yeni Çalışan Ekle'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-slate-100">Yeni Çalışan</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Ad Soyad"
              value={addForm.full_name}
              onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="email"
              placeholder="E-posta"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="password"
              placeholder="Şifre"
              value={addForm.password}
              onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select
              value={addForm.role}
              onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value }))}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200"
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          {addError && <p className="mt-2 text-sm font-medium text-rose-400">{addError}</p>}
          <button
            onClick={() => void handleAdd()}
            disabled={adding || !addForm.full_name || !addForm.email || !addForm.password}
            className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {adding ? 'Ekleniyor…' : 'Ekle'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-800/50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Ad Soyad</th>
              <th className="px-4 py-3">E-posta</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((user) => {
              const isSelf = user.id === me.id
              const isEditing = editingId === user.id

              if (isEditing && editForm) {
                return (
                  <tr key={user.id} className="bg-slate-800/40">
                    <td className="px-4 py-3">
                      <input
                        value={editForm.full_name}
                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        disabled={isSelf}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 disabled:opacity-50"
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="password"
                        placeholder="Yeni şifre (opsiyonel)"
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        className="mt-1.5 block w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void handleSaveEdit(user.id)}
                          disabled={saving}
                          className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {saving ? 'Kaydediliyor…' : 'Kaydet'}
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null)
                            setEditForm(null)
                          }}
                          className="rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                        >
                          Vazgeç
                        </button>
                      </div>
                      {editError && <p className="mt-1 text-xs font-medium text-rose-400">{editError}</p>}
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={user.id} className="hover:bg-slate-800">
                  <td className="px-4 py-3 text-slate-100">
                    {user.full_name}
                    {isSelf && <span className="ml-2 text-xs text-slate-500">(Siz)</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{user.email}</td>
                  <td className="px-4 py-3 text-slate-300">{ROLE_LABELS[user.role] ?? user.role}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(user)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-800"
                      >
                        Düzenle
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => void handleDelete(user)}
                          className="rounded border border-rose-500/30 px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  Henüz çalışan yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
