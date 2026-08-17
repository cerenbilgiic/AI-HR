import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import CandidateProtectedRoute from './components/CandidateProtectedRoute'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import AdminLayout from './components/AdminLayout'
import Login from './pages/hr/Login'
import Dashboard from './pages/hr/Dashboard'
import JobPostings from './pages/hr/JobPostings'
import JobCreate from './pages/hr/JobCreate'
import JobDetail from './pages/hr/JobDetail'
import CandidateWorkspace from './pages/hr/CandidateWorkspace'
import CandidateImport from './pages/hr/CandidateImport'
import InterviewList from './pages/hr/InterviewList'
import InterviewDetail from './pages/hr/InterviewDetail'
import Reports from './pages/hr/Reports'
import Employees from './pages/hr/Employees'
import CandidateComparison from './pages/hr/CandidateComparison'
import HrNotifications from './pages/hr/Notifications'
import HrProfile from './pages/hr/Profile'
import HrSettings from './pages/hr/Settings'
import AdminLogin from './pages/admin/AdminLogin'
import AdminEmployees from './pages/admin/AdminEmployees'
import AdminAuditLog from './pages/admin/AdminAuditLog'
import EnterInterview from './pages/candidate/EnterInterview'
import LinkExpired from './pages/candidate/LinkExpired'
import Consent from './pages/candidate/Consent'
import AvatarSelection from './pages/candidate/AvatarSelection'
import Interview from './pages/candidate/Interview'

// The admin portal is a fully separate branch — own login, own token, own
// layout/sidebar (AdminLayout), own pages under pages/admin/. It shares no
// route or component with the HR/candidate branch below by design (see
// "admin ile hr panelini komple ayır" — the two panels are meant to be
// independently maintainable, not just role-filtered views of one shell).
function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin/employees"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminEmployees />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-log"
        element={
          <AdminProtectedRoute>
            <AdminLayout>
              <AdminAuditLog />
            </AdminLayout>
          </AdminProtectedRoute>
        }
      />
      <Route path="/admin" element={<Navigate to="/admin/employees" replace />} />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  )
}

function MainRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/hr/login" replace />} />

        <Route path="/hr/login" element={<Login />} />
        <Route path="/hr/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/hr/jobs" element={<ProtectedRoute><JobPostings /></ProtectedRoute>} />
        <Route path="/hr/jobs/new" element={<ProtectedRoute><JobCreate /></ProtectedRoute>} />
        <Route path="/hr/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
        <Route path="/hr/candidates" element={<ProtectedRoute><CandidateWorkspace /></ProtectedRoute>} />
        <Route path="/hr/candidates/import" element={<ProtectedRoute><CandidateImport /></ProtectedRoute>} />
        <Route path="/hr/candidates/:candidateId" element={<ProtectedRoute><CandidateWorkspace /></ProtectedRoute>} />
        <Route path="/hr/interviews" element={<ProtectedRoute><InterviewList /></ProtectedRoute>} />
        <Route path="/hr/interviews/:sessionId" element={<ProtectedRoute><InterviewDetail /></ProtectedRoute>} />
        <Route path="/hr/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/hr/reports/compare" element={<ProtectedRoute><CandidateComparison /></ProtectedRoute>} />
        <Route path="/hr/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
        <Route path="/hr/notifications" element={<ProtectedRoute><HrNotifications /></ProtectedRoute>} />
        <Route path="/hr/profile" element={<ProtectedRoute><HrProfile /></ProtectedRoute>} />
        <Route path="/hr/settings" element={<ProtectedRoute><HrSettings /></ProtectedRoute>} />

        {/* No candidate login/dashboard — a magic link emailed by HR
            (see invitation_service.send_interview_link) is the only way
            in, landing here and handing straight into consent. */}
        <Route path="/interview/enter/:token" element={<EnterInterview />} />
        <Route path="/interview/expired" element={<LinkExpired />} />
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
  )
}

function AppShell() {
  const location = useLocation()
  return location.pathname.startsWith('/admin') ? <AdminRoutes /> : <MainRoutes />
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
