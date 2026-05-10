import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppLayout from './components/layout/AppLayout'
import { LoadingPage } from './components/ui'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CompleteProfilePage from './pages/CompleteProfilePage'
import DashboardPage from './pages/DashboardPage'
import CreateTeamPage from './pages/CreateTeamPage'
import JoinTeamPage from './pages/JoinTeamPage'
import ProfilePage from './pages/ProfilePage'
import NotificationsPage from './pages/NotificationsPage'
import TeamDashboard from './pages/team/TeamDashboard'
import MembersPage from './pages/team/MembersPage'
import EventsPage from './pages/team/EventsPage'
import AttendancePage from './pages/team/AttendancePage'
import LeavesPage from './pages/team/LeavesPage'
import AnnouncementsPage from './pages/team/AnnouncementsPage'
import FinancePage from './pages/team/FinancePage'
import ReportsPage from './pages/team/ReportsPage'
import PlayersPage from './pages/team/PlayersPage'
import PointsPage from './pages/team/PointsPage'
import DMPage from './pages/team/DMPage'
import SeasonalPage from './pages/team/SeasonalPage'
import ChatPage from './pages/team/ChatPage'
import InvitePage from './pages/team/InvitePage'
import TeamSettingsPage from './pages/team/TeamSettingsPage'
import MatchesPage from './pages/team/MatchesPage'
import BestPlayerPage from './pages/team/BestPlayerPage'
import PermissionsPage from './pages/team/PermissionsPage'
import ArchivePage from './pages/team/ArchivePage'
import MyChildPage from './pages/team/MyChildPage'
import RegulationsPage from './pages/team/RegulationsPage'
import MedicalPage from './pages/team/MedicalPage'
import AdminLayout from './components/layout/AdminLayout'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminTeamsPage from './pages/admin/AdminTeamsPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingPage/>
  if (!user) return <Navigate to="/login" replace/>
  return <Outlet/>
}
function PublicOnly() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingPage/>
  if (user) return <Navigate to="/" replace/>
  return <Outlet/>
}
function JoinViaLink() {
  const code = window.location.pathname.split('/join/')[1] || ''
  return <Navigate to={`/join-team?code=${code}`} replace/>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnly/>}>
            <Route path="/login" element={<LoginPage/>}/>
            <Route path="/register" element={<RegisterPage/>}/>
          </Route>
          <Route path="/complete-profile" element={<CompleteProfilePage/>}/>
          <Route element={<RequireAuth/>}>
            <Route element={<AppLayout/>}>
              <Route path="/" element={<DashboardPage/>}/>
              <Route path="/create-team" element={<CreateTeamPage/>}/>
              <Route path="/join-team" element={<JoinTeamPage/>}/>
              <Route path="/profile" element={<ProfilePage/>}/>
              <Route path="/notifications" element={<NotificationsPage/>}/>
              <Route path="/team/:teamId" element={<TeamDashboard/>}/>
              <Route path="/team/:teamId/members" element={<MembersPage/>}/>
              <Route path="/team/:teamId/events" element={<EventsPage/>}/>
              <Route path="/team/:teamId/attendance" element={<AttendancePage/>}/>
              <Route path="/team/:teamId/leaves" element={<LeavesPage/>}/>
              <Route path="/team/:teamId/players" element={<PlayersPage/>}/>
              <Route path="/team/:teamId/points" element={<PointsPage/>}/>
              <Route path="/team/:teamId/chat" element={<ChatPage/>}/>
              <Route path="/team/:teamId/dm" element={<DMPage/>}/>
              <Route path="/team/:teamId/announcements" element={<AnnouncementsPage/>}/>
              <Route path="/team/:teamId/finance" element={<FinancePage/>}/>
              <Route path="/team/:teamId/reports" element={<ReportsPage/>}/>
              <Route path="/team/:teamId/seasonal" element={<SeasonalPage/>}/>
              <Route path="/team/:teamId/invite" element={<InvitePage/>}/>
              <Route path="/team/:teamId/settings" element={<TeamSettingsPage/>}/>
              <Route path="/team/:teamId/matches" element={<MatchesPage/>}/>
              <Route path="/team/:teamId/best-player" element={<BestPlayerPage/>}/>
              <Route path="/team/:teamId/permissions" element={<PermissionsPage/>}/>
              <Route path="/archive/:teamId" element={<ArchivePage/>}/>
              <Route path="/team/:teamId/my-child" element={<MyChildPage/>}/>
              <Route path="/team/:teamId/regulations" element={<RegulationsPage/>}/>
              <Route path="/team/:teamId/medical" element={<MedicalPage/>}/>
            </Route>
          </Route>
          <Route path="/join/:code" element={<JoinViaLink/>}/>
          {/* Platform Admin Panel */}
          <Route element={<RequireAuth/>}>
            <Route element={<AdminLayout/>}>
              <Route path="/admin" element={<AdminDashboardPage/>}/>
              <Route path="/admin/teams" element={<AdminTeamsPage/>}/>
              <Route path="/admin/users" element={<AdminUsersPage/>}/>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
