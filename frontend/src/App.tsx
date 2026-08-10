import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CandidateProtectedRoute from './components/CandidateProtectedRoute'
import Login from './pages/hr/Login'
import Dashboard from './pages/hr/Dashboard'
import JobPostings from './pages/hr/JobPostings'
import JobDetail from './pages/hr/JobDetail'
import CandidateList from './pages/hr/CandidateList'
import CandidateDetail from './pages/hr/CandidateDetail'
import InterviewDetail from './pages/hr/InterviewDetail'
import Invitation from './pages/candidate/Invitation'
import CandidateLogin from './pages/candidate/CandidateLogin'
import Consent from './pages/candidate/Consent'
import Interview from './pages/candidate/Interview'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/hr/login" replace />} />

          <Route path="/hr/login" element={<Login />} />
          <Route path="/hr/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/hr/jobs" element={<ProtectedRoute><JobPostings /></ProtectedRoute>} />
          <Route path="/hr/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
          <Route path="/hr/candidates" element={<ProtectedRoute><CandidateList /></ProtectedRoute>} />
          <Route path="/hr/candidates/:candidateId" element={<ProtectedRoute><CandidateDetail /></ProtectedRoute>} />
          <Route path="/hr/interviews/:sessionId" element={<ProtectedRoute><InterviewDetail /></ProtectedRoute>} />

          <Route path="/interview/login" element={<CandidateLogin />} />
          <Route path="/interview/:candidateId" element={<Invitation />} />
          <Route
            path="/interview/:candidateId/consent"
            element={<CandidateProtectedRoute><Consent /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/start"
            element={<CandidateProtectedRoute><Interview /></CandidateProtectedRoute>}
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
