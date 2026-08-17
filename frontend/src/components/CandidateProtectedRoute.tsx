import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

// There's no candidate login page to send them to — a candidate only ever
// gets a token via the magic link HR emails them (see EnterInterview.tsx).
// Reaching a candidate route with no token means that link was never
// followed, or it already ran out.
export default function CandidateProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem('candidate_access_token')
  if (!token) {
    return <Navigate to="/interview/expired" replace />
  }
  return children
}
