import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import GuestPage from './pages/GuestPage.jsx';
import StaffDashboard from './pages/StaffDashboard.jsx';
import KitchenDisplay from './pages/KitchenDisplay.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/t/:tableToken" element={<GuestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['waiter', 'manager', 'owner']}>
                <StaffDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute allowedRoles={['chef', 'manager', 'owner']}>
                <KitchenDisplay />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['owner', 'manager']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
