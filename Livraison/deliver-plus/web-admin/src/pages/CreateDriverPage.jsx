import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

const ZONES = ['Tevragh Zeïna','Ksar','Sebkha','El Mina','Riyadh','Dar Naim','Teyarett','Toujounine','Arafat','Bouhdida'];
const SERVICES = ['nourriture','courses','colis','pharmacie'];

const SERVICE_LABELS_FR = { nourriture:'Nourriture', courses:'Courses', colis:'Colis', pharmacie:'Pharmacie' };
const SERVICE_LABELS_AR = { nourriture:'طعام', courses:'تسوق', colis:'طرد', pharmacie:'صيدلية' };

export default function CreateDriverPage() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName:'', lastName:'', email:'', phone:'', password:'',
    zone:'Tevragh Zeïna', vehicleType:'moto', services: [...SERVICES],
  });
  const [loading, setLoading] = useState(false);

  const serviceLabels = isAr ? SERVICE_LABELS_AR : SERVICE_LABELS_FR;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleService = s => setForm(p => ({
    ...p, services: p.services.includes(s) ? p.services.filter(x => x !== s) : [...p.services, s],
  }));

  const submit = async e => {
    e.preventDefault();
    if (form.services.length === 0) return toast.error(isAr ? 'اختر خدمة واحدة على الأقل' : 'Sélectionnez au moins un service');
    setLoading(true);
    try {
      await api.post('/admin/drivers', form);
      toast.success(isAr ? 'تم إنشاء حساب المُوصِّل!' : 'Compte livreur créé !');
      navigate('/drivers');
    } catch (err) {
      toast.error(err.response?.data?.message || (isAr ? 'خطأ' : 'Erreur'));
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="btn-sm" onClick={() => navigate('/drivers')}>{t.btn_back}</button>
          <h1>{t.cd_title}</h1>
        </div>
      </div>

      <div className="card" style={{ maxWidth:600 }}>
        <form onSubmit={submit}>
          <div className="form-row">
            <div className="form-group"><label>{t.cd_firstname}</label><input value={form.firstName} onChange={e => set('firstName', e.target.value)} required /></div>
            <div className="form-group"><label>{t.cd_lastname}</label><input value={form.lastName} onChange={e => set('lastName', e.target.value)} required /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>{t.cd_email}</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} required /></div>
            <div className="form-group"><label>{t.cd_phone}</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+222 XX XX XX XX" required /></div>
          </div>
          <div className="form-group"><label>{t.cd_password}</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} minLength={6} required /></div>
          <div className="form-row">
            <div className="form-group">
              <label>{t.cd_zone}</label>
              <select value={form.zone} onChange={e => set('zone', e.target.value)}>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t.cd_vehicle}</label>
              <select value={form.vehicleType} onChange={e => set('vehicleType', e.target.value)}>
                <option value="moto">{t.cd_moto}</option>
                <option value="voiture">{t.cd_voiture}</option>
                <option value="velo">{t.cd_velo}</option>
                <option value="pied">{t.cd_pied}</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>{t.cd_services}</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
              {SERVICES.map(s => (
                <label key={s} style={{ display:'flex', alignItems:'center', gap:5, fontSize:13, cursor:'pointer',
                  padding:'5px 10px', borderRadius:8, border:'.5px solid rgba(0,0,0,0.1)',
                  background: form.services.includes(s) ? '#EEEDFE' : '#fff',
                  color: form.services.includes(s) ? '#3C3489' : '#6b6b67' }}>
                  <input type="checkbox" checked={form.services.includes(s)} onChange={() => toggleService(s)} style={{ width:'auto' }}/>
                  {serviceLabels[s]}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? t.cd_creating : t.cd_submit}</button>
            <button type="button" onClick={() => navigate('/drivers')}>{t.btn_cancel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
