import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/hr/Login'
import JobPostings from './pages/hr/JobPostings'
import JobDetail from './pages/hr/JobDetail'
import CandidateList from './pages/hr/CandidateList'
import InterviewReport from './pages/hr/InterviewReport'
import Invitation from './pages/candidate/Invitation'
import Consent from './pages/candidate/Consent'
import Interview from './pages/candidate/Interview'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/hr/login" replace />} />

          <Route path="/hr/login" element={<Login />} />
          <Route path="/hr/jobs" element={<JobPostings />} />
          <Route path="/hr/jobs/:jobId" element={<JobDetail />} />
          <Route path="/hr/candidates" element={<CandidateList />} />
          <Route path="/hr/reports/:sessionId" element={<InterviewReport />} />

          <Route path="/interview/:candidateId" element={<Invitation />} />
          <Route path="/interview/:candidateId/consent" element={<Consent />} />
          <Route path="/interview/:candidateId/start" element={<Interview />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
