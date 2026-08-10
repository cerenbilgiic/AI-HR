import { useNavigate } from 'react-router-dom'
import AIAvatar from '../../components/AIAvatar'

export default function Invitation() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <AIAvatar speaking={false} />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">You're invited to interview</h2>
        <p className="mb-6 text-sm text-gray-600">
          This AI-guided interview takes about 15 minutes. You'll need a working camera and
          microphone. Before we begin, we'll ask for your consent to record and evaluate your
          responses.
        </p>
        <ul className="mb-6 space-y-2 text-left text-sm text-gray-600">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">
              ✓
            </span>
            A quiet space with a working camera and microphone
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">
              ✓
            </span>
            About 15 minutes, uninterrupted
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">
              ✓
            </span>
            Your consent, given on the next screen
          </li>
        </ul>
        <button
          onClick={() => navigate('/interview/login')}
          className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          Get started
        </button>
      </div>
    </div>
  )
}
