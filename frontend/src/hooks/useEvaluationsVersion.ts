import { useSyncExternalStore } from 'react'
import { getEvaluationsVersion, subscribeToEvaluations } from '../utils/evaluationTracker'

// Subscribing to this forces a re-render whenever any session's evaluation
// starts or finishes anywhere in the app — read evaluationTracker's
// isEvaluating(sessionId) inline during render for the actual per-row
// state (kept a plain function, not a hook, so it's safe to call inside a
// .map() over rows without breaking the Rules of Hooks).
export function useEvaluationsVersion(): number {
  return useSyncExternalStore(subscribeToEvaluations, getEvaluationsVersion)
}
