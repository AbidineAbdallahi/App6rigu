import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function CreateAgentPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', password:'' });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/admin/agents', form);
      toast.success('Compte agent créé avec succès');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div className="page-header">
        <h1>👤 Créer un compte agent</h1>
        <button onClick={() => navigate('/')}>← Retour</button>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group">
              <label>Prénom *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Mohamed" required />
            </div>
            <div className="form-group">
              <label>Nom *</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Ould Ahmed" required />
            </div>
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="agent@amder.mr" required />
          </div>
          <div className="form-group">
            <label>Téléphone *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+222 36 00 00 00" required />
          </div>
          <div className="form-group">
            <label>Mot de passe *</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 6 caractères" minLength={6} required />
          </div>

          <div style={{ background:'#EEEDFE', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
            <p style={{ fontSize:12, color:'#3C3489' }}>
              L'agent pourra : créer des commandes, suivre les livreurs en temps réel, appeler et contacter les clients et chauffeurs.
              Il ne pourra pas gérer les utilisateurs ni les tarifs.
            </p>
          </div>

          <button type="submit" className="btn-primary" style={{ width:'100%', padding:12 }} disabled={loading}>
            {loading ? 'Création...' : '✅ Créer le compte agent'}
          </button>
        </form>
      </div>
    </div>
  );
}
