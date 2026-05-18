import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

function CallWAButtons({ phone, label }) {
  if (!phone) return <span style={{ color:'#6b6b67', fontSize:11 }}>—</span>;
  const clean = phone.replace(/\D/g, '');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      <p style={{ fontSize:11, color:'#6b6b67', marginBottom:2 }}>{phone}</p>
      <div style={{ display:'flex', gap:4 }}>
        <a href={`tel:${phone}`}
          style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#E6F1FB', color:'#185FA5', textDecoration:'none', fontWeight:500 }}>
          📞 {label}
        </a>
        <a href={`https://wa.me/${clean}`} target="_blank" rel="noreferrer"
          style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#E8F8EF', color:'#1a7a44', textDecoration:'none', fontWeight:500 }}>
          WA
        </a>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';

  const STATUS_MAP = {
    en_attente: ['badge-amber', t.s_en_attente],
    accepte:    ['badge-purple', t.s_accepte],
    en_preparation: ['badge-blue', t.s_en_preparation],
    en_route:   ['badge-purple', t.s_en_route],
    livre:      ['badge-green', t.s_livre],
    annule:     ['badge-red', t.s_annule],
  };

  const [orders, setOrders]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState('');
  const [page, setPage]       = useState(1);
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

  const FILTER_LABELS = {
    '': t.ord_all,
    en_attente: t.s_en_attente,
    en_route:   t.s_en_route,
    livre:      t.s_livre,
    annule:     t.s_annule,
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t.ord_title.replace('{n}', total)}</h1>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {['','en_attente','en_route','livre','annule'].map(s => (
            <button key={s} className={`btn-sm ${filter===s?'btn-primary':''}`} onClick={() => { setFilter(s); setPage(1); }}>
              {FILTER_LABELS[s] || s}
            </button>
          ))}
          <button className="btn-primary btn-sm" style={{ whiteSpace:'nowrap' }} onClick={() => navigate('/orders/create')}>{t.ord_create}</button>
        </div>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        {loading ? <div className="loading-center"><div className="spinner"/></div> : (
          <table>
            <thead>
              <tr><th>{t.th_hash}</th><th>{t.th_service}</th><th>{t.th_client}</th><th>{t.th_driver}</th><th>{t.th_total}</th><th>{t.th_date}</th><th>{t.th_status}</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const [cls, label] = STATUS_MAP[o.status] || ['badge-amber', o.status];
                return (
                  <tr key={o._id}>
                    <td style={{ fontFamily:'monospace', color:'#6b6b67' }}>#{o._id.slice(-6).toUpperCase()}</td>
                    <td>{SERVICE_ICONS[o.serviceType]} {o.serviceType}</td>
                    <td>
                      <p style={{ fontSize:12, fontWeight:500 }}>{o.client?.firstName} {o.client?.lastName}</p>
                      <CallWAButtons phone={o.client?.phone} label={t.ord_call_client} />
                    </td>
                    <td>
                      {o.driver ? (
                        <>
                          <p style={{ fontSize:12 }}>{o.driver.user?.firstName} {o.driver.user?.lastName}</p>
                          <CallWAButtons phone={o.driver?.user?.phone} label={t.ord_call_driver} />
                        </>
                      ) : <span style={{color:'#6b6b67'}}>—</span>}
                    </td>
                    <td style={{ fontWeight:500 }}>{o.pricing?.total?.toLocaleString()} MRU</td>
                    <td style={{ color:'#6b6b67' }}>{new Date(o.createdAt).toLocaleDateString(isAr ? 'ar' : 'fr-FR')}</td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td>
                      {['accepte','en_preparation','en_route'].includes(o.status) && (
                        <button className="btn-sm" onClick={() => navigate(`/orders/${o._id}/track`)}>{t.ord_track}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && orders.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>{t.ord_no_orders}</p>}
      </div>

      {total > 20 && (
        <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:16 }}>
          <button disabled={page===1} onClick={() => setPage(p=>p-1)}>{isAr ? '→' : '←'}</button>
          <span style={{ fontSize:13, padding:'6px 12px' }}>{t.ord_page.replace('{p}', page).replace('{total}', Math.ceil(total/20))}</span>
          <button disabled={page >= Math.ceil(total/20)} onClick={() => setPage(p=>p+1)}>{isAr ? '←' : '→'}</button>
        </div>
      )}
    </div>
  );
}
