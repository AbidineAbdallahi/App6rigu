import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

export default function DriversPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';

  const [drivers, setDrivers]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [soldeModal, setSoldeModal]     = useState(null);
  const [soldeForm, setSoldeForm]       = useState({ montant:'', motif:'' });
  const [suspendModal, setSuspendModal] = useState(null);
  const [suspendRaison, setSuspendRaison] = useState('');
  const [typeModal, setTypeModal]       = useState(null);
  const navigate = useNavigate();

  const load = () => api.get('/drivers').then(r => { setDrivers(r.data.drivers); setLoading(false); });
  useEffect(() => { load(); }, []);

  const confirmSuspendAction = async () => {
    const { driver, action } = suspendModal;
    const newStatus = action === 'suspend' ? 'suspendu' : 'actif';
    try {
      await api.patch(`/admin/drivers/${driver._id}`, {
        status: newStatus,
        motif: suspendRaison || (action === 'suspend' ? 'Suspension admin' : 'Réactivation admin'),
      });
      toast.success(action === 'suspend'
        ? `🚫 ${driver.user?.firstName} ${isAr ? 'موقوف' : 'suspendu'}`
        : `✅ ${driver.user?.firstName} ${isAr ? 'نشط مجدداً' : 'réactivé'}`
      );
      setSuspendModal(null); setSuspendRaison(''); load();
    } catch { toast.error(isAr ? 'خطأ في التحديث' : 'Erreur lors de la mise à jour'); }
  };

  const submitSolde = async () => {
    if (!soldeForm.montant || isNaN(soldeForm.montant)) return toast.error(isAr ? 'مبلغ غير صحيح' : 'Montant invalide');
    try {
      const { data } = await api.post(`/admin/drivers/${soldeModal.driver._id}/solde`, {
        type: soldeModal.type,
        montant: Number(soldeForm.montant),
        motif: soldeForm.motif || (soldeModal.type === 'credit' ? 'Rechargement admin' : 'Déduction admin'),
      });
      toast.success(`${isAr ? 'تم تحديث الرصيد:' : 'Solde mis à jour :'} ${data.solde.toLocaleString()} MRU`);
      setSoldeModal(null); setSoldeForm({ montant:'', motif:'' }); load();
    } catch (err) { toast.error(err.response?.data?.message || (isAr ? 'خطأ' : 'Erreur')); }
  };

  const setDriverType = async (driver, driverType) => {
    try {
      await api.patch(`/admin/drivers/${driver._id}`, { driverType });
      toast.success(isAr ? `تم تحديث النوع: ${driverType || 'غير محدد'}` : `Type mis à jour : ${driverType || 'non défini'}`);
      setTypeModal(null); load();
    } catch { toast.error(isAr ? 'خطأ في التحديث' : 'Erreur lors de la mise à jour du type'); }
  };

  const sMap = { actif:'badge-green', pause:'badge-amber', hors_ligne:'badge-blue', suspendu:'badge-red' };
  const sLbl = { actif: t.s_actif, pause: t.s_pause, hors_ligne: t.s_hors_ligne, suspendu: t.s_suspendu };
  const typeColors = { course:'#3C3489', livraison:'#3B6D11' };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>{t.drv_title.replace('{n}', drivers.length)}</h1>
        <button className="btn-primary" onClick={() => navigate('/drivers/create')}>{t.drv_create}</button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>{t.th_driver}</th>
              <th>{t.th_zone}</th>
              <th>{t.th_type}</th>
              <th>{t.th_solde}</th>
              <th>{t.th_deliveries}</th>
              <th>{t.th_rating}</th>
              <th>{t.th_status}</th>
              <th>{t.th_actions}</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map(d => (
              <tr key={d._id} style={{ opacity: d.status === 'suspendu' ? 0.7 : 1 }}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{
                      width:32, height:32, borderRadius:'50%',
                      background: d.status === 'suspendu' ? '#FCEBEB' : '#EEEDFE',
                      color: d.status === 'suspendu' ? '#A32D2D' : '#3C3489',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:11, fontWeight:500, flexShrink:0
                    }}>
                      {d.user?.firstName?.[0]}{d.user?.lastName?.[0]}
                    </div>
                    <div>
                      <p style={{ fontWeight:500 }}>{d.user?.firstName} {d.user?.lastName}</p>
                      <p style={{ fontSize:11, color:'#6b6b67' }}>{d.user?.email}</p>
                    </div>
                  </div>
                </td>
                <td>{d.zone}</td>
                <td>
                  <button
                    className="btn-sm"
                    style={{
                      color: d.driverType ? typeColors[d.driverType] : '#6b6b67',
                      borderColor: d.driverType ? typeColors[d.driverType] : '#ccc',
                      fontWeight: d.driverType ? 600 : 400,
                    }}
                    onClick={() => setTypeModal(d)}
                  >
                    {d.driverType === 'course' ? t.drv_type_ride : d.driverType === 'livraison' ? t.drv_type_delivery : t.drv_set_type}
                  </button>
                </td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span style={{ fontWeight:500, color: (d.solde||0) > 0 ? '#3B6D11' : '#A32D2D' }}>
                      {(d.solde||0).toLocaleString()}
                    </span>
                    {d.status !== 'suspendu' && <>
                      <button className="btn-sm" style={{ padding:'2px 7px', color:'#3B6D11', borderColor:'#97C459' }}
                        onClick={() => { setSoldeModal({ driver:d, type:'credit' }); setSoldeForm({ montant:'', motif:'' }); }}>+</button>
                      <button className="btn-sm" style={{ padding:'2px 7px', color:'#A32D2D', borderColor:'#F09595' }}
                        onClick={() => { setSoldeModal({ driver:d, type:'debit' }); setSoldeForm({ montant:'', motif:'' }); }}>−</button>
                    </>}
                  </div>
                </td>
                <td>{d.stats?.totalDeliveries || 0}</td>
                <td style={{ color:'#854F0B' }}>{d.stats?.averageRating?.toFixed(1) || '—'} ★</td>
                <td><span className={`badge ${sMap[d.status]}`}>{sLbl[d.status]}</span></td>
                <td>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {d.status === 'suspendu' ? (
                      <button className="btn-sm" style={{ color:'#3B6D11', borderColor:'#97C459' }}
                        onClick={() => { setSuspendModal({ driver:d, action:'reactivate' }); setSuspendRaison(''); }}>
                        {t.drv_reactivate}
                      </button>
                    ) : (
                      <button className="btn-sm btn-danger"
                        onClick={() => { setSuspendModal({ driver:d, action:'suspend' }); setSuspendRaison(''); }}>
                        {t.drv_suspend}
                      </button>
                    )}
                    <button className="btn-sm" onClick={() => navigate('/map')} title={t.drv_map}>
                      {t.drv_map}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {drivers.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>{t.drv_no_drivers}</p>}
      </div>

      {/* Modal Type */}
      {typeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:380, padding:28 }}>
            <h2 style={{ fontSize:16, marginBottom:4 }}>{t.drv_type_modal_title}</h2>
            <p style={{ fontSize:13, color:'#6b6b67', marginBottom:20 }}>
              {typeModal.user?.firstName} {typeModal.user?.lastName} — {t.drv_zone.replace('{z}', typeModal.zone)}
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
              <button
                style={{ padding:14, borderRadius:12, border: typeModal.driverType === 'course' ? '2px solid #3C3489' : '1px solid #ddd', background: typeModal.driverType === 'course' ? '#EEEDFE' : '#fff', cursor:'pointer', textAlign:'left', fontWeight:600, color:'#3C3489', fontSize:14 }}
                onClick={() => setDriverType(typeModal, 'course')}>
                {t.drv_type_ride_desc}
              </button>
              <button
                style={{ padding:14, borderRadius:12, border: typeModal.driverType === 'livraison' ? '2px solid #3B6D11' : '1px solid #ddd', background: typeModal.driverType === 'livraison' ? '#EAF3DE' : '#fff', cursor:'pointer', textAlign:'left', fontWeight:600, color:'#3B6D11', fontSize:14 }}
                onClick={() => setDriverType(typeModal, 'livraison')}>
                {t.drv_type_delivery_desc}
              </button>
            </div>
            <button onClick={() => setTypeModal(null)} style={{ width:'100%' }}>{t.btn_cancel}</button>
          </div>
        </div>
      )}

      {/* Modal Suspendre / Réactiver */}
      {suspendModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:420, padding:28 }}>
            <h2 style={{ fontSize:16, marginBottom:8, color: suspendModal.action === 'suspend' ? '#A32D2D' : '#3B6D11' }}>
              {suspendModal.action === 'suspend' ? t.drv_suspend_modal_title : t.drv_reactivate_modal_title}
            </h2>
            <div style={{ background: suspendModal.action === 'suspend' ? '#FCEBEB' : '#EAF3DE', borderRadius:10, padding:12, marginBottom:16 }}>
              <p style={{ fontSize:14, fontWeight:500 }}>{suspendModal.driver.user?.firstName} {suspendModal.driver.user?.lastName}</p>
              <p style={{ fontSize:12, color:'#6b6b67', marginTop:2 }}>
                {suspendModal.driver.zone} · {t.f_solde} : {(suspendModal.driver.solde||0).toLocaleString()} MRU
              </p>
            </div>
            {suspendModal.action === 'suspend' && (
              <div style={{ background:'#FFF8F0', border:'.5px solid #F0C090', borderRadius:8, padding:10, marginBottom:16, fontSize:12, color:'#854F0B' }}>
                {t.drv_suspend_warning}
              </div>
            )}
            <div className="form-group">
              <label>{suspendModal.action === 'suspend' ? t.drv_suspend_reason : t.drv_reactivate_reason}</label>
              <textarea
                value={suspendRaison}
                onChange={e => setSuspendRaison(e.target.value)}
                placeholder={suspendModal.action === 'suspend' ? t.drv_suspend_ph : t.drv_reactivate_ph}
                rows={3} style={{ resize:'vertical' }}
              />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                style={{ flex:1, padding:10, background: suspendModal.action === 'suspend' ? '#A32D2D' : '#3B6D11', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:600 }}
                onClick={confirmSuspendAction}>
                {suspendModal.action === 'suspend' ? t.drv_confirm_suspend : t.drv_confirm_reactivate}
              </button>
              <button onClick={() => { setSuspendModal(null); setSuspendRaison(''); }}>{t.btn_cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Solde */}
      {soldeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:380, padding:24 }}>
            <h2 style={{ fontSize:16, marginBottom:4 }}>
              {soldeModal.type === 'credit' ? t.drv_solde_credit_title : t.drv_solde_debit_title}
            </h2>
            <p style={{ fontSize:13, color:'#6b6b67', marginBottom:16 }}>
              {soldeModal.driver.user?.firstName} {soldeModal.driver.user?.lastName} —
              {t.drv_current_solde} : <strong>{(soldeModal.driver.solde||0).toLocaleString()} MRU</strong>
            </p>
            <div className="form-group">
              <label>{t.drv_amount}</label>
              <input type="number" min="1" value={soldeForm.montant} placeholder={t.drv_amount_ph}
                onChange={e => setSoldeForm(p => ({ ...p, montant:e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t.drv_motif}</label>
              <input type="text" value={soldeForm.motif} placeholder={t.drv_motif_ph}
                onChange={e => setSoldeForm(p => ({ ...p, motif:e.target.value }))} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className={soldeModal.type === 'credit' ? 'btn-primary' : 'btn-danger'} style={{ flex:1 }} onClick={submitSolde}>
                {soldeModal.type === 'credit' ? t.drv_credit_btn : t.drv_debit_btn}
              </button>
              <button onClick={() => setSoldeModal(null)}>{t.btn_cancel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
