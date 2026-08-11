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
import InterviewList from './pages/hr/InterviewList'
import InterviewDetail from './pages/hr/InterviewDetail'
import Reports from './pages/hr/Reports'
import HrNotifications from './pages/hr/Notifications'
import HrProfile from './pages/hr/Profile'
import HrSettings from './pages/hr/Settings'
import Invitation from './pages/candidate/Invitation'
import CandidateLogin from './pages/candidate/CandidateLogin'
import CandidateHome from './pages/candidate/CandidateHome'
import MyApplications from './pages/candidate/MyApplications'
import MyInterviews from './pages/candidate/MyInterviews'
import CompletedInterviews from './pages/candidate/CompletedInterviews'
import InterviewHistoryDetail from './pages/candidate/InterviewHistoryDetail'
import MyResults from './pages/candidate/MyResults'
import InterviewResultDetail from './pages/candidate/InterviewResultDetail'
import MyProfile from './pages/candidate/MyProfile'
import Notifications from './pages/candidate/Notifications'
import Settings from './pages/candidate/Settings'
import Consent from './pages/candidate/Consent'
import AvatarSelection from './pages/candidate/AvatarSelection'
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
          <Route path="/hr/interviews" element={<ProtectedRoute><InterviewList /></ProtectedRoute>} />
          <Route path="/hr/interviews/:sessionId" element={<ProtectedRoute><InterviewDetail /></ProtectedRoute>} />
          <Route path="/hr/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/hr/notifications" element={<ProtectedRoute><HrNotifications /></ProtectedRoute>} />
          <Route path="/hr/profile" element={<ProtectedRoute><HrProfile /></ProtectedRoute>} />
          <Route path="/hr/settings" element={<ProtectedRoute><HrSettings /></ProtectedRoute>} />

          <Route path="/interview/login" element={<CandidateLogin />} />
          <Route path="/interview/:candidateId" element={<Invitation />} />
          <Route
            path="/interview/:candidateId/home"
            element={<CandidateProtectedRoute><CandidateHome /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/applications"
            element={<CandidateProtectedRoute><MyApplications /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/interviews"
            element={<CandidateProtectedRoute><MyInterviews /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/completed"
            element={<CandidateProtectedRoute><CompletedInterviews /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/completed/:sessionId"
            element={<CandidateProtectedRoute><InterviewHistoryDetail /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/results"
            element={<CandidateProtectedRoute><MyResults /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/results/:sessionId"
            element={<CandidateProtectedRoute><InterviewResultDetail /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/profile"
            element={<CandidateProtectedRoute><MyProfile /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/notifications"
            element={<CandidateProtectedRoute><Notifications /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/home/settings"
            element={<CandidateProtectedRoute><Settings /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/consent"
            element={<CandidateProtectedRoute><Consent /></CandidateProtectedRoute>}
          />
          <Route
            path="/interview/:candidateId/avatar"
            element={<CandidateProtectedRoute><AvatarSelection /></CandidateProtectedRoute>}
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
