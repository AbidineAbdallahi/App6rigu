import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';

export default function LoginPage() {
  const [form, setForm] = useState({ email:'', password:'' });
  const { login, loading, error } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang];
  const navigate = useNavigate();

  const submit = async e => {
    e.preventDefault();
    if (await login(form.email, form.password)) navigate('/');
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F7F6F2' }}>
      <div className="card" style={{ width:360, padding:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
          <div style={{ width:38, height:38, background:'#534AB7', color:'#fff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:15 }}>D+</div>
          <div>
            <p style={{ fontWeight:500, fontSize:16 }}>Deliver+ Admin</p>
            <p style={{ fontSize:12, color:'#6b6b67' }}>{t.login_panel}</p>
          </div>
        </div>

        {/* Toggle langue */}
        <div style={{ display:'flex', gap:6, marginBottom:20, justifyContent:'center' }}>
          {['fr','ar'].map(l => (
            <button key={l} onClick={() => useLangStore.getState().setLang(l)}
              style={{ padding:'4px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12,
                background: lang === l ? '#534AB7' : '#F0EFF8',
                color: lang === l ? '#fff' : '#534AB7', fontWeight: lang === l ? 700 : 400 }}>
              {l === 'fr' ? 'Français' : 'عربي'}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>{t.login_email}</label>
            <input type="email" placeholder="admin@deliver.mr" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>{t.login_password}</label>
            <input type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>
          {error && <p style={{ fontSize:12, color:'#A32D2D', background:'#FCEBEB', padding:'8px 12px', borderRadius:8, marginBottom:12 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width:'100%', padding:10 }} disabled={loading}>
            {loading ? t.login_loading : t.login_btn}
          </button>
        </form>
      </div>
    </div>
  );
}
