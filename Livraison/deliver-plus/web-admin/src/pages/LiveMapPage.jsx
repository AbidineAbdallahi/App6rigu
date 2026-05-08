import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../services/api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const NOUAKCHOTT = { lat: 18.0858, lng: -15.9785 };

// Couleurs selon statut
const DRIVER_COLORS = {
  actif: '#3B6D11',
  pause: '#854F0B',
  hors_ligne: '#6b6b67',
  suspendu: '#A32D2D',
};

const STATUS_LABELS = {
  actif: '🟢 Actif',
  pause: '🟡 Pause',
  hors_ligne: '⚫ Hors ligne',
  suspendu: '🔴 Suspendu',
};

export default function LiveMapPage() {
  const [drivers, setDrivers]       = useState([]);
  const [orders, setOrders]         = useState([]);
  const [selected, setSelected]     = useState(null); // livreur sélectionné
  const [mapReady, setMapReady]     = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const mapRef    = useRef(null);
  const leafletRef = useRef(null);
  const markersRef = useRef({});
  const trailsRef  = useRef({});
  const socketRef  = useRef(null);
  const navigate   = useNavigate();

  // ─── Charger données initiales ──────────────────────────────────────────────
  const loadData = async () => {
    try {
      const [driversRes, ordersRes] = await Promise.all([
        api.get('/drivers'),
        api.get('/orders?limit=50'),
      ]);
      setDrivers(driversRes.data.drivers || []);
      setOrders(ordersRes.data.orders || []);
      setLastUpdate(new Date());
    } catch {}
  };

  // ─── Initialiser la carte Leaflet ──────────────────────────────────────────
  useEffect(() => {
    loadData();

    // Charger Leaflet dynamiquement
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      if (mapRef.current) return;
      const container = document.getElementById('live-map');
      if (container && container._leaflet_id) delete container._leaflet_id;
      const L = window.L;
      leafletRef.current = L;

      const map = L.map('live-map').setView([NOUAKCHOTT.lat, NOUAKCHOTT.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
    };
    document.head.appendChild(script);

    // Socket.io
    const token = localStorage.getItem('token');
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_admin');

    socket.on('driver_location', ({ driverId, lat, lng }) => {
      updateDriverMarker(driverId, lat, lng);
      setLastUpdate(new Date());
    });

    socket.on('driver_status_update', ({ driverId, status }) => {
      setDrivers(prev => prev.map(d => d._id === driverId ? { ...d, status } : d));
      setLastUpdate(new Date());
    });

    socket.on('order_accepted', () => loadData());
    socket.on('order_status_update', () => loadData());

    const interval = setInterval(loadData, 20000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ─── Mettre à jour les marqueurs quand les drivers changent ────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    drivers.forEach(d => {
      const lat = d.currentLocation?.lat || NOUAKCHOTT.lat;
      const lng = d.currentLocation?.lng || NOUAKCHOTT.lng;
      const color = DRIVER_COLORS[d.status] || '#6b6b67';
      const name = `${d.user?.firstName || ''} ${d.user?.lastName || ''}`;
      const currentOrder = orders.find(o => o.driver?._id === d._id && ['accepte','en_preparation','en_route'].includes(o.status));

      const icon = L.divIcon({
        html: `
          <div style="
            width:40px;height:40px;
            background:${color};
            border-radius:50%;
            border:3px solid white;
            display:flex;align-items:center;justify-content:center;
            font-size:18px;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            cursor:pointer;
          ">🛵</div>
          <div style="
            background:${color};color:white;
            font-size:10px;font-weight:600;
            padding:2px 6px;border-radius:4px;
            white-space:nowrap;margin-top:2px;
            text-align:center;
            box-shadow:0 1px 4px rgba(0,0,0,0.2);
          ">${name}</div>
        `,
        iconSize: [40, 56],
        iconAnchor: [20, 20],
        className: '',
      });

      const popupContent = `
        <div style="min-width:200px;font-family:sans-serif;">
          <p style="font-weight:600;font-size:14px;margin-bottom:6px;">🛵 ${name}</p>
          <p style="font-size:12px;color:#6b6b67;margin-bottom:4px;">Zone : ${d.zone}</p>
          <p style="font-size:12px;color:#6b6b67;margin-bottom:4px;">Véhicule : ${d.vehicleType}</p>
          <p style="font-size:12px;margin-bottom:4px;">Statut : <strong style="color:${color}">${STATUS_LABELS[d.status]}</strong></p>
          <p style="font-size:12px;margin-bottom:4px;">Solde : <strong>${(d.solde||0).toLocaleString()} MRU</strong></p>
          <p style="font-size:12px;margin-bottom:4px;">Livraisons : ${d.stats?.totalDeliveries || 0}</p>
          ${currentOrder ? `<p style="font-size:12px;color:#534AB7;margin-bottom:8px;">📦 Commande en cours</p>` : ''}
          <div style="display:flex;gap:6px;margin-top:8px;">
            ${d.status !== 'actif' ? `<button onclick="window.adminAction('${d._id}','actif')" style="flex:1;padding:5px;background:#3B6D11;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;">✅ Activer</button>` : ''}
            ${d.status !== 'suspendu' ? `<button onclick="window.adminAction('${d._id}','suspendu')" style="flex:1;padding:5px;background:#A32D2D;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;">🚫 Suspendre</button>` : ''}
            ${currentOrder ? `<button onclick="window.trackOrder('${currentOrder._id}')" style="flex:1;padding:5px;background:#534AB7;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11px;">📍 Suivre</button>` : ''}
          </div>
        </div>
      `;

      if (markersRef.current[d._id]) {
        markersRef.current[d._id].setLatLng([lat, lng]);
        markersRef.current[d._id].setIcon(icon);
        markersRef.current[d._id].getPopup()?.setContent(popupContent);
      } else {
        const marker = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popupContent);
        markersRef.current[d._id] = marker;
      }
    });
  }, [drivers, orders, mapReady]);

  // ─── Mettre à jour position GPS temps réel ─────────────────────────────────
  const updateDriverMarker = (driverId, lat, lng) => {
    if (!mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;

    if (markersRef.current[driverId]) {
      markersRef.current[driverId].setLatLng([lat, lng]);
    }

    // Tracer le trajet
    if (!trailsRef.current[driverId]) {
      trailsRef.current[driverId] = { points: [], line: null };
    }
    const trail = trailsRef.current[driverId];
    trail.points.push([lat, lng]);
    if (trail.points.length > 100) trail.points.shift();

    if (trail.line) {
      trail.line.setLatLngs(trail.points);
    } else if (trail.points.length > 1) {
      trail.line = L.polyline(trail.points, {
        color: '#534AB7', weight: 3, opacity: 0.7, dashArray: '6 4'
      }).addTo(mapRef.current);
    }

    // Mettre à jour la position dans le state
    setDrivers(prev => prev.map(d =>
      d._id === driverId
        ? { ...d, currentLocation: { lat, lng, updatedAt: new Date() } }
        : d
    ));
  };

  // ─── Actions admin depuis les popups ───────────────────────────────────────
  useEffect(() => {
    window.adminAction = async (driverId, status) => {
      try {
        await api.patch(`/admin/drivers/${driverId}`, { status });
        loadData();
        if (mapRef.current) mapRef.current.closePopup();
      } catch {}
    };
    window.trackOrder = (orderId) => {
      navigate(`/orders/${orderId}/track`);
    };
    return () => { delete window.adminAction; delete window.trackOrder; };
  }, [navigate]);

  // ─── Centrer sur un livreur ────────────────────────────────────────────────
  const focusDriver = (driver) => {
    setSelected(driver._id);
    const lat = driver.currentLocation?.lat || NOUAKCHOTT.lat;
    const lng = driver.currentLocation?.lng || NOUAKCHOTT.lng;
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16, { animate: true });
      markersRef.current[driver._id]?.openPopup();
    }
  };

  const activeDrivers    = drivers.filter(d => d.status === 'actif');
  const suspendedDrivers = drivers.filter(d => d.status === 'suspendu');
  const activeOrders     = orders.filter(o => ['accepte','en_preparation','en_route'].includes(o.status));

  return (
    <div>
      <div className="page-header">
        <h1>🗺️ Carte en temps réel</h1>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color:'#6b6b67' }}>
            Mis à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
          </span>
          <button className="btn-sm" onClick={loadData}>🔄 Actualiser</button>
        </div>
      </div>

      {/* Stats rapides */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        <div className="metric-card">
          <p className="mlabel">Livreurs actifs</p>
          <p className="mvalue" style={{ color:'#3B6D11' }}>{activeDrivers.length}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Total livreurs</p>
          <p className="mvalue">{drivers.length}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Commandes en cours</p>
          <p className="mvalue" style={{ color:'#534AB7' }}>{activeOrders.length}</p>
        </div>
        <div className="metric-card">
          <p className="mlabel">Suspendus</p>
          <p className="mvalue" style={{ color:'#A32D2D' }}>{suspendedDrivers.length}</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
        {/* Carte */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div id="live-map" style={{ height:520, width:'100%' }} />

          {/* Légende */}
          <div style={{ padding:'10px 16px', borderTop:'.5px solid rgba(0,0,0,0.09)', display:'flex', gap:16, flexWrap:'wrap' }}>
            {Object.entries(DRIVER_COLORS).map(([status, color]) => (
              <div key={status} style={{ display:'flex', alignItems:'center', gap:5 }}>
                <div style={{ width:12, height:12, borderRadius:'50%', background:color }} />
                <span style={{ fontSize:11, color:'#6b6b67' }}>{STATUS_LABELS[status]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel droit */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, overflowY:'auto', maxHeight:580 }}>

          {/* Liste des livreurs */}
          <div className="card">
            <p style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>
              Livreurs ({drivers.length})
            </p>
            {drivers.length === 0
              ? <p style={{ fontSize:12, color:'#6b6b67', textAlign:'center', padding:12 }}>Aucun livreur</p>
              : drivers.map(d => {
                const color = DRIVER_COLORS[d.status] || '#6b6b67';
                const hasOrder = orders.find(o => o.driver?._id === d._id && ['accepte','en_preparation','en_route'].includes(o.status));
                return (
                  <div key={d._id}
                    onClick={() => focusDriver(d)}
                    style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'8px 10px', borderRadius:8, cursor:'pointer', marginBottom:4,
                      background: selected === d._id ? '#EEEDFE' : 'transparent',
                      border: selected === d._id ? '.5px solid #AFA9EC' : '.5px solid transparent',
                    }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:color+'22', border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🛵</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:500, color:'#1a1a18' }}>
                        {d.user?.firstName} {d.user?.lastName}
                      </p>
                      <p style={{ fontSize:11, color:'#6b6b67' }}>{d.zone} · {(d.solde||0).toLocaleString()} MRU</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontSize:10, color, fontWeight:500 }}>
                        {d.status === 'actif' ? '●' : d.status === 'suspendu' ? '✕' : '○'}
                      </span>
                      {hasOrder && <p style={{ fontSize:10, color:'#534AB7' }}>📦</p>}
                    </div>
                  </div>
                );
              })
            }
          </div>

          {/* Commandes actives */}
          {activeOrders.length > 0 && (
            <div className="card">
              <p style={{ fontSize:13, fontWeight:500, marginBottom:10 }}>
                Livraisons en cours ({activeOrders.length})
              </p>
              {activeOrders.map(o => (
                <div key={o._id}
                  onClick={() => navigate(`/orders/${o._id}/track`)}
                  style={{ padding:'8px 10px', borderRadius:8, background:'#F7F6F2', marginBottom:6, cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <p style={{ fontSize:12, fontWeight:500 }}>#{o._id.slice(-6).toUpperCase()}</p>
                    <span className="badge badge-purple" style={{ fontSize:10 }}>
                      {o.status === 'en_route' ? 'En route' : o.status === 'accepte' ? 'Accepté' : 'Préparation'}
                    </span>
                  </div>
                  <p style={{ fontSize:11, color:'#6b6b67', marginTop:2 }}>
                    {o.driver?.user?.firstName} {o.driver?.user?.lastName} · {o.serviceType}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Actions rapides suspendus */}
          {suspendedDrivers.length > 0 && (
            <div className="card" style={{ borderLeft:'3px solid #A32D2D' }}>
              <p style={{ fontSize:13, fontWeight:500, color:'#A32D2D', marginBottom:10 }}>
                🚫 Comptes suspendus ({suspendedDrivers.length})
              </p>
              {suspendedDrivers.map(d => (
                <div key={d._id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'.5px solid rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize:12 }}>{d.user?.firstName} {d.user?.lastName}</p>
                  <button className="btn-sm" style={{ fontSize:11, color:'#3B6D11', borderColor:'#97C459' }}
                    onClick={() => window.adminAction(d._id, 'hors_ligne')}>
                    Réactiver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
