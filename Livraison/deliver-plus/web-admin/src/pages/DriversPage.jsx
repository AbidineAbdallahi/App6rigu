import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function DriversPage() {
  const [drivers, setDrivers]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [soldeModal, setSoldeModal]     = useState(null);
  const [soldeForm, setSoldeForm]       = useState({ montant:'', motif:'' });
  const [suspendModal, setSuspendModal] = useState(null); // { driver, action:'suspend'|'reactivate' }
  const [suspendRaison, setSuspendRaison] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/drivers').then(r => { setDrivers(r.data.drivers); setLoading(false); });
  useEffect(() => { load(); }, []);

  // ─── Suspendre ou réactiver ────────────────────────────────────────────────
  const confirmSuspendAction = async () => {
    const { driver, action } = suspendModal;
    const newStatus = action === 'suspend' ? 'suspendu' : 'actif';
    try {
      await api.patch(`/admin/drivers/${driver._id}`, {
        status: newStatus,
        motif: suspendRaison || (action === 'suspend' ? 'Suspension admin' : 'Réactivation admin'),
      });
      toast.success(action === 'suspend'
        ? `🚫 ${driver.user?.firstName} suspendu`
        : `✅ ${driver.user?.firstName} réactivé`
      );
      setSuspendModal(null);
      setSuspendRaison('');
      load();
    } catch { toast.error('Erreur lors de la mise à jour'); }
  };

  // ─── Gérer le solde ────────────────────────────────────────────────────────
  const submitSolde = async () => {
    if (!soldeForm.montant || isNaN(soldeForm.montant)) return toast.error('Montant invalide');
    try {
      const { data } = await api.post(`/admin/drivers/${soldeModal.driver._id}/solde`, {
        type: soldeModal.type,
        montant: Number(soldeForm.montant),
        motif: soldeForm.motif || (soldeModal.type === 'credit' ? 'Rechargement admin' : 'Déduction admin'),
      });
      toast.success(`Solde mis à jour : ${data.solde.toLocaleString()} MRU`);
      setSoldeModal(null); setSoldeForm({ montant:'', motif:'' }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Erreur'); }
  };

  const sMap = { actif:'badge-green', pause:'badge-amber', hors_ligne:'badge-blue', suspendu:'badge-red' };
  const sLbl = { actif:'Actif', pause:'Pause', hors_ligne:'Hors ligne', suspendu:'Suspendu' };

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Livreurs ({drivers.length})</h1>
        <button className="btn-primary" onClick={() => navigate('/drivers/create')}>+ Créer un compte</button>
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Livreur</th>
              <th>Zone</th>
              <th>Solde (MRU)</th>
              <th>Livraisons</th>
              <th>Note</th>
              <th>Statut</th>
              <th>Actions</th>
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
                        ✅ Réactiver
                      </button>
                    ) : (
                      <button className="btn-sm btn-danger"
                        onClick={() => { setSuspendModal({ driver:d, action:'suspend' }); setSuspendRaison(''); }}>
                        🚫 Suspendre
                      </button>
                    )}
                    <button className="btn-sm" onClick={() => navigate('/map')} title="Voir sur la carte">
                      📍 Carte
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {drivers.length === 0 && <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>Aucun livreur enregistré</p>}
      </div>

      {/* ─── Modal Suspendre / Réactiver ─────────────────────────────────────── */}
      {suspendModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:420, padding:28 }}>
            <h2 style={{ fontSize:16, marginBottom:8, color: suspendModal.action === 'suspend' ? '#A32D2D' : '#3B6D11' }}>
              {suspendModal.action === 'suspend' ? '🚫 Suspendre le compte' : '✅ Réactiver le compte'}
            </h2>

            <div style={{ background: suspendModal.action === 'suspend' ? '#FCEBEB' : '#EAF3DE', borderRadius:10, padding:12, marginBottom:16 }}>
              <p style={{ fontSize:14, fontWeight:500 }}>
                {suspendModal.driver.user?.firstName} {suspendModal.driver.user?.lastName}
              </p>
              <p style={{ fontSize:12, color:'#6b6b67', marginTop:2 }}>
                {suspendModal.driver.zone} · Solde : {(suspendModal.driver.solde||0).toLocaleString()} MRU
              </p>
            </div>

            {suspendModal.action === 'suspend' && (
              <div style={{ background:'#FFF8F0', border:'.5px solid #F0C090', borderRadius:8, padding:10, marginBottom:16, fontSize:12, color:'#854F0B' }}>
                ⚠️ Le livreur ne pourra plus accepter de commandes et sera déconnecté.
              </div>
            )}

            <div className="form-group">
              <label>{suspendModal.action === 'suspend' ? 'Raison de la suspension' : 'Raison de la réactivation'}</label>
              <textarea
                value={suspendRaison}
                onChange={e => setSuspendRaison(e.target.value)}
                placeholder={suspendModal.action === 'suspend'
                  ? "Ex: Comportement inapproprié, plainte client..."
                  : "Ex: Situation résolue, réintégration approuvée..."}
                rows={3}
                style={{ resize:'vertical' }}
              />
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button
                style={{ flex:1, padding:10, background: suspendModal.action === 'suspend' ? '#A32D2D' : '#3B6D11', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:600 }}
                onClick={confirmSuspendAction}>
                {suspendModal.action === 'suspend' ? '🚫 Confirmer la suspension' : '✅ Confirmer la réactivation'}
              </button>
              <button onClick={() => { setSuspendModal(null); setSuspendRaison(''); }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Solde ─────────────────────────────────────────────────────── */}
      {soldeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div className="card" style={{ width:380, padding:24 }}>
            <h2 style={{ fontSize:16, marginBottom:4 }}>
              {soldeModal.type === 'credit' ? '💳 Créditer' : '💸 Débiter'} le solde
            </h2>
            <p style={{ fontSize:13, color:'#6b6b67', marginBottom:16 }}>
              {soldeModal.driver.user?.firstName} {soldeModal.driver.user?.lastName} —
              solde actuel : <strong>{(soldeModal.driver.solde||0).toLocaleString()} MRU</strong>
            </p>
            <div className="form-group">
              <label>Montant (MRU)</label>
              <input type="number" min="1" value={soldeForm.montant} placeholder="Ex: 500"
                onChange={e => setSoldeForm(p => ({ ...p, montant:e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Motif</label>
              <input type="text" value={soldeForm.motif} placeholder="Ex: Rechargement initial"
                onChange={e => setSoldeForm(p => ({ ...p, motif:e.target.value }))} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className={soldeModal.type === 'credit' ? 'btn-primary' : 'btn-danger'} style={{ flex:1 }} onClick={submitSolde}>
                {soldeModal.type === 'credit' ? '+ Créditer' : '− Débiter'}
              </button>
              <button onClick={() => setSoldeModal(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
