import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

export default function StatsPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';

  const [stats, setStats]   = useState([]);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/stats/drivers?period=${period}`).then(r => { setStats(r.data.stats); setLoading(false); });
  }, [period]);

  const deliveriesKey = isAr ? 'التوصيلات' : 'Livraisons';
  const revenueKey    = isAr ? 'الإيرادات' : 'Revenus';

  const chartData = stats.map(s => ({
    name: `${s.user?.firstName} ${s.user?.lastName?.[0]}.`,
    [deliveriesKey]: s.deliveries,
    [revenueKey]:    s.earnings,
  }));

  const PERIODS = [
    ['week', t.stat_week],
    ['month', t.stat_month],
    ['year', t.stat_year],
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{t.stat_title}</h1>
        <div style={{ display:'flex', gap:6 }}>
          {PERIODS.map(([v, l]) => (
            <button key={v} className={`btn-sm ${period===v?'btn-primary':''}`} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading-center"><div className="spinner"/></div> : (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            <div className="metric-card">
              <p className="mlabel">{t.stat_total_deliveries}</p>
              <p className="mvalue">{stats.reduce((s,d)=>s+d.deliveries,0)}</p>
            </div>
            <div className="metric-card">
              <p className="mlabel">{t.stat_total_revenue}</p>
              <p className="mvalue" style={{ color:'#3B6D11' }}>{stats.reduce((s,d)=>s+d.earnings,0).toLocaleString()}</p>
            </div>
            <div className="metric-card">
              <p className="mlabel">{t.stat_avg_rating}</p>
              <p className="mvalue" style={{ color:'#854F0B' }}>
                {stats.length ? (stats.reduce((s,d)=>s+(d.avgRating||0),0)/stats.length).toFixed(1) : '—'} ★
              </p>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div className="card">
              <p style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>{t.stat_deliveries_chart}</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize:11 }} />
                  <YAxis tick={{ fontSize:11 }} />
                  <Tooltip />
                  <Bar dataKey={deliveriesKey} fill="#534AB7" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <p style={{ fontSize:13, fontWeight:500, marginBottom:14 }}>{t.stat_revenue_chart}</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="name" tick={{ fontSize:11 }} />
                  <YAxis tick={{ fontSize:11 }} />
                  <Tooltip />
                  <Bar dataKey={revenueKey} fill="#3B6D11" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>{t.th_driver}</th><th>{t.th_zone}</th><th>{t.th_deliveries}</th>
                  <th>{t.th_revenue}</th><th>{t.th_avg_rating}</th><th>{t.th_success_rate}</th>
                </tr>
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
            {stats.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>{t.stat_no_data}</p>}
          </div>
        </>
      )}
    </div>
  );
}
