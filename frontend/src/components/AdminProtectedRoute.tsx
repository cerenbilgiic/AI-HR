import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

export default function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('admin_access_token')
  if (!token) {
    return <Navigate to="/admin/login" replace />
  }
  return children
}
