import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './stores/authStore';
import Layout           from './components/Layout';
import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/DashboardPage';
import AgentDashboardPage from './pages/AgentDashboardPage';
import DriversPage      from './pages/DriversPage';
import CreateDriverPage from './pages/CreateDriverPage';
import CreateAgentPage  from './pages/CreateAgentPage';
import OrdersPage       from './pages/OrdersPage';
import CreateOrderPage  from './pages/CreateOrderPage';
import TrackingPage     from './pages/TrackingPage';
import TarifsPage       from './pages/TarifsPage';
import StatsPage        from './pages/StatsPage';
import LiveMapPage         from './pages/LiveMapPage';
import PendingDriversPage    from './pages/PendingDriversPage';
import CancellationsPage   from './pages/CancellationsPage';
import SettingsPage        from './pages/SettingsPage';
import CreditSoldePage     from './pages/CreditSoldePage';

function Guard({ adminOnly = false, children }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && !['admin','agent'].includes(user.role)) return <Navigate to="/login" replace />;
  if (adminOnly && user && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function HomeRedirect() {
  const { user } = useAuthStore();
  if (!user) return null;
  return user.role === 'agent' ? <AgentDashboardPage /> : <DashboardPage />;
}

export default function App() {
  const { token, fetchMe } = useAuthStore();
  useEffect(() => { if (token) fetchMe(); }, [token]);

  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index                          element={<HomeRedirect />} />
          <Route path="map"                     element={<LiveMapPage />} />
          <Route path="orders"                  element={<OrdersPage />} />
          <Route path="orders/create"           element={<CreateOrderPage />} />
          <Route path="orders/:id/track"        element={<TrackingPage />} />
          {/* Admin uniquement */}
          <Route path="drivers"                 element={<Guard adminOnly><DriversPage /></Guard>} />
          <Route path="drivers/create"          element={<Guard adminOnly><CreateDriverPage /></Guard>} />
          <Route path="drivers/pending"         element={<Guard adminOnly><PendingDriversPage /></Guard>} />
          <Route path="agents/create"           element={<Guard adminOnly><CreateAgentPage /></Guard>} />
          <Route path="tarifs"                  element={<Guard adminOnly><TarifsPage /></Guard>} />
          <Route path="stats"                   element={<Guard adminOnly><StatsPage /></Guard>} />
          <Route path="cancellations"           element={<Guard adminOnly><CancellationsPage /></Guard>} />
          <Route path="settings"               element={<Guard adminOnly><SettingsPage /></Guard>} />
          <Route path="credit-solde"           element={<Guard adminOnly><CreditSoldePage /></Guard>} />
        </Route>
      </Routes>
    </>
  );
}
