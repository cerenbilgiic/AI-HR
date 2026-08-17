import apiClient from '../api/client'

type Listener = () => void

// Module-level singleton (not component state) — deliberately outlives any
// single page's component tree. The generate-report request was never
// actually cancelled by navigating to another HR sidebar tab (SPA routing
// doesn't abort in-flight requests, and the backend call keeps running
// server-side regardless) — only each page's own local "evaluatingId"
// state was lost on unmount, which made an evaluation still running in the
// background look like it had stopped, inviting a redundant re-click. This
// tracks in-progress sessions globally so every page showing a "Değerlendir"
// button (JobDetail.tsx, InterviewList.tsx) reflects the real state even
// after navigating away and back before it finishes.
const inProgress = new Set<number>()
const listeners = new Set<Listener>()
let version = 0

function notify() {
  version += 1
  listeners.forEach((listener) => listener())
}

export function subscribeToEvaluations(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getEvaluationsVersion(): number {
  return version
}

export function isEvaluating(sessionId: number): boolean {
  return inProgress.has(sessionId)
}

// Callers still get the request's success/failure to show their own error
// message — this only adds the cross-navigation in-progress tracking, it
// doesn't change the call's semantics otherwise.
export async function evaluateSession(sessionId: number): Promise<void> {
  if (inProgress.has(sessionId)) return
  inProgress.add(sessionId)
  notify()
  try {
    await apiClient.post(`/interviews/${sessionId}/generate-report`)
  } finally {
    inProgress.delete(sessionId)
    notify()
  }
}
