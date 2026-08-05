import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

export default function CandidateProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('candidate_access_token')
  if (!token) {
    return <Navigate to="/interview/login" replace />
  }
  return children
}
