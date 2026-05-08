import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const STATUS_MAP = { en_attente:['badge-amber','En attente'], accepte:['badge-purple','Accepté'],
  en_preparation:['badge-blue','Préparation'], en_route:['badge-purple','En route'],
  livre:['badge-green','Livré'], annule:['badge-red','Annulé'] };

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (filter) params.set('status', filter);
    api.get(`/orders?${params}`).then(r => {
      setOrders(r.data.orders); setTotal(r.data.total); setLoading(false);
    });
  }, [filter, page]);

  const SERVICE_ICONS = { nourriture:'🍔', courses:'🛒', colis:'📦', pharmacie:'💊' };

  return (
    <div>
      <div className="page-header">
        <h1>Commandes ({total})</h1>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {['','en_attente','en_route','livre','annule'].map(s => (
            <button key={s} className={`btn-sm ${filter===s?'btn-primary':''}`} onClick={() => { setFilter(s); setPage(1); }}>
              {s===''?'Toutes':STATUS_MAP[s]?.[1]||s}
            </button>
          ))}
          <button className="btn-primary btn-sm" style={{ whiteSpace:'nowrap' }} onClick={() => navigate('/orders/create')}>➕ Créer commande</button>
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? <div className="loading-center"><div className="spinner"/></div> : (
          <table>
            <thead>
              <tr><th>#</th><th>Service</th><th>Client</th><th>Livreur</th><th>Total</th><th>Date</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const [cls, label] = STATUS_MAP[o.status] || ['badge-amber', o.status];
                return (
                  <tr key={o._id}>
                    <td style={{ fontFamily:'monospace', color:'#6b6b67' }}>#{o._id.slice(-6).toUpperCase()}</td>
                    <td>{SERVICE_ICONS[o.serviceType]} {o.serviceType}</td>
                    <td>{o.client?.firstName} {o.client?.lastName?.[0]}.</td>
                    <td>{o.driver ? `${o.driver.user?.firstName} ${o.driver.user?.lastName?.[0]}.` : <span style={{color:'#6b6b67'}}>—</span>}</td>
                    <td style={{ fontWeight:500 }}>{o.pricing?.total?.toLocaleString()} MRU</td>
                    <td style={{ color:'#6b6b67' }}>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td>
                      {['accepte','en_preparation','en_route'].includes(o.status) && (
                        <button className="btn-sm" onClick={() => navigate(`/orders/${o._id}/track`)}>Suivre</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && orders.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>Aucune commande</p>}
      </div>

      {total > 20 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:16 }}>
          <button disabled={page===1} onClick={() => setPage(p=>p-1)}>←</button>
          <span style={{ fontSize:13, padding:'6px 12px' }}>Page {page} / {Math.ceil(total/20)}</span>
          <button disabled={page >= Math.ceil(total/20)} onClick={() => setPage(p=>p+1)}>→</button>
        </div>
      )}
    </div>
  );
}
