import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './stores/authStore';
import Layout           from './components/Layout';
import LoginPage        from './pages/LoginPage';
import DashboardPage    from './pages/DashboardPage';
import DriversPage      from './pages/DriversPage';
import CreateDriverPage from './pages/CreateDriverPage';
import OrdersPage       from './pages/OrdersPage';
import CreateOrderPage  from './pages/CreateOrderPage';
import TrackingPage     from './pages/TrackingPage';
import TarifsPage       from './pages/TarifsPage';
import StatsPage        from './pages/StatsPage';
import LiveMapPage      from './pages/LiveMapPage';

function Guard({ children }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user && user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
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
          <Route index                   element={<DashboardPage />} />
          <Route path="drivers"          element={<DriversPage />} />
          <Route path="drivers/create"   element={<CreateDriverPage />} />
          <Route path="orders"              element={<OrdersPage />} />
          <Route path="orders/create"     element={<CreateOrderPage />} />
          <Route path="orders/:id/track"  element={<TrackingPage />} />
          <Route path="tarifs"           element={<TarifsPage />} />
          <Route path="stats"            element={<StatsPage />} />
          <Route path="map"              element={<LiveMapPage />} />
        </Route>
      </Routes>
    </>
  );
}
