import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';

export default function StatsPage() {
  const [stats, setStats] = useState([]);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/stats/drivers?period=${period}`).then(r => { setStats(r.data.stats); setLoading(false); });
  }, [period]);

  const chartData = stats.map(s => ({
    name: `${s.user?.firstName} ${s.user?.lastName?.[0]}.`,
    Livraisons: s.deliveries,
    Revenus: s.earnings,
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Statistiques</h1>
        <div style={{ display:'flex', gap:6 }}>
          {[['week','7 jours'],['month','Ce mois'],['year','Cette année']].map(([v,l]) => (
            <button key={v} className={`btn-sm ${period===v?'btn-primary':''}`} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            <div className="metric-card">
              <p className="mlabel">Total livraisons</p>
              <p className="mvalue">{stats.reduce((s,d)=>s+d.deliveries,0)}</p>
            </div>
            <div className="metric-card">
              <p className="mlabel">Revenus totaux (MRU)</p>
              <p className="mvalue" style={{ color:'#3B6D11' }}>{stats.reduce((s,d)=>s+d.earnings,0).toLocaleString()}</p>
            </div>
            <div className="metric-card">
              <p className="mlabel">Note moyenne</p>
              <p className="mvalue" style={{ color:'#854F0B' }}>
                {stats.length ? (stats.reduce((s,d)=>s+(d.avgRating||0),0)/stats.length).toFixed(1) : '—'} ★
              </p>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div className="card">
              <p style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Livraisons par livreur</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize:11 }} />
                  <YAxis tick={{ fontSize:11 }} />
                  <Tooltip />
                  <Bar dataKey="Livraisons" fill="#534AB7" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <p style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>Revenus par livreur (MRU)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize:11 }} />
                  <YAxis tick={{ fontSize:11 }} />
                  <Tooltip />
                  <Bar dataKey="Revenus" fill="#3B6D11" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table>
              <thead>
                <tr><th>Livreur</th><th>Zone</th><th>Livraisons</th><th>Revenus (MRU)</th><th>Note moy.</th><th>Taux succès</th></tr>
              </thead>
              <tbody>
                {stats.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:500 }}>{s.user?.firstName} {s.user?.lastName}</td>
                    <td>{s.driver?.zone}</td>
                    <td>{s.deliveries}</td>
                    <td style={{ color:'#3B6D11' }}>{s.earnings.toLocaleString()}</td>
                    <td style={{ color:'#854F0B' }}>{s.avgRating ? s.avgRating.toFixed(1) + ' ★' : '—'}</td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ flex:1, height:5, background:'#F1EFE8', borderRadius:99 }}>
                          <div style={{ width:`${Math.min(100, Math.round((s.deliveries / (stats[0]?.deliveries || 1)) * 100))}%`, height:'100%', background:'#534AB7', borderRadius:99 }} />
                        </div>
                        <span style={{ fontSize:11, color:'#6b6b67' }}>{Math.round((s.deliveries/(stats[0]?.deliveries||1))*100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>Aucune donnée pour cette période</p>}
          </div>
        </>
      )}
    </div>
  );
}
