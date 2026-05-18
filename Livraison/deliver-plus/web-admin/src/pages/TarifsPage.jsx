import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

export default function TarifsPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';

  const [tarifs, setTarifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get('/tarifs').then(r => { setTarifs(r.data.tarifs); setLoading(false); }); }, []);

  const save = async (tarif) => {
    try {
      if (tarif._id) {
        await api.patch(`/tarifs/${tarif._id}`, tarif);
      } else {
        const { data } = await api.post('/tarifs', tarif);
        setTarifs(prev => prev.map(x => x.serviceType === tarif.serviceType ? data.tarif : x));
        toast.success(isAr ? 'تم حفظ التعريفة' : 'Tarif enregistré'); return;
      }
      toast.success(isAr ? 'تم تحديث التعريفة' : 'Tarif mis à jour');
    } catch { toast.error(isAr ? 'خطأ' : 'Erreur'); }
  };

  const Field = ({ tarif, field, label, unit }) => {
    const [val, setVal] = useState(tarif[field] ?? '');
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'.5px solid rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize:12 }}>{label}</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="number" value={val} onChange={e => setVal(e.target.value)}
            onBlur={() => { tarif[field] = +val; save({ ...tarif, [field]: +val }); }}
            style={{ width:70, textAlign:'right', fontSize:12 }} />
          <span style={{ fontSize:11, color:'#6b6b67', width:30 }}>{unit}</span>
        </div>
      </div>
    );
  };

  const SERVICE_ICONS  = { nourriture:'🍔', courses:'🛒', colis:'📦', pharmacie:'💊', course:'🚖' };
  const SERVICE_LABELS = isAr
    ? { nourriture:'طعام', courses:'تسوق', colis:'طرد سريع', pharmacie:'صيدلية', course:'رحلة (تاكسي)' }
    : { nourriture:'Nourriture', courses:'Courses', colis:'Colis express', pharmacie:'Pharmacie', course:'Course (taxi)' };

  const hasCourse = tarifs.some(t => t.serviceType === 'course');

  const initCourseTarif = async () => {
    try {
      await api.post('/tarifs', {
        serviceType: 'course', baseFee: 300, perKmFee: 100,
        perMinuteFee: 10, minimumFare: 400,
        nightSurchargePercent: 30, platformCommission: 15, freeKmRadius: 0,
      });
      toast.success(isAr ? 'تم إنشاء تعريفة الرحلة' : 'Tarif course créé');
      api.get('/tarifs').then(r => setTarifs(r.data.tarifs));
    } catch { toast.error(isAr ? 'خطأ في الإنشاء' : 'Erreur création tarif'); }
  };

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;

  return (
    <div>
      <div className="page-header">
        <h1>{t.tar_title}</h1>
        {!hasCourse && (
          <button className="btn-primary" onClick={initCourseTarif}>{t.tar_init_course}</button>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
        {tarifs.map(tarif => (
          <div key={tarif._id || tarif.serviceType} className="card">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:20 }}>{SERVICE_ICONS[tarif.serviceType]}</span>
              <p style={{ fontWeight:500 }}>{SERVICE_LABELS[tarif.serviceType] || tarif.serviceType}</p>
            </div>
            <Field tarif={tarif} field="baseFee"               label={t.tar_base_fee}   unit="MRU" />
            {tarif.serviceType === 'course' && (
              <Field tarif={tarif} field="minimumFare"         label={t.tar_min_fare}   unit="MRU" />
            )}
            {tarif.serviceType === 'course' && (
              <Field tarif={tarif} field="perMinuteFee"        label={t.tar_per_min}    unit="MRU" />
            )}
            {tarif.serviceType !== 'course' && (
              <Field tarif={tarif} field="freeKmRadius"        label={t.tar_free_km}    unit="km" />
            )}
            <Field tarif={tarif} field="perKmFee"              label={t.tar_per_km}     unit="MRU" />
            {tarif.serviceType !== 'course' && (
              <Field tarif={tarif} field="urgentSurcharge"     label={t.tar_urgent}     unit="MRU" />
            )}
            <Field tarif={tarif} field="nightSurchargePercent" label={t.tar_night}      unit="%" />
            <Field tarif={tarif} field="platformCommission"    label={t.tar_commission} unit="%" />
          </div>
        ))}
      </div>

      {tarifs.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <p style={{ color:'#6b6b67', marginBottom:12 }}>{t.tar_no_tarifs}</p>
          <button className="btn-primary" onClick={() => api.post('/tarifs', { serviceType:'nourriture', baseFee:150 }).then(() => window.location.reload())}>
            {t.tar_init_defaults}
          </button>
        </div>
      )}
    </div>
  );
}
