import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const STATUS_MAP = {
  en_attente:     ['#854F0B','En attente'],
  diffuse:        ['#185FA5','Diffusé'],
  accepte:        ['#534AB7','Accepté'],
  en_preparation: ['#185FA5','Préparation'],
  en_route:       ['#534AB7','En route'],
  livre:          ['#3B6D11','Livré'],
  annule:         ['#A32D2D','Annulé'],
};

const SERVICE_ICONS = { nourriture:'🍔', courses:'🛒', colis:'📦', pharmacie:'💊' };

function ContactBtn({ href, label, color }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 8px',
        borderRadius:6, fontSize:11, fontWeight:500, textDecoration:'none',
        background: color + '18', color, border:`1px solid ${color}40` }}>
      {label}
    </a>
  );
}

export default function AgentDashboardPage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/dashboard').then(r => { setData(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;

  const { stats = {}, recentOrders = [], onlineDrivers = [] } = data || {};
  const activeOrders = recentOrders.filter(o => ['en_attente','diffuse','accepte','en_preparation','en_route'].includes(o.status));

  return (
    <div>
      <div className="page-header">
        <h1>Tableau de bord</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-primary btn-sm" onClick={() => navigate('/orders/create')}>➕ Créer commande</button>
          <button className="btn-sm" onClick={() => navigate('/map')}>🗺️ Carte live</button>
        </div>
      </div>

      {/* Métriques */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <div className="metric-card">
          <p className="mlabel">Commandes actives</p>
          <p className="mvalue" style={{ color:'#534AB7' }}>{activeOrders.length}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Livreurs actifs</p>
          <p className="mvalue" style={{ color:'#3B6D11' }}>{stats.activeDrivers || 0}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Commandes aujourd'hui</p>
          <p className="mvalue">{stats.todayOrders || 0}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">En attente</p>
          <p className="mvalue" style={{ color:'#854F0B' }}>{stats.pendingOrders || 0}</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>

        {/* Commandes récentes */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'.5px solid rgba(0,0,0,0.09)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontWeight:500, fontSize:14 }}>Commandes récentes</p>
            <button className="btn-sm" onClick={() => navigate('/orders')}>Voir toutes →</button>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Service</th><th>Client</th><th>Chauffeur</th><th>Statut</th><th>Contacter</th></tr>
            </thead>
            <tbody>
              {recentOrders.map(o => {
                const [color, label] = STATUS_MAP[o.status] || ['#6b6b67', o.status];
                const clientPhone  = o.client?.phone;
                const driverPhone  = o.driver?.user?.phone;
                return (
                  <tr key={o._id}>
                    <td style={{ fontFamily:'monospace', color:'#6b6b67', fontSize:11 }}>#{o._id.slice(-6).toUpperCase()}</td>
                    <td>{SERVICE_ICONS[o.serviceType]}</td>
                    <td>
                      <p style={{ fontSize:12, fontWeight:500 }}>{o.client?.firstName} {o.client?.lastName}</p>
                      {clientPhone && <p style={{ fontSize:11, color:'#6b6b67' }}>{clientPhone}</p>}
                    </td>
                    <td>
                      {o.driver ? (
                        <>
                          <p style={{ fontSize:12 }}>{o.driver.user?.firstName} {o.driver.user?.lastName}</p>
                          {driverPhone && <p style={{ fontSize:11, color:'#6b6b67' }}>{driverPhone}</p>}
                        </>
                      ) : <span style={{ color:'#6b6b67', fontSize:12 }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:500, color, background:color+'18', padding:'2px 8px', borderRadius:20 }}>
                        {label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {clientPhone && (
                          <div style={{ display:'flex', gap:4 }}>
                            <ContactBtn href={`tel:${clientPhone}`} label="📞 Client" color="#3B6D11" />
                            <ContactBtn href={`https://wa.me/${clientPhone.replace(/\D/g,'')}`} label="WA" color="#25D366" />
                          </div>
                        )}
                        {driverPhone && (
                          <div style={{ display:'flex', gap:4 }}>
                            <ContactBtn href={`tel:${driverPhone}`} label="📞 Chauffeur" color="#534AB7" />
                            <ContactBtn href={`https://wa.me/${driverPhone.replace(/\D/g,'')}`} label="WA" color="#25D366" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recentOrders.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>Aucune commande</p>}
        </div>

        {/* Livreurs en ligne */}
        <div className="card">
          <p style={{ fontWeight:500, fontSize:14, marginBottom:12 }}>Livreurs en ligne ({onlineDrivers.length})</p>
          {onlineDrivers.length === 0
            ? <p style={{ fontSize:12, color:'#6b6b67', textAlign:'center', padding:12 }}>Aucun livreur actif</p>
            : onlineDrivers.map(d => (
              <div key={d._id} style={{ padding:'8px 0', borderBottom:'.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:12, fontWeight:500 }}>{d.user?.firstName} {d.user?.lastName}</p>
                    <p style={{ fontSize:11, color:'#6b6b67' }}>{d.zone} · {d.status === 'actif' ? '🟢 Actif' : '🟡 Pause'}</p>
                    {d.user?.phone && <p style={{ fontSize:11, color:'#6b6b67' }}>{d.user.phone}</p>}
                  </div>
                </div>
                {d.user?.phone && (
                  <div style={{ display:'flex', gap:4, marginTop:6 }}>
                    <ContactBtn href={`tel:${d.user.phone}`} label="📞 Appeler" color="#534AB7" />
                    <ContactBtn href={`https://wa.me/${d.user.phone.replace(/\D/g,'')}`} label="WhatsApp" color="#25D366" />
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
