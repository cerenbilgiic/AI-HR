import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CandidateProtectedRoute from './components/CandidateProtectedRoute'
import Login from './pages/hr/Login'
import AdminLogin from './pages/hr/AdminLogin'
import Dashboard from './pages/hr/Dashboard'
import JobPostings from './pages/hr/JobPostings'
import JobDetail from './pages/hr/JobDetail'
import CandidateWorkspace from './pages/hr/CandidateWorkspace'
import CandidateImport from './pages/hr/CandidateImport'
import InterviewList from './pages/hr/InterviewList'
import InterviewDetail from './pages/hr/InterviewDetail'
import Reports from './pages/hr/Reports'
import AuditLog from './pages/hr/AuditLog'
import Employees from './pages/hr/Employees'
import CandidateComparison from './pages/hr/CandidateComparison'
import HrNotifications from './pages/hr/Notifications'
import HrProfile from './pages/hr/Profile'
import HrSettings from './pages/hr/Settings'
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
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/hr/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/hr/jobs" element={<ProtectedRoute><JobPostings /></ProtectedRoute>} />
          <Route path="/hr/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
          <Route path="/hr/candidates" element={<ProtectedRoute><CandidateWorkspace /></ProtectedRoute>} />
          <Route path="/hr/candidates/import" element={<ProtectedRoute><CandidateImport /></ProtectedRoute>} />
          <Route path="/hr/candidates/:candidateId" element={<ProtectedRoute><CandidateWorkspace /></ProtectedRoute>} />
          <Route path="/hr/interviews" element={<ProtectedRoute><InterviewList /></ProtectedRoute>} />
          <Route path="/hr/interviews/:sessionId" element={<ProtectedRoute><InterviewDetail /></ProtectedRoute>} />
          <Route path="/hr/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/hr/reports/compare" element={<ProtectedRoute><CandidateComparison /></ProtectedRoute>} />
          <Route path="/hr/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
          <Route path="/hr/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
          <Route path="/hr/notifications" element={<ProtectedRoute><HrNotifications /></ProtectedRoute>} />
          <Route path="/hr/profile" element={<ProtectedRoute><HrProfile /></ProtectedRoute>} />
          <Route path="/hr/settings" element={<ProtectedRoute><HrSettings /></ProtectedRoute>} />

          <Route path="/interview/login" element={<CandidateLogin />} />
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
