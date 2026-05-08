import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const statusInfo = {
  en_attente:['badge-amber','En attente'], diffuse:['badge-blue','Diffusé'],
  accepte:['badge-purple','Accepté'], en_preparation:['badge-blue','Préparation'],
  en_route:['badge-purple','En route'], livre:['badge-green','Livré'], annule:['badge-red','Annulé'],
};
function Badge({ s }) {
  const [cls, label] = statusInfo[s] || ['badge-amber', s];
  return <span className={`badge ${cls}`}>{label}</span>;
}

const SERVICES = ['nourriture','courses','colis','pharmacie'];
const ZONES    = ['Tevragh Zeïna','Ksar','Sebkha','El Mina','Riyadh','Dar Naim'];

export default function DashboardPage() {
  const [data, setData]           = useState(null);
  const [orderModal, setOrderModal] = useState(false);
  const [broadcastInfo, setBroadcastInfo] = useState(null); // résultat diffusion
  const [orderForm, setOrderForm] = useState({
    serviceType:'nourriture', notes:'',
    pickupAddress: { label:'', zone:'Tevragh Zeïna', lat:18.095, lng:-15.965 },
    deliveryAddress: { label:'', zone:'Ksar', lat:18.075, lng:-15.955 },
    distanceKm: 3, broadcastRadius: 2,
    items: [{ name:'', quantity:1, price:0 }],
  });
  const [creating, setCreating]   = useState(false);
  const socketRef = useRef(null);
  const navigate  = useNavigate();

  const setF = (k, v) => setOrderForm(p => ({ ...p, [k]: v }));

  const loadDashboard = () => api.get('/admin/dashboard').then(r => setData(r.data));

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 30000);

    const token = localStorage.getItem('token');
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_admin');

    socket.on('order_broadcasted', ({ order, nearbyDriversCount, driversNotified }) => {
      toast.success(`Commande diffusée à ${nearbyDriversCount} livreur(s) !`);
      setBroadcastInfo({ order, nearbyDriversCount, driversNotified });
      loadDashboard();
    });
    socket.on('new_order', ({ order, nearbyDriversCount }) => {
      if (nearbyDriversCount === 0) toast.error('Aucun livreur disponible dans le rayon !');
      loadDashboard();
    });
    socket.on('order_accepted', ({ driverName, driverSolde, orderId }) => {
      toast.success(`✅ ${driverName} a accepté la commande !`);
      loadDashboard();
    });
    socket.on('order_completed', ({ commission, driverEarning, newDriverSolde }) => {
      toast.success(`📦 Livraison terminée ! Commission : ${commission} MRU`);
      loadDashboard();
    });
    socket.on('order_status_update', () => loadDashboard());

    return () => { socket.disconnect(); clearInterval(interval); };
  }, []);

  const createOrder = async (e) => {
    e.preventDefault();
    const items = orderForm.items.filter(i => i.name && i.price > 0);
    if (items.length === 0) return toast.error('Ajoutez au moins un article avec un prix');
    setCreating(true);
    try {
      await api.post('/orders', { ...orderForm, items });
      setOrderModal(false);
      setOrderForm({
        serviceType:'nourriture', notes:'',
        pickupAddress: { label:'', zone:'Tevragh Zeïna', lat:18.095, lng:-15.965 },
        deliveryAddress: { label:'', zone:'Ksar', lat:18.075, lng:-15.955 },
        distanceKm:3, broadcastRadius:2,
        items:[{ name:'', quantity:1, price:0 }],
      });
      toast.success('Commande créée et diffusée aux livreurs !');
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
    finally { setCreating(false); }
  };

  const addItem    = () => setOrderForm(p => ({ ...p, items:[...p.items, { name:'', quantity:1, price:0 }] }));
  const removeItem = (i) => setOrderForm(p => ({ ...p, items: p.items.filter((_,idx) => idx !== i) }));
  const setItem    = (i, k, v) => setOrderForm(p => ({ ...p, items: p.items.map((it,idx) => idx===i ? {...it,[k]:v} : it) }));

  if (!data) return <div className="loading-center"><div className="spinner" /></div>;
  const { stats, recentOrders, onlineDrivers } = data;

  return (
    <div>
      <div className="page-header">
        <h1>Vue générale</h1>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#6b6b67' }}>
            {new Date().toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </span>
          <button className="btn-primary" onClick={() => setOrderModal(true)}>+ Nouvelle commande</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Livreurs actifs',   value:stats.activeDrivers,  sub:`sur ${stats.totalDrivers} total`, color:'#534AB7' },
          { label:'Commandes/jour',    value:stats.todayOrders,     sub:`${stats.pendingOrders} en attente` },
          { label:'Revenus (MRU)',     value:stats.revenueToday.toLocaleString(), sub:"aujourd'hui", color:'#3B6D11' },
          { label:'Livrées',           value:stats.deliveredToday,  sub:"aujourd'hui", color:'#3B6D11' },
        ].map(c => (
          <div key={c.label} className="metric-card">
            <p className="mlabel">{c.label}</p>
            <p className="mvalue" style={c.color?{color:c.color}:{}}>{c.value}</p>
            {c.sub && <p style={{ fontSize:11, color:'#6b6b67', marginTop:2 }}>{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Broadcast info */}
      {broadcastInfo && (
        <div style={{ background:'#EEEDFE', border:'.5px solid #AFA9EC', borderRadius:12, padding:14, marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontSize:13, fontWeight:500, color:'#3C3489' }}>
              📡 Commande diffusée à {broadcastInfo.nearbyDriversCount} livreur(s) dans le rayon
            </p>
            <button className="btn-sm" onClick={() => setBroadcastInfo(null)}>×</button>
          </div>
          {broadcastInfo.driversNotified?.map(d => (
            <div key={d.id} style={{ display:'flex', gap:12, marginTop:8, fontSize:12, color:'#534AB7' }}>
              <span>{d.name}</span>
              <span>{d.distance} km</span>
              <span>Solde : {d.solde} MRU</span>
              <span style={{ color: d.canAccept?'#3B6D11':'#A32D2D' }}>{d.canAccept?'✅ Peut accepter':'❌ Solde insuffisant'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <h2 style={{ fontSize:14, fontWeight:500 }}>Dernières commandes</h2>
            <button className="btn-sm" onClick={() => navigate('/orders')}>Voir tout</button>
          </div>
          <table>
            <thead><tr><th>#</th><th>Service</th><th>Client</th><th>Statut</th></tr></thead>
            <tbody>
              {recentOrders.slice(0,6).map(o => (
                <tr key={o._id} style={{ cursor:'pointer' }} onClick={() => navigate(`/orders/${o._id}/track`)}>
                  <td style={{ color:'#6b6b67', fontFamily:'monospace' }}>#{o._id.slice(-4).toUpperCase()}</td>
                  <td style={{ textTransform:'capitalize' }}>{o.serviceType}</td>
                  <td>{o.client?.firstName} {o.client?.lastName?.[0]}.</td>
                  <td><Badge s={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <h2 style={{ fontSize:14, fontWeight:500 }}>Livreurs en ligne</h2>
            <button className="btn-sm" onClick={() => navigate('/drivers')}>Gérer soldes</button>
          </div>
          <table>
            <thead><tr><th>Livreur</th><th>Zone</th><th>Solde</th><th>Statut</th></tr></thead>
            <tbody>
              {onlineDrivers.length === 0
                ? <tr><td colSpan={4} style={{ textAlign:'center', color:'#6b6b67' }}>Aucun livreur en ligne</td></tr>
                : onlineDrivers.map(d => (
                  <tr key={d._id}>
                    <td>{d.user?.firstName} {d.user?.lastName}</td>
                    <td>{d.zone}</td>
                    <td style={{ color: (d.solde||0)>0?'#3B6D11':'#A32D2D', fontWeight:500 }}>{(d.solde||0).toLocaleString()} MRU</td>
                    <td><span className={`badge ${d.status==='actif'?'badge-green':'badge-amber'}`}>{d.status==='actif'?'Actif':'Pause'}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal créer commande */}
      {orderModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, overflowY:'auto', padding:20 }}>
          <div className="card" style={{ width:520, maxHeight:'90vh', overflowY:'auto', padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h2 style={{ fontSize:16 }}>Créer une commande</h2>
              <button onClick={() => setOrderModal(false)}>×</button>
            </div>
            <form onSubmit={createOrder}>
              {/* Service */}
              <div className="form-group">
                <label>Type de service</label>
                <select value={orderForm.serviceType} onChange={e => setF('serviceType', e.target.value)}>
                  {SERVICES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>

              {/* Articles */}
              <div className="form-group">
                <label>Articles</label>
                {orderForm.items.map((item, i) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:6, marginBottom:6 }}>
                    <input placeholder="Nom article" value={item.name} onChange={e => setItem(i,'name',e.target.value)} />
                    <input type="number" placeholder="Qté" value={item.quantity} min="1" onChange={e => setItem(i,'quantity',+e.target.value)} />
                    <input type="number" placeholder="Prix MRU" value={item.price} min="0" onChange={e => setItem(i,'price',+e.target.value)} />
                    <button type="button" onClick={() => removeItem(i)} style={{ color:'#A32D2D', padding:'4px 8px' }}>×</button>
                  </div>
                ))}
                <button type="button" className="btn-sm" onClick={addItem}>+ Article</button>
              </div>

              {/* Adresses */}
              <div className="form-row">
                <div className="form-group">
                  <label>Zone de retrait</label>
                  <select value={orderForm.pickupAddress.zone} onChange={e => setF('pickupAddress',{...orderForm.pickupAddress, zone:e.target.value})}>
                    {ZONES.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Zone de livraison</label>
                  <select value={orderForm.deliveryAddress.zone} onChange={e => setF('deliveryAddress',{...orderForm.deliveryAddress, zone:e.target.value})}>
                    {ZONES.map(z => <option key={z}>{z}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Distance estimée (km)</label>
                  <input type="number" min="0.5" step="0.5" value={orderForm.distanceKm}
                    onChange={e => setF('distanceKm', +e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Rayon de diffusion (km)</label>
                  <input type="number" min="1" max="10" value={orderForm.broadcastRadius}
                    onChange={e => setF('broadcastRadius', +e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <input type="text" value={orderForm.notes} onChange={e => setF('notes', e.target.value)} placeholder="Instructions spéciales..." />
              </div>

              {/* Résumé tarification */}
              <div style={{ background:'#F7F6F2', borderRadius:8, padding:12, marginBottom:16, fontSize:12 }}>
                <p style={{ color:'#6b6b67', marginBottom:4 }}>
                  Solde minimum requis pour les livreurs : <strong style={{ color:'#534AB7' }}>
                    20% du total commande
                  </strong>
                </p>
                <p style={{ color:'#6b6b67' }}>
                  Seuls les livreurs dans {orderForm.broadcastRadius} km et avec le solde suffisant recevront la commande.
                </p>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button type="submit" className="btn-primary" style={{ flex:1 }} disabled={creating}>
                  {creating ? 'Création...' : '📡 Créer et diffuser'}
                </button>
                <button type="button" onClick={() => setOrderModal(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
