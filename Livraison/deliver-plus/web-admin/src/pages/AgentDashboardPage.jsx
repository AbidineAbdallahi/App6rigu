import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../services/api';
import useAuthStore from '../stores/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const STATUS_MAP = {
  en_attente:     ['#854F0B','En attente'],
  diffuse:        ['#185FA5','Diffusé'],
  accepte:        ['#534AB7','Accepté'],
  en_preparation: ['#185FA5','Préparation'],
  en_route:       ['#534AB7','En route'],
  livre:          ['#3B6D11','Livré'],
  annule:         ['#A32D2D','Annulé'],
};
const SERVICE_ICONS = { nourriture:'🍔', courses:'🛒', colis:'📦', pharmacie:'💊' };

function ContactBtn({ href, label, color }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 8px',
        borderRadius:6, fontSize:11, fontWeight:500, textDecoration:'none',
        background: color + '18', color, border:`1px solid ${color}40` }}>
      {label}
    </a>
  );
}

const fmtSec = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ── Panneau centre d'appel ────────────────────────────────────────────────
function CallCenterPanel({ socketRef }) {
  const { user } = useAuthStore();
  const [available, setAvailable] = useState(false);
  const [callState, setCallState] = useState('idle'); // idle | ringing | active
  const [caller, setCaller]       = useState(null);   // { socketId, name, type }
  const [callSec, setCallSec]     = useState(0);
  const [muted, setMuted]         = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [callError, setCallError]   = useState(null);

  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const remoteAudioRef    = useRef(null);
  const timerRef          = useRef(null);
  const connectTimeoutRef = useRef(null);
  const iceCandidateQueue = useRef([]);
  const callerSocketRef   = useRef(null);
  const stopRingtone = () => {};

  const startTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setCallSec(s => s + 1), 1000);
  };

  const cleanup = () => {
    clearInterval(timerRef.current); timerRef.current = null;
    clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null;
    stopRingtone();
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    localStreamRef.current = null;
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; }
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    iceCandidateQueue.current = [];
    setCallSec(0);
    setMuted(false);
  };

  // Écouter les événements socket
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onAgentCount = ({ available: avail }) => {
      // pas utilisé ici, mais on pourrait afficher la file
    };

    const onQueueCount = ({ queueLength }) => setQueueCount(queueLength || 0);

    const onIncoming = ({ callerSocketId, callerName, callerType }) => {
      callerSocketRef.current = callerSocketId;
      setCaller({ socketId: callerSocketId, name: callerName || 'Utilisateur', type: callerType || 'client' });
      iceCandidateQueue.current = [];
      socket.emit('support_call_accepted', { callerSocketId });
      setCallState('connecting');
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = setTimeout(() => {
        setCallError('Connexion vocale impossible — le client n\'a pas pu établir la liaison.');
        endCall(false);
      }, 25000);
    };

    const onOffer = async ({ sdp, fromSocketId }) => {
      callerSocketRef.current = fromSocketId;
      stopRingtone();
      setCallState('connecting');
      await handleOffer(sdp, fromSocketId);
    };

    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current?.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        iceCandidateQueue.current.push(candidate);
      }
    };

    const onEnded = () => endCall(false);

    socket.on('support_call_incoming', onIncoming);
    socket.on('webrtc_offer',          onOffer);
    socket.on('webrtc_ice',            onIce);
    socket.on('support_call_ended',    onEnded);

    return () => {
      socket.off('support_call_incoming', onIncoming);
      socket.off('webrtc_offer',          onOffer);
      socket.off('webrtc_ice',            onIce);
      socket.off('support_call_ended',    onEnded);
    };
  }, [socketRef.current]);

  const handleOffer = async (sdp, fromSocketId) => {
    // getUserMedia requiert HTTPS ou localhost — vérifier avant d'essayer
    if (!navigator.mediaDevices?.getUserMedia) {
      setCallError('Micro non disponible. Ouvrez l\'admin en HTTPS ou sur localhost.');
      endCall(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setCallError(null);
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socketRef.current?.emit('webrtc_ice', { candidate, targetSocketId: fromSocketId });
        }
      };
      pc.ontrack = (event) => {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
        setCallState('active');
        startTimer();
      };
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of iceCandidateQueue.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      iceCandidateQueue.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('webrtc_answer', { sdp: answer, targetSocketId: fromSocketId });
    } catch (e) {
      const msg = e.name === 'NotAllowedError'
        ? 'Permission micro refusée. Autorisez le micro dans votre navigateur.'
        : e.name === 'NotFoundError'
        ? 'Aucun micro détecté sur cet appareil.'
        : `Erreur WebRTC : ${e.message}`;
      setCallError(msg);
      endCall(true);
    }
  };

  const endCall = (notify = true) => {
    if (notify && callerSocketRef.current) {
      socketRef.current?.emit('support_call_ended', { peerSocketId: callerSocketRef.current });
    }
    cleanup();
    setCallState('idle');
    setCaller(null);
    callerSocketRef.current = null;
  };

  const toggleAvailable = () => {
    const next = !available;
    setAvailable(next);
    if (next) {
      socketRef.current?.emit('agent_available', { agentName: user?.firstName || 'Agent' });
    } else {
      socketRef.current?.emit('agent_unavailable');
    }
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const isIdle       = callState === 'idle';
  const isConnecting = callState === 'connecting';
  const isActive     = callState === 'active';
  const isDark       = isConnecting || isActive;

  return (
    <div>
    <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    <div style={{
      background: isActive ? '#0E0C2A' : isDark ? '#1a0a2e' : '#fff',
      border: `1.5px solid ${isActive ? '#534AB7' : isDark ? '#8B5CF6' : 'rgba(0,0,0,0.09)'}`,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      transition: 'all 0.3s',
    }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isIdle ? 0 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🎧</span>
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: isDark ? '#fff' : '#1a1a18', margin: 0 }}>
              Centre d'appel
            </p>
            {isIdle && (
              <p style={{ fontSize: 12, color: '#6b6b67', margin: 0 }}>
                {available ? `Disponible · ${queueCount} en attente` : 'Hors ligne'}
              </p>
            )}
          </div>
        </div>

        {/* Toggle disponible */}
        {isIdle && (
          <button
            onClick={toggleAvailable}
            disabled={false}
            style={{
              padding: '8px 18px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 13,
              background: available ? 'rgba(39,174,96,0.15)' : 'rgba(0,0,0,0.06)',
              color: available ? '#27AE60' : '#6b6b67',
              transition: 'all 0.2s',
            }}
          >
            {available ? '🟢 Disponible' : '⚫ Indisponible'}
          </button>
        )}
      </div>

      {/* Connexion en cours */}
      {isConnecting && caller && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#534AB7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>
            {caller.type === 'driver' ? '🛵' : '👤'}
          </div>
          <div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>{caller.name}</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '4px 0 0' }}>
              ⏳ En attente de connexion vocale...
            </p>
          </div>
        </div>
      )}

      {/* Appel actif */}
      {isActive && caller && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#27AE60',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26,
            }}>
              {caller.type === 'driver' ? '🛵' : '👤'}
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>{caller.name}</p>
              <p style={{ color: '#5ADA9E', fontSize: 14, fontWeight: 700, margin: '2px 0 0', letterSpacing: 2 }}>
                {fmtSec(callSec)}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={toggleMute}
              style={btnStyle(muted ? '#E67E22' : 'rgba(255,255,255,0.15)', true)}
            >
              {muted ? '🔇 Muet' : '🎙️ Micro'}
            </button>
            <button onClick={() => endCall()} style={btnStyle('#E74C3C')}>📵 Raccrocher</button>
          </div>
        </div>
      )}
      {/* Message d'erreur */}
      {callError && (
        <div style={{
          marginTop: 12,
          background: 'rgba(231,76,60,0.15)',
          border: '1px solid rgba(231,76,60,0.4)',
          borderRadius: 10,
          padding: '10px 14px',
          color: '#E74C3C',
          fontSize: 13,
          fontWeight: 500,
        }}>
          ⚠️ {callError}
        </div>
      )}
    </div>
    </div>
  );
}

function btnStyle(bg, ghost = false) {
  return {
    padding: '10px 20px',
    borderRadius: 10,
    border: ghost ? '1px solid rgba(255,255,255,0.2)' : 'none',
    background: bg,
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}

// ── Page principale ────────────────────────────────────────────────────────
export default function AgentDashboardPage() {
  const { token, user } = useAuthStore();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const socketRef = useRef(null);

  // Connexion socket
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { token: token || localStorage.getItem('token') },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join_agent');
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-center"><div className="spinner"/></div>;

  const { stats = {}, recentOrders = [], onlineDrivers = [] } = data || {};
  const activeOrders = recentOrders.filter(o =>
    ['en_attente','diffuse','accepte','en_preparation','en_route'].includes(o.status)
  );

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(83,74,183,0.6); }
          70%  { box-shadow: 0 0 0 14px rgba(83,74,183,0); }
          100% { box-shadow: 0 0 0 0 rgba(83,74,183,0); }
        }
      `}</style>

      <div className="page-header">
        <h1>Tableau de bord</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-primary btn-sm" onClick={() => navigate('/orders/create')}>➕ Créer commande</button>
          <button className="btn-sm" onClick={() => navigate('/map')}>🗺️ Carte live</button>
        </div>
      </div>

      {/* ── CENTRE D'APPEL ─────────────────────────────────── */}
      <CallCenterPanel socketRef={socketRef} />

      {/* Métriques */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <div className="metric-card">
          <p className="mlabel">Commandes actives</p>
          <p className="mvalue" style={{ color:'#534AB7' }}>{activeOrders.length}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Livreurs actifs</p>
          <p className="mvalue" style={{ color:'#3B6D11' }}>{stats.activeDrivers || 0}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Commandes aujourd'hui</p>
          <p className="mvalue">{stats.todayOrders || 0}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">En attente</p>
          <p className="mvalue" style={{ color:'#854F0B' }}>{stats.pendingOrders || 0}</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>

        {/* Commandes récentes */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'.5px solid rgba(0,0,0,0.09)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontWeight:500, fontSize:14 }}>Commandes récentes</p>
            <button className="btn-sm" onClick={() => navigate('/orders')}>Voir toutes →</button>
          </div>
          <table>
            <thead>
              <tr><th>#</th><th>Service</th><th>Client</th><th>Chauffeur</th><th>Statut</th><th>Contacter</th></tr>
            </thead>
            <tbody>
              {recentOrders.map(o => {
                const [color, label] = STATUS_MAP[o.status] || ['#6b6b67', o.status];
                const clientPhone = o.client?.phone;
                const driverPhone = o.driver?.user?.phone;
                return (
                  <tr key={o._id}>
                    <td style={{ fontFamily:'monospace', color:'#6b6b67', fontSize:11 }}>#{o._id.slice(-6).toUpperCase()}</td>
                    <td>{SERVICE_ICONS[o.serviceType]}</td>
                    <td>
                      <p style={{ fontSize:12, fontWeight:500 }}>{o.client?.firstName} {o.client?.lastName}</p>
                      {clientPhone && <p style={{ fontSize:11, color:'#6b6b67' }}>{clientPhone}</p>}
                    </td>
                    <td>
                      {o.driver ? (
                        <>
                          <p style={{ fontSize:12 }}>{o.driver.user?.firstName} {o.driver.user?.lastName}</p>
                          {driverPhone && <p style={{ fontSize:11, color:'#6b6b67' }}>{driverPhone}</p>}
                        </>
                      ) : <span style={{ color:'#6b6b67', fontSize:12 }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontSize:11, fontWeight:500, color, background:color+'18', padding:'2px 8px', borderRadius:20 }}>
                        {label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {clientPhone && (
                          <div style={{ display:'flex', gap:4 }}>
                            <ContactBtn href={`tel:${clientPhone}`} label="📞 Client" color="#3B6D11" />
                            <ContactBtn href={`https://wa.me/${clientPhone.replace(/\D/g,'')}`} label="WA" color="#25D366" />
                          </div>
                        )}
                        {driverPhone && (
                          <div style={{ display:'flex', gap:4 }}>
                            <ContactBtn href={`tel:${driverPhone}`} label="📞 Chauffeur" color="#534AB7" />
                            <ContactBtn href={`https://wa.me/${driverPhone.replace(/\D/g,'')}`} label="WA" color="#25D366" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {recentOrders.length === 0 && (
            <p style={{ textAlign:'center', padding:24, color:'#6b6b67' }}>Aucune commande</p>
          )}
        </div>

        {/* Livreurs en ligne */}
        <div className="card">
          <p style={{ fontWeight:500, fontSize:14, marginBottom:12 }}>Livreurs en ligne ({onlineDrivers.length})</p>
          {onlineDrivers.length === 0
            ? <p style={{ fontSize:12, color:'#6b6b67', textAlign:'center', padding:12 }}>Aucun livreur actif</p>
            : onlineDrivers.map(d => (
              <div key={d._id} style={{ padding:'8px 0', borderBottom:'.5px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <p style={{ fontSize:12, fontWeight:500 }}>{d.user?.firstName} {d.user?.lastName}</p>
                    <p style={{ fontSize:11, color:'#6b6b67' }}>{d.zone} · {d.status === 'actif' ? '🟢 Actif' : '🟡 Pause'}</p>
                    {d.user?.phone && <p style={{ fontSize:11, color:'#6b6b67' }}>{d.user.phone}</p>}
                  </div>
                </div>
                {d.user?.phone && (
                  <div style={{ display:'flex', gap:4, marginTop:6 }}>
                    <ContactBtn href={`tel:${d.user.phone}`} label="📞 Appeler" color="#534AB7" />
                    <ContactBtn href={`https://wa.me/${d.user.phone.replace(/\D/g,'')}`} label="WhatsApp" color="#25D366" />
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
