import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../stores/authStore';
import useLangStore from '../stores/langStore';
import { translations } from '../i18n';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);
  const [cancelCount, setCancelCount]   = useState(0);
  const socketRef = useRef(null);

  const NAV_ADMIN = [
    { to:'/',                label: t.nav_dashboard,      icon:'⊞', end:true },
    { to:'/map',             label: t.nav_map,            icon:'🗺️' },
    { to:'/drivers',         label: t.nav_drivers,        icon:'🛵' },
    { to:'/drivers/pending', label: t.nav_pending,        icon:'📋', badge:true },
    { to:'/orders',          label: t.nav_orders,         icon:'📦' },
    { to:'/cancellations',   label: '⚠️ Annulations',     icon:'🚫', cancelBadge:true },
    { to:'/orders/create',   label: t.nav_create_order,   icon:'➕' },
    { to:'/agents/create',   label: t.nav_create_agent,   icon:'👤' },
    { to:'/tarifs',          label: t.nav_tarifs,         icon:'💰' },
    { to:'/stats',           label: t.nav_stats,          icon:'📊' },
    { to:'/credit-solde',     label: 'Recharge solde',      icon:'💰' },
    { to:'/settings',        label: 'Paramètres',         icon:'⚙️' },
  ];

  const NAV_AGENT = [
    { to:'/',              label: t.nav_agent_dashboard, icon:'⊞', end:true },
    { to:'/map',           label: t.nav_map,             icon:'🗺️' },
    { to:'/orders',        label: t.nav_orders,          icon:'📋' },
    { to:'/orders/create', label: t.nav_create_order,    icon:'➕' },
  ];

  const NAV = isAdmin ? NAV_ADMIN : NAV_AGENT;

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/admin/drivers/pending')
      .then(({ data }) => setPendingCount((data.drivers || []).length))
      .catch(() => {});
    api.get('/admin/orders/pending-cancellations')
      .then(({ data }) => setCancelCount((data.orders || []).length))
      .catch(() => {});
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join_admin'));
    socket.on('new_driver_pending', () => setPendingCount(c => c + 1));
    socket.on('driver_cancellation_pending', () => setCancelCount(c => c + 1));
    return () => socket.disconnect();
  }, [isAdmin]);

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:210, flexShrink:0, background:'#fff', borderRight:'.5px solid rgba(0,0,0,0.09)', display:'flex', flexDirection:'column', padding:'16px 12px' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:16, borderBottom:'.5px solid rgba(0,0,0,0.09)', marginBottom:12 }}>
          <div style={{ width:30, height:30, background:'#534AB7', color:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>D+</div>
          <span style={{ fontWeight:500, fontSize:15 }}>Deliver+</span>
        </div>

        {/* Navigation */}
        <nav style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              onClick={() => {
                if (n.badge) setPendingCount(0);
                if (n.cancelBadge) setCancelCount(0);
              }}
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
              {n.cancelBadge && cancelCount > 0 && (
                <span style={{ background:'#A32D2D', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:700, minWidth:18, textAlign:'center' }}>
                  {cancelCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bas de sidebar */}
        <div style={{ borderTop:'.5px solid rgba(0,0,0,0.09)', paddingTop:12 }}>
          {/* Toggle langue */}
          <div style={{ display:'flex', gap:4, marginBottom:12 }}>
            <button
              onClick={() => setLang('fr')}
              style={{
                flex:1, padding:'5px', fontSize:11, borderRadius:6, border:'none', cursor:'pointer',
                background: lang === 'fr' ? '#534AB7' : '#F0EFF8',
                color: lang === 'fr' ? '#fff' : '#534AB7',
                fontWeight: lang === 'fr' ? 700 : 400,
              }}>
              FR
            </button>
            <button
              onClick={() => setLang('ar')}
              style={{
                flex:1, padding:'5px', fontSize:11, borderRadius:6, border:'none', cursor:'pointer',
                background: lang === 'ar' ? '#534AB7' : '#F0EFF8',
                color: lang === 'ar' ? '#fff' : '#534AB7',
                fontWeight: lang === 'ar' ? 700 : 400,
                fontFamily: 'inherit',
              }}>
              عربي
            </button>
          </div>

          {/* Profil */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'#EEEDFE', color:'#3C3489', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:500 }}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div>
              <p style={{ fontSize:12, fontWeight:500 }}>{user?.firstName} {user?.lastName}</p>
              <p style={{ fontSize:10, color:'#6b6b67' }}>{isAdmin ? t.role_admin : t.role_agent}</p>
            </div>
          </div>
          <button className="btn-danger btn-sm" style={{ width:'100%' }} onClick={() => { logout(); navigate('/login'); }}>
            {t.btn_logout}
          </button>
        </div>
      </aside>

      <main style={{ flex:1, padding:24, overflowY:'auto', maxHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
