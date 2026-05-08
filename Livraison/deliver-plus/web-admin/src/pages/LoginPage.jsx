import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

export default function LoginPage() {
  const [form, setForm] = useState({ email:'', password:'' });
  const { login, loading, error } = useAuthStore();
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
            <p style={{ fontSize:12, color:'#6b6b67' }}>Panneau d'administration</p>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Email</label>
            <input type="email" placeholder="admin@deliver.mr" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label>Mot de passe</label>
            <input type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          </div>
          {error && <p style={{ fontSize:12, color:'#A32D2D', background:'#FCEBEB', padding:'8px 12px', borderRadius:8, marginBottom:12 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width:'100%', padding:10 }} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
