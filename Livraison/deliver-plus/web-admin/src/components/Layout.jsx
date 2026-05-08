import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

const NAV = [
  { to:'/',        label:'Vue générale',   icon:'⊞', end:true },
  { to:'/map',     label:'Carte live',     icon:'🗺️' },
  { to:'/drivers', label:'Livreurs',       icon:'🛵' },
  { to:'/orders',         label:'Commandes',       icon:'📋' },
  { to:'/orders/create', label:'Créer commande',  icon:'➕' },
  { to:'/tarifs',  label:'Frais & tarifs', icon:'💰' },
  { to:'/stats',   label:'Statistiques',   icon:'📊' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Sidebar */}
      <aside style={{ width:200, flexShrink:0, background:'#fff', borderRight:'.5px solid rgba(0,0,0,0.09)', display:'flex', flexDirection:'column', padding:'16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:16, borderBottom:'.5px solid rgba(0,0,0,0.09)', marginBottom:12 }}>
          <div style={{ width:30, height:30, background:'#534AB7', color:'#fff', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12 }}>D+</div>
          <span style={{ fontWeight:500, fontSize:15 }}>Deliver+</span>
        </div>

        <nav style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
                borderRadius:8, fontSize:13, textDecoration:'none',
                background: isActive ? '#EEEDFE' : 'transparent',
                color: isActive ? '#3C3489' : '#6b6b67',
                fontWeight: isActive ? 500 : 400,
              })}>
              <span style={{ fontSize:14 }}>{n.icon}</span>{n.label}
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
              <p style={{ fontSize:10, color:'#6b6b67' }}>Super admin</p>
            </div>
          </div>
          <button className="btn-danger btn-sm" style={{ width:'100%' }} onClick={() => { logout(); navigate('/login'); }}>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, padding:24, overflowY:'auto', maxHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
