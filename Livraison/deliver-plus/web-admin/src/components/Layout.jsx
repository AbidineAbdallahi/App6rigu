import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../stores/authStore';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const NAV_ADMIN = [
  { to:'/',                label:'Vue générale',    icon:'⊞', end:true },
  { to:'/map',             label:'Carte live',      icon:'🗺️' },
  { to:'/drivers',         label:'Livreurs',        icon:'🛵' },
  { to:'/drivers/pending', label:'Dossiers livreur',icon:'📋', badge:true },
  { to:'/orders',          label:'Commandes',       icon:'📦' },
  { to:'/orders/create',   label:'Créer commande',  icon:'➕' },
  { to:'/agents/create',   label:'Créer agent',     icon:'👤' },
  { to:'/tarifs',          label:'Frais & tarifs',  icon:'💰' },
  { to:'/stats',           label:'Statistiques',    icon:'📊' },
];

const NAV_AGENT = [
  { to:'/',              label:'Tableau de bord', icon:'⊞', end:true },
  { to:'/map',           label:'Carte live',      icon:'🗺️' },
  { to:'/orders',        label:'Commandes',       icon:'📋' },
  { to:'/orders/create', label:'Créer commande',  icon:'➕' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const NAV = isAdmin ? NAV_ADMIN : NAV_AGENT;
  const [pendingCount, setPendingCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!isAdmin) return;

    api.get('/admin/drivers/pending')
      .then(({ data }) => setPendingCount((data.drivers || []).length))
      .catch(() => {});

    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join_admin'));
    socket.on('new_driver_pending', () => setPendingCount(c => c + 1));

    return () => socket.disconnect();
  }, [isAdmin]);

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:200, flexShrink:0, background:'#fff', borderRight:'.5px solid rgba(0,0,0,0.09)', display:'flex', flexDirection:'column', padding:'16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:16, borderBottom:'.5px solid rgba(0,0,0,0.09)', marginBottom:12 }}>
          <div style={{ width:30, height:30, background:'#534AB7', color:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>D+</div>
          <span style={{ fontWeight:500, fontSize:15 }}>Deliver+</span>
        </div>

        <nav style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              onClick={() => { if (n.badge) setPendingCount(0); }}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
                borderRadius:8, fontSize:13, textDecoration:'none',
                background: isActive ? '#EEEDFE' : 'transparent',
                color: isActive ? '#3C3489' : '#6b6b67',
                fontWeight: isActive ? 500 : 400,
              })}>
              <span style={{ fontSize:14 }}>{n.icon}</span>
              <span style={{ flex:1 }}>{n.label}</span>
              {n.badge && pendingCount > 0 && (
                <span style={{ background:'#854F0B', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700, minWidth:18, textAlign:'center' }}>
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ borderTop:'.5px solid rgba(0,0,0,0.09)', paddingTop:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'#EEEDFE', color:'#3C3489', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500 }}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div>
              <p style={{ fontSize:12, fontWeight:500 }}>{user?.firstName} {user?.lastName}</p>
              <p style={{ fontSize:10, color:'#6b6b67' }}>{isAdmin ? 'Super admin' : 'Agent'}</p>
            </div>
          </div>
          <button className="btn-danger btn-sm" style={{ width:'100%' }} onClick={() => { logout(); navigate('/login'); }}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main style={{ flex:1, padding:24, overflowY:'auto', maxHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
