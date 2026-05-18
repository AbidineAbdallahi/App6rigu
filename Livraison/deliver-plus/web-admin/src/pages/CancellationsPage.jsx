import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}

export default function CancellationsPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/admin/orders/pending-cancellations')
      .then(r => { setOrders(r.data.orders || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socket.on('connect', () => socket.emit('join_admin'));
    socket.on('driver_cancellation_pending', () => load());
    return () => socket.disconnect();
  }, []);

  const releaseDriver = async (orderId) => {
    setReleasing(orderId);
    try {
      await api.post(`/admin/orders/${orderId}/release-driver`);
      setOrders(prev => prev.filter(o => o._id !== orderId));
    } catch (e) {
      alert(e.response?.data?.message || 'Erreur');
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>⚠️ Annulations livreurs ({orders.length})</h1>
        <button className="btn-sm btn-primary" onClick={load}>Actualiser</button>
      </div>

      {loading ? (
        <p style={{ color: '#6b6b67', padding: 24 }}>Chargement…</p>
      ) : orders.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: '#6b6b67', border: '.5px solid rgba(0,0,0,0.09)' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Aucune annulation en attente</p>
          <p style={{ fontSize: 13 }}>Tous les livreurs sont libres de recevoir des commandes.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {orders.map(order => {
            const driver = order.driver;
            const driverName = driver?.user ? `${driver.user.firstName} ${driver.user.lastName}` : '—';
            const driverPhone = driver?.user?.phone || '—';
            const clientName = order.client ? `${order.client.firstName} ${order.client.lastName}` : '—';
            const clientPhone = order.client?.phone || '—';
            return (
              <div key={order._id} style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1.5px solid #F5B041', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* Colonne commande */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: '#6b6b67', marginBottom: 4 }}>COMMANDE</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                    #{order._id.slice(-6).toUpperCase()} · {order.orderType === 'course' ? '🚖 Course' : '📦 Livraison'}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b6b67' }}>Annulé le {fmt(order.updatedAt)}</div>
                  <div style={{ fontSize: 12, color: '#6b6b67', marginTop: 2 }}>
                    Client : {clientName} · {clientPhone}
                  </div>
                </div>

                {/* Colonne livreur */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: '#6b6b67', marginBottom: 4 }}>LIVREUR</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{driverName}</div>
                  <div style={{ fontSize: 12, color: '#6b6b67' }}>{driverPhone}</div>
                </div>

                {/* Raison */}
                <div style={{ flex: 2, minWidth: 200 }}>
                  <div style={{ fontSize: 11, color: '#6b6b67', marginBottom: 4 }}>RAISON DE L'ANNULATION</div>
                  <div style={{ background: '#FFF8F0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#333', fontStyle: 'italic', border: '.5px solid #F5B041' }}>
                    "{order.cancellationReason || '—'}"
                  </div>
                </div>

                {/* Action */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    className="btn-primary"
                    style={{ background: '#27500A', borderColor: '#27500A', whiteSpace: 'nowrap', padding: '10px 18px' }}
                    disabled={releasing === order._id}
                    onClick={() => releaseDriver(order._id)}
                  >
                    {releasing === order._id ? 'Libération…' : '✅ Libérer le livreur'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
