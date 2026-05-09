import { useEffect, useState } from 'react';
import api from '../services/api';

const DOCS_META = [
  { key:'carteIdentite',    label:"Carte d'identité", icon:'🪪' },
  { key:'carteGrise',       label:'Carte grise',       icon:'📄' },
  { key:'assurance',        label:'Assurance',          icon:'🛡️' },
  { key:'photoVehicule',    label:'Photo véhicule',     icon:'🛵' },
];

const VEHICLE_LABELS = { moto:'Moto 🛵', voiture:'Voiture 🚗', velo:'Vélo 🚲', pied:'À pied 🚶' };

const STATUS_CONFIG = {
  en_attente: { label:'En attente',  color:'#854F0B', bg:'#FDF3E7', border:'#F0C98B' },
  approuve:   { label:'Approuvé',    color:'#3B6D11', bg:'#EAF3DE', border:'#A8D47A' },
  rejete:     { label:'Refusé',      color:'#A32D2D', bg:'#FDF0F0', border:'#F5C0C0' },
  incomplet:  { label:'Incomplet',   color:'#185FA5', bg:'#E6F1FB', border:'#9BC4EC' },
};

const DOCS_LABELS = {
  photoPersonnelle: 'Photo personnelle',
  photoVehicule:    'Photo véhicule',
  carteGrise:       'Carte grise',
  carteIdentite:    "Carte d'identité",
  assurance:        'Assurance',
};

const TABS = [
  { key:'all',        label:'Tous les dossiers' },
  { key:'en_attente', label:'En attente' },
  { key:'incomplet',  label:'Incomplets' },
  { key:'approuve',   label:'Approuvés' },
  { key:'rejete',     label:'Refusés' },
];

export default function PendingDriversPage() {
  const [drivers, setDrivers]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject]     = useState(null);
  const [preview, setPreview]           = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab]       = useState('all');
  const [counts, setCounts]             = useState({});
  const [showMissing, setShowMissing]   = useState(null);   // driver pour modal docs manquants
  const [missingChecked, setMissingChecked] = useState({}); // { photoPersonnelle: true, ... }
  const [missingNote, setMissingNote]   = useState('');

  const load = async (tab = activeTab) => {
    setLoading(true);
    try {
      const param = tab === 'all' ? 'all' : tab;
      const { data } = await api.get(`/admin/drivers/pending?status=${param}`);
      setDrivers(data.drivers || []);
    } catch {}
    setLoading(false);
  };

  const loadCounts = async () => {
    try {
      const [all, pending, incomplete, approved, rejected] = await Promise.all([
        api.get('/admin/drivers/pending?status=all'),
        api.get('/admin/drivers/pending?status=en_attente'),
        api.get('/admin/drivers/pending?status=incomplet'),
        api.get('/admin/drivers/pending?status=approuve'),
        api.get('/admin/drivers/pending?status=rejete'),
      ]);
      setCounts({
        all:        (all.data.drivers || []).length,
        en_attente: (pending.data.drivers || []).length,
        incomplet:  (incomplete.data.drivers || []).length,
        approuve:   (approved.data.drivers || []).length,
        rejete:     (rejected.data.drivers || []).length,
      });
    } catch {}
  };

  useEffect(() => {
    load('all');
    loadCounts();
  }, []);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setSelected(null);
    load(tab);
  };

  const updateDriver = (driverId, patch) => {
    setDrivers(p => p.map(d => d._id === driverId ? { ...d, ...patch } : d));
    if (selected?._id === driverId) setSelected(s => ({ ...s, ...patch }));
  };

  const approve = async (driverId) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/drivers/${driverId}/approve`);
      updateDriver(driverId, { approvalStatus: 'approuve', missingDocuments: [], missingInfoNote: null });
      loadCounts();
    } catch (e) { alert(e.response?.data?.message || 'Erreur'); }
    setActionLoading(false);
  };

  const reject = async (driverId) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/drivers/${driverId}/reject`, { reason: rejectReason });
      updateDriver(driverId, { approvalStatus: 'rejete', rejectionReason: rejectReason });
      setShowReject(null);
      setRejectReason('');
      loadCounts();
    } catch (e) { alert(e.response?.data?.message || e.message || 'Erreur'); }
    setActionLoading(false);
  };

  const requestMissingDocs = async () => {
    const missing = Object.keys(missingChecked).filter(k => missingChecked[k]);
    setActionLoading(true);
    try {
      await api.patch(`/admin/drivers/${showMissing._id}/request-documents`, {
        missingDocuments: missing,
        note: missingNote.trim() || null,
      });
      updateDriver(showMissing._id, {
        approvalStatus: 'incomplet',
        missingDocuments: missing,
        missingInfoNote: missingNote.trim() || null,
      });
      setShowMissing(null);
      setMissingChecked({});
      setMissingNote('');
      loadCounts();
    } catch (e) {
      const status = e.response?.status;
      const msg    = e.response?.data?.message || e.message || 'Erreur inconnue';
      alert(`Erreur ${status || 'réseau'} : ${msg}`);
    }
    setActionLoading(false);
  };

  const docsComplete = (d) =>
    ['photoPersonnelle','photoVehicule','carteGrise','carteIdentite','assurance']
      .filter(k => !d.documents?.[k]).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📋 Dossiers livreurs</h1>
          <p style={{ fontSize:13, color:'#6b6b67', marginTop:2 }}>
            Consultez et gérez les dossiers de tous vos livreurs.
          </p>
        </div>
        <button className="btn-sm" onClick={() => { load(); loadCounts(); }}>🔄 Actualiser</button>
      </div>

      {/* ── Onglets ── */}
      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const cfg = STATUS_CONFIG[tab.key];
          return (
            <button key={tab.key} onClick={() => switchTab(tab.key)}
              style={{
                padding:'8px 16px', borderRadius:20, border:'none', cursor:'pointer',
                fontSize:13, fontWeight: isActive ? 700 : 400,
                background: isActive ? (cfg?.bg || '#EEEDFE') : '#F7F6F2',
                color: isActive ? (cfg?.color || '#3C3489') : '#6b6b67',
                boxShadow: isActive ? `0 0 0 1.5px ${cfg?.border || '#534AB7'}` : 'none',
              }}>
              {tab.label}
              {counts[tab.key] > 0 && (
                <span style={{
                  marginLeft:6, background: isActive ? (cfg?.color || '#534AB7') : '#D3D1C7',
                  color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700,
                }}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b6b67' }}>Chargement...</div>
      ) : drivers.length === 0 ? (
        <div className="card" style={{ textAlign:'center', padding:60 }}>
          <p style={{ fontSize:48, marginBottom:12 }}>📂</p>
          <p style={{ fontSize:16, fontWeight:600 }}>Aucun dossier</p>
          <p style={{ fontSize:13, color:'#6b6b67', marginTop:6 }}>
            {activeTab === 'en_attente' ? 'Aucun dossier en attente de validation.'
            : activeTab === 'approuve'  ? 'Aucun livreur approuvé pour le moment.'
            : activeTab === 'rejete'    ? 'Aucun dossier refusé.'
            : 'Aucun livreur enregistré.'}
          </p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: selected ? '360px 1fr' : '1fr', gap:16, alignItems:'start' }}>

          {/* ── Colonne liste ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {drivers.map(d => {
              const missing   = docsComplete(d);
              const isSelected = selected?._id === d._id;
              const cfg       = STATUS_CONFIG[d.approvalStatus] || STATUS_CONFIG.en_attente;
              return (
                <div key={d._id} onClick={() => setSelected(isSelected ? null : d)}
                  style={{
                    background:'#fff', borderRadius:14, padding:14, cursor:'pointer',
                    border: isSelected ? '1.5px solid #534AB7' : '.5px solid rgba(0,0,0,0.09)',
                    borderLeft: isSelected ? '4px solid #534AB7' : `4px solid ${cfg.color}`,
                    boxShadow: isSelected ? '0 0 0 2px rgba(83,74,183,0.12)' : 'none',
                  }}>
                  <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                    <div style={{
                      width:52, height:52, borderRadius:'50%', flexShrink:0,
                      background:'#EEEDFE', overflow:'hidden',
                      border:'2px solid #D8D6F5', display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      {d.documents?.photoPersonnelle
                        ? <img src={d.documents.photoPersonnelle} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        : <span style={{ fontSize:20 }}>👤</span>}
                    </div>

                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:14, color:'#1a1a18' }}>
                        {d.user?.firstName} {d.user?.lastName}
                      </p>
                      <p style={{ fontSize:12, color:'#6b6b67', marginTop:1 }}>
                        📞 {d.user?.phone} · {VEHICLE_LABELS[d.vehicleType] || d.vehicleType}
                      </p>
                      <p style={{ fontSize:11, color:'#6b6b67', marginTop:1 }}>
                        📍 {d.zone} · {new Date(d.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })}
                      </p>
                    </div>

                    <div style={{ textAlign:'right', display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
                      <span style={{ fontSize:11, color: cfg.color, fontWeight:700, background: cfg.bg, padding:'2px 8px', borderRadius:20, border:`1px solid ${cfg.border}` }}>
                        {cfg.label}
                      </span>
                      {missing > 0
                        ? <span style={{ fontSize:10, color:'#A32D2D' }}>⚠️ {missing} doc. manquant</span>
                        : <span style={{ fontSize:10, color:'#3B6D11' }}>✅ Docs complets</span>}
                    </div>
                  </div>

                  {/* Boutons rapides selon statut */}
                  {d.approvalStatus === 'en_attente' && (
                    <div style={{ display:'flex', gap:6, marginTop:10 }}>
                      <button onClick={e => { e.stopPropagation(); approve(d._id); }}
                        disabled={actionLoading}
                        style={{ flex:1, padding:'7px', background:'#3B6D11', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                        ✅ Approuver
                      </button>
                      <button onClick={e => { e.stopPropagation(); setShowReject(d); setRejectReason(''); }}
                        style={{ flex:1, padding:'7px', background:'#A32D2D', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                        ✕ Refuser
                      </button>
                      <button onClick={e => { e.stopPropagation(); setShowMissing(d); const auto = {}; Object.keys(DOCS_LABELS).forEach(k => { if (!d.documents?.[k]) auto[k] = true; }); setMissingChecked(auto); setMissingNote(''); }}
                        style={{ padding:'7px 10px', background:'#E6F1FB', color:'#185FA5', border:'1px solid #9BC4EC', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                        📋
                      </button>
                    </div>
                  )}
                  {d.approvalStatus === 'incomplet' && (
                    <div style={{ marginTop:8, background:'#E6F1FB', borderRadius:8, padding:'6px 10px' }}>
                      <p style={{ fontSize:11, color:'#185FA5', fontWeight:600 }}>
                        📋 {(d.missingDocuments || []).length} élément(s) demandé(s) — en attente du livreur
                      </p>
                    </div>
                  )}
                  {d.approvalStatus === 'rejete' && (
                    <div style={{ marginTop:8 }}>
                      <button onClick={e => { e.stopPropagation(); approve(d._id); }}
                        disabled={actionLoading}
                        style={{ width:'100%', padding:'7px', background:'#3B6D11', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                        ✅ Réapprouver le dossier
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Fiche profil complète ── */}
          {selected && (
            <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', border:'.5px solid rgba(0,0,0,0.09)', position:'sticky', top:16 }}>
              {(() => {
                const cfg = STATUS_CONFIG[selected.approvalStatus] || STATUS_CONFIG.en_attente;
                return (
                  <>
                    <div style={{ background:'linear-gradient(135deg,#534AB7,#3C3489)', padding:'28px 24px 0', textAlign:'center', position:'relative' }}>
                      <button onClick={() => setSelected(null)}
                        style={{ position:'absolute', top:12, right:12, background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', width:28, height:28, borderRadius:'50%', cursor:'pointer', fontSize:14 }}>✕</button>

                      <div style={{ width:96, height:96, borderRadius:'50%', margin:'0 auto 12px', background:'#EEEDFE', border:'4px solid rgba(255,255,255,0.5)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {selected.documents?.photoPersonnelle
                          ? <img src={selected.documents.photoPersonnelle} alt="Profil"
                              style={{ width:'100%', height:'100%', objectFit:'cover', cursor:'pointer' }}
                              onClick={() => setPreview(selected.documents.photoPersonnelle)} />
                          : <span style={{ fontSize:44 }}>👤</span>}
                      </div>

                      <p style={{ color:'#fff', fontWeight:700, fontSize:18, marginBottom:6 }}>
                        {selected.user?.firstName} {selected.user?.lastName}
                      </p>
                      <span style={{ background: cfg.bg, color: cfg.color, fontSize:11, padding:'3px 12px', borderRadius:20, fontWeight:700, border:`1px solid ${cfg.border}` }}>
                        {cfg.label}
                      </span>

                      <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:14 }}>
                        <span style={{ color:'rgba(255,255,255,0.85)', fontSize:12 }}>🛵 {VEHICLE_LABELS[selected.vehicleType]?.split(' ')[0]}</span>
                        <span style={{ color:'rgba(255,255,255,0.85)', fontSize:12 }}>📍 {selected.zone}</span>
                      </div>
                      <div style={{ height:16 }} />
                    </div>

                    <div style={{ padding:'20px 24px', overflowY:'auto', maxHeight:'calc(100vh - 260px)' }}>

                      {/* Motif de refus si refusé */}
                      {selected.approvalStatus === 'rejete' && selected.rejectionReason && (
                        <div style={{ background:'#FDF0F0', borderRadius:10, padding:12, border:'1px solid #F5C0C0', marginBottom:16 }}>
                          <p style={{ fontSize:11, fontWeight:700, color:'#A32D2D', marginBottom:4 }}>MOTIF DE REFUS</p>
                          <p style={{ fontSize:13, color:'#A32D2D' }}>{selected.rejectionReason}</p>
                        </div>
                      )}

                      <p style={{ fontSize:12, fontWeight:700, color:'#534AB7', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
                        Informations personnelles
                      </p>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
                        {[
                          { label:'Prénom',      value: selected.user?.firstName },
                          { label:'Nom',         value: selected.user?.lastName },
                          { label:'Téléphone',   value: selected.user?.phone },
                          { label:'Email',       value: selected.user?.email || '—' },
                          { label:'Zone',        value: selected.zone },
                          { label:'Véhicule',    value: VEHICLE_LABELS[selected.vehicleType] || selected.vehicleType },
                          { label:'Inscription', value: new Date(selected.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) },
                          { label:'Statut doc.', value: docsComplete(selected) === 0 ? '✅ Complet' : `⚠️ ${docsComplete(selected)} manquant(s)` },
                        ].map(f => (
                          <div key={f.label} style={{ background:'#F7F6F2', borderRadius:8, padding:'8px 10px' }}>
                            <p style={{ fontSize:10, color:'#6b6b67', marginBottom:2 }}>{f.label}</p>
                            <p style={{ fontSize:13, fontWeight:600, color:'#1a1a18' }}>{f.value}</p>
                          </div>
                        ))}
                      </div>

                      <p style={{ fontSize:12, fontWeight:700, color:'#534AB7', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>
                        Documents fournis
                      </p>
                      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                        {DOCS_META.map(doc => {
                          const url = selected.documents?.[doc.key];
                          return (
                            <div key={doc.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, background: url ? '#F0F7EA' : '#FDF0F0', border:`1px solid ${url ? '#C5DFB0' : '#F5C0C0'}` }}>
                              <span style={{ fontSize:22, flexShrink:0 }}>{doc.icon}</span>
                              <div style={{ flex:1 }}>
                                <p style={{ fontSize:13, fontWeight:600, color:'#1a1a18' }}>{doc.label}</p>
                                <p style={{ fontSize:11, color: url ? '#3B6D11' : '#A32D2D', marginTop:1 }}>
                                  {url ? '✅ Document fourni' : '⚠️ Document manquant'}
                                </p>
                              </div>
                              {url && (
                                <button onClick={() => setPreview(url)}
                                  style={{ padding:'5px 12px', background:'#534AB7', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:600 }}>
                                  👁 Voir
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Docs manquants signalés (statut incomplet) */}
                      {selected.approvalStatus === 'incomplet' && (
                        <div style={{ background:'#E6F1FB', borderRadius:10, padding:14, border:'1px solid #9BC4EC', marginBottom:12 }}>
                          <p style={{ fontSize:12, fontWeight:700, color:'#185FA5', marginBottom:6 }}>📋 DOCUMENTS / INFORMATIONS DEMANDÉS</p>
                          {(selected.missingDocuments || []).map(k => (
                            <p key={k} style={{ fontSize:13, color:'#185FA5', marginBottom:2 }}>· {DOCS_LABELS[k] || k}</p>
                          ))}
                          {selected.missingInfoNote && (
                            <p style={{ fontSize:12, color:'#185FA5', marginTop:6, fontStyle:'italic' }}>{selected.missingInfoNote}</p>
                          )}
                          <p style={{ fontSize:11, color:'#185FA5', marginTop:8 }}>⏳ En attente de la réponse du livreur</p>
                        </div>
                      )}

                      {/* Actions selon statut */}
                      {selected.approvalStatus === 'en_attente' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          <div style={{ display:'flex', gap:10 }}>
                            <button onClick={() => approve(selected._id)} disabled={actionLoading}
                              style={{ flex:1, padding:'13px', background:'#3B6D11', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                              ✅ Activer le compte
                            </button>
                            <button onClick={() => { setShowReject(selected); setRejectReason(''); }}
                              style={{ flex:1, padding:'13px', background:'#A32D2D', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                              ✕ Refuser
                            </button>
                          </div>
                          <button onClick={() => { setShowMissing(selected); const auto = {}; Object.keys(DOCS_LABELS).forEach(k => { if (!selected.documents?.[k]) auto[k] = true; }); setMissingChecked(auto); setMissingNote(''); }}
                            style={{ padding:'11px', background:'#E6F1FB', color:'#185FA5', border:'1.5px solid #9BC4EC', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13 }}>
                            📋 Demander documents manquants
                          </button>
                        </div>
                      )}
                      {selected.approvalStatus === 'incomplet' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          <button onClick={() => approve(selected._id)} disabled={actionLoading}
                            style={{ padding:'13px', background:'#3B6D11', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                            ✅ Activer le compte
                          </button>
                          <button onClick={() => { setShowMissing(selected); const auto = {}; (selected.missingDocuments || []).forEach(k => auto[k] = true); setMissingChecked(auto); setMissingNote(selected.missingInfoNote || ''); }}
                            style={{ padding:'11px', background:'#E6F1FB', color:'#185FA5', border:'1.5px solid #9BC4EC', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:13 }}>
                            ✏️ Modifier la demande
                          </button>
                          <button onClick={() => { setShowReject(selected); setRejectReason(''); }}
                            style={{ padding:'11px', background:'#A32D2D', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13 }}>
                            ✕ Refuser définitivement
                          </button>
                        </div>
                      )}
                      {selected.approvalStatus === 'approuve' && (
                        <div style={{ background:'#EAF3DE', borderRadius:10, padding:14, textAlign:'center' }}>
                          <p style={{ fontSize:13, color:'#3B6D11', fontWeight:600 }}>✅ Compte activé — livreur opérationnel</p>
                          <button onClick={() => { setShowReject(selected); setRejectReason(''); }}
                            style={{ marginTop:10, padding:'8px 20px', background:'#A32D2D', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                            ✕ Révoquer l'accès
                          </button>
                        </div>
                      )}
                      {selected.approvalStatus === 'rejete' && (
                        <div style={{ display:'flex', gap:10 }}>
                          <button onClick={() => approve(selected._id)} disabled={actionLoading}
                            style={{ flex:1, padding:'13px', background:'#3B6D11', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                            ✅ Réapprouver le dossier
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Modal documents manquants ── */}
      {showMissing && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:480 }}>
            <p style={{ fontWeight:700, fontSize:17, marginBottom:4 }}>📋 Documents / informations manquants</p>
            <p style={{ fontSize:13, color:'#6b6b67', marginBottom:16 }}>
              <strong>{showMissing.user?.firstName} {showMissing.user?.lastName}</strong> sera notifié et pourra compléter son dossier depuis l'application.
            </p>

            <p style={{ fontSize:12, fontWeight:700, color:'#534AB7', marginBottom:8 }}>Sélectionner ce qui manque :</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
              {Object.entries(DOCS_LABELS).map(([key, label]) => {
                const hasDoc = showMissing.documents?.[key];
                return (
                  <label key={key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', background: missingChecked[key] ? '#E6F1FB' : '#F7F6F2', border:`1px solid ${missingChecked[key] ? '#9BC4EC' : 'transparent'}` }}>
                    <input type="checkbox" checked={!!missingChecked[key]}
                      onChange={e => setMissingChecked(p => ({ ...p, [key]: e.target.checked }))}
                      style={{ width:16, height:16 }} />
                    <span style={{ flex:1, fontSize:13, fontWeight:600 }}>{label}</span>
                    {hasDoc
                      ? <span style={{ fontSize:11, color:'#3B6D11' }}>✅ Déjà fourni</span>
                      : <span style={{ fontSize:11, color:'#A32D2D' }}>⚠️ Manquant</span>}
                  </label>
                );
              })}
            </div>

            <p style={{ fontSize:12, fontWeight:700, color:'#534AB7', marginBottom:6 }}>Message additionnel (optionnel) :</p>
            <textarea value={missingNote} onChange={e => setMissingNote(e.target.value)}
              placeholder="Ex : La photo d'identité est illisible, veuillez en soumettre une nouvelle..."
              style={{ width:'100%', minHeight:80, borderRadius:10, border:'1px solid #D3D1C7', padding:12, fontSize:13, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit', marginBottom:14 }}
            />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowMissing(null)}
                style={{ flex:1, padding:'12px', background:'#F7F6F2', border:'.5px solid #D3D1C7', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={requestMissingDocs} disabled={actionLoading || Object.values(missingChecked).every(v => !v)}
                style={{ flex:2, padding:'12px', background:'#185FA5', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13, opacity: Object.values(missingChecked).every(v => !v) ? 0.5 : 1 }}>
                {actionLoading ? 'Envoi...' : '📤 Notifier le livreur'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal refus / révocation ── */}
      {showReject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:460 }}>
            <p style={{ fontWeight:700, fontSize:17, marginBottom:6 }}>
              {showReject.approvalStatus === 'approuve' ? 'Révoquer l\'accès' : 'Motif de refus'}
            </p>
            <p style={{ fontSize:13, color:'#6b6b67', marginBottom:16 }}>
              Le livreur <strong>{showReject.user?.firstName} {showReject.user?.lastName}</strong> sera notifié.
            </p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Ex : Photo d'identité illisible, informations incomplètes, assurance expirée..."
              style={{ width:'100%', minHeight:100, borderRadius:10, border:'1px solid #D3D1C7', padding:12, fontSize:13, resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}
            />
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={() => setShowReject(null)}
                style={{ flex:1, padding:'12px', background:'#F7F6F2', border:'.5px solid #D3D1C7', borderRadius:10, cursor:'pointer', fontWeight:600, fontSize:13 }}>
                Annuler
              </button>
              <button onClick={() => reject(showReject._id)} disabled={actionLoading}
                style={{ flex:2, padding:'12px', background:'#A32D2D', color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:13 }}>
                {actionLoading ? 'Envoi...' : '✕ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prévisualisation document ── */}
      {preview && (
        <div onClick={() => setPreview(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, cursor:'zoom-out', padding:24 }}>
          <div onClick={e => e.stopPropagation()} style={{ position:'relative', maxWidth:'92vw', maxHeight:'92vh' }}>
            <img src={preview} alt="Document"
              style={{ maxWidth:'100%', maxHeight:'88vh', borderRadius:10, objectFit:'contain', display:'block' }} />
            <button onClick={() => setPreview(null)}
              style={{ position:'absolute', top:-14, right:-14, width:34, height:34, borderRadius:'50%', background:'#fff', border:'none', fontSize:18, cursor:'pointer', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.3)' }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
