// Where candidateApiClient's 401 interceptor sends a candidate whose
// session token stopped being valid mid-flow (e.g. it expired) — there's
// no login page to send them back to instead, since a magic link is the
// only way in (see EnterInterview.tsx).
export default function LinkExpired() {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <p className="mb-1 text-lg font-semibold text-slate-100">Oturumunuzun süresi doldu</p>
        <p className="text-sm text-slate-400">
          Bu bağlantı artık geçerli değil. Yeni bir mülakat bağlantısı için lütfen İK ile iletişime geçin.
        </p>
      </div>
    </div>
  )
}
