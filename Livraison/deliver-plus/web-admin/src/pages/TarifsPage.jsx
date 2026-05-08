import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function TarifsPage() {
  const [tarifs, setTarifs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get('/tarifs').then(r => { setTarifs(r.data.tarifs); setLoading(false); }); }, []);

  const save = async (t) => {
    try {
      if (t._id) {
        await api.patch(`/tarifs/${t._id}`, t);
      } else {
        const { data } = await api.post('/tarifs', t);
        setTarifs(prev => prev.map(x => x.serviceType === t.serviceType ? data.tarif : x));
        toast.success('Tarif enregistré'); return;
      }
      toast.success('Tarif mis à jour');
    } catch { toast.error('Erreur'); }
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

  const SERVICE_ICONS = { nourriture:'🍔', courses:'🛒', colis:'📦', pharmacie:'💊' };

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;

  return (
    <div>
      <div className="page-header"><h1>Frais & tarifs</h1></div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16 }}>
        {tarifs.map(t => (
          <div key={t._id || t.serviceType} className="card">
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:20 }}>{SERVICE_ICONS[t.serviceType]}</span>
              <p style={{ fontWeight:500, textTransform:'capitalize' }}>{t.serviceType}</p>
            </div>
            <Field tarif={t} field="baseFee"             label="Frais de base"          unit="MRU" />
            <Field tarif={t} field="freeKmRadius"        label="Km inclus"               unit="km" />
            <Field tarif={t} field="perKmFee"            label="Par km suppl."           unit="MRU" />
            <Field tarif={t} field="urgentSurcharge"     label="Supplément urgent"       unit="MRU" />
            <Field tarif={t} field="nightSurchargePercent" label="Majoration nuit"       unit="%" />
            <Field tarif={t} field="platformCommission"  label="Commission plateforme"   unit="%" />
          </div>
        ))}
      </div>

      {tarifs.length === 0 && (
        <div className="card" style={{ textAlign:'center', padding:32 }}>
          <p style={{ color:'#6b6b67', marginBottom:12 }}>Aucun tarif configuré.</p>
          <button className="btn-primary" onClick={() => api.post('/tarifs', { serviceType:'nourriture', baseFee:150 }).then(() => window.location.reload())}>
            Initialiser les tarifs par défaut
          </button>
        </div>
      )}
    </div>
  );
}
