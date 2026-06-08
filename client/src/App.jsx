import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';

import Login from './pages/Login';
import Overview from './pages/manager/Overview';
import Requirements from './pages/manager/Requirements';
import RequirementDetail from './pages/manager/RequirementDetail';
import Vendors from './pages/manager/Vendors';
import Archive from './pages/manager/Archive';
import Compliance from './pages/manager/Compliance';
import AuditLog from './pages/manager/AuditLog';
import VendorPortal from './pages/vendor/VendorPortal';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/vendor/:token" element={<VendorPortal />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="requirements" element={<Requirements />} />
              <Route path="requirements/:id" element={<RequirementDetail />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="archive" element={<Archive />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="audit-log" element={<AuditLog />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
