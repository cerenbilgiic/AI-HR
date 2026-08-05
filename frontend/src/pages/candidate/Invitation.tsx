import { useNavigate } from 'react-router-dom'

export default function Invitation() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-lg text-center">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">You're invited to interview</h2>
      <p className="mb-6 text-sm text-gray-600">
        This AI-guided interview takes about 15 minutes. You'll need a working camera and
        microphone. Before we begin, we'll ask for your consent to record and evaluate your
        responses.
      </p>
      <button
        onClick={() => navigate('/interview/login')}
        className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
      >
        Get started
      </button>
    </div>
  )
}
