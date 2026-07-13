import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/authContext.jsx';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminSignup from './pages/AdminSignup';
import VoterDashboard from './pages/VoterDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AuditorDashboard from './pages/AuditorDashboard';
import './App.css';

function ProtectedRoute({ children, allowedUserType }) {
  const { isAuthenticated, userType, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Loading...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (allowedUserType === 'admin') {
    const adminRoles = ['admin', 'super_admin', 'election_admin', 'voter_registry_admin'];
    if (!adminRoles.includes(userType)) {
      return <Navigate to={`/${userType}-dashboard`} />;
    }
  } else if (allowedUserType && userType !== allowedUserType) {
    return <Navigate to={`/${userType}-dashboard`} />;
  }
  
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/admin/signup" element={<AdminSignup />} />
            <Route 
              path="/voter-dashboard" 
              element={
                <ProtectedRoute allowedUserType="voter">
                  <VoterDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin-dashboard" 
              element={
                <ProtectedRoute allowedUserType="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/auditor-dashboard" 
              element={
                <ProtectedRoute allowedUserType="auditor">
                  <AuditorDashboard />
                </ProtectedRoute>
              } 
            />
            <Route path="/" element={<Navigate to="/login" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
