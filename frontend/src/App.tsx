import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ClientiPage } from './pages/clienti/ClientiPage';
import { VeicoliPage } from './pages/veicoli/VeicoliPage';
import { ScadenzePage } from './pages/scadenze/ScadenzePage';
import { PagamentiPage } from './pages/pagamenti/PagamentiPage';
import { ReportPage } from './pages/report/ReportPage';
import { TariffePage } from './pages/tariffe/TariffePage';
import { UtentiPage } from './pages/utenti/UtentiPage';
import { UpdatePrompt } from './components/UpdatePrompt';
import { Ruolo } from './types';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (user?.ruolo !== Ruolo.ADMIN) {
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clienti"
        element={
          <ProtectedRoute>
            <Layout>
              <ClientiPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/veicoli"
        element={
          <ProtectedRoute>
            <Layout>
              <VeicoliPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/scadenze"
        element={
          <ProtectedRoute>
            <Layout>
              <ScadenzePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pagamenti"
        element={
          <ProtectedRoute>
            <Layout>
              <PagamentiPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <Layout>
              <ReportPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tariffe"
        element={
          <ProtectedRoute>
            <Layout>
              <TariffePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/utenti"
        element={
          <AdminRoute>
            <Layout>
              <UtentiPage />
            </Layout>
          </AdminRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <UpdatePrompt />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
