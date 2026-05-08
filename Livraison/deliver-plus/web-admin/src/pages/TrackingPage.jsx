import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import api from '../services/api';

const mkIcon = (emoji, bg) => L.divIcon({
  html: `<div style="width:36px;height:36px;background:${bg};border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;">${emoji}</div>`,
  iconSize:[36,36], iconAnchor:[18,18], className:'',
});

const DRIVER_ICON  = mkIcon('🛵','#534AB7');
const CLIENT_ICON  = mkIcon('🏠','#185FA5');
const PICKUP_ICON  = mkIcon('📍','#854F0B');

const STATUS_STEPS = [
  { key:'en_attente',      label:'Commande reçue' },
  { key:'accepte',         label:'Livreur assigné' },
  { key:'en_preparation',  label:'En préparation' },
  { key:'en_route',        label:'En route' },
  { key:'livre',           label:'Livré ✓' },
];

export default function TrackingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [trail, setTrail] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const socketRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    api.get(`/orders/${id}`).then(r => {
      setOrder(r.data.order);
      const loc = r.data.order.driver?.currentLocation;
      if (loc) { setDriverPos([loc.lat, loc.lng]); setTrail([[loc.lat, loc.lng]]); }
    });
    api.get('/drivers/active').then(r => setDrivers(r.data.drivers));

    const token = localStorage.getItem('token');
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_admin');
    socket.emit('track_order', id);

    socket.on('driver_location', ({ lat, lng }) => {
      setDriverPos([lat, lng]);
      setTrail(prev => [...prev.slice(-100), [lat, lng]]);
      mapRef.current?.panTo([lat, lng], { animate: true });
    });
    socket.on('order_status_update', ({ status }) => setOrder(p => p ? { ...p, status } : p));

    return () => socket.disconnect();
  }, [id]);

  const assignDriver = async driverId => {
    try {
      await api.patch(`/orders/${id}/assign`, { driverId });
      api.get(`/orders/${id}`).then(r => setOrder(r.data.order));
    } catch (e) { alert('Erreur: ' + e.message); }
  };

  if (!order) return <div className="loading-center"><div className="spinner"/></div>;

  const deliveryPos = order.deliveryAddress?.lat ? [order.deliveryAddress.lat, order.deliveryAddress.lng] : [18.0858, -15.9785];
  const pickupPos   = order.pickupAddress?.lat   ? [order.pickupAddress.lat,   order.pickupAddress.lng]   : [18.095, -15.965];
  const activeStep  = STATUS_STEPS.findIndex(s => s.key === order.status);

  return (
    <div>
      <div className="page-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button className="btn-sm" onClick={() => navigate('/orders')}>← Retour</button>
          <h1>Suivi #{id.slice(-6).toUpperCase()}</h1>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'#639922', animation:'none' }}/>
            <span style={{ fontSize:12, color:'#3B6D11', fontWeight:500 }}>EN DIRECT</span>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:16 }}>
        {/* Map */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <MapContainer
            center={driverPos || deliveryPos}
            zoom={14}
            style={{ height:480 }}
            ref={mapRef}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap" />
            {driverPos && <Marker position={driverPos} icon={DRIVER_ICON}><Popup>🛵 Livreur</Popup></Marker>}
            <Marker position={deliveryPos} icon={CLIENT_ICON}><Popup>🏠 Client</Popup></Marker>
            <Marker position={pickupPos} icon={PICKUP_ICON}><Popup>📍 Retrait</Popup></Marker>
            {trail.length > 1 && <Polyline positions={trail} color="#534AB7" weight={3} opacity={0.6} dashArray="6 4" />}
          </MapContainer>

          {/* Steps bar */}
          <div style={{ padding:'12px 16px', borderTop:'.5px solid rgba(0,0,0,0.09)', display:'flex', gap:0, alignItems:'center' }}>
            {STATUS_STEPS.map((s, i) => (
              <div key={s.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}>
                {i > 0 && <div style={{ position:'absolute', left:'-50%', top:8, width:'100%', height:2,
                  background: i <= activeStep ? '#534AB7' : '#e0e0e0' }} />}
                <div style={{ width:18, height:18, borderRadius:'50%', zIndex:1,
                  background: i <= activeStep ? '#534AB7' : '#e0e0e0',
                  border: i === activeStep ? '3px solid #EEEDFE' : 'none' }} />
                <p style={{ fontSize:10, color: i <= activeStep ? '#534AB7':'#6b6b67', marginTop:4, textAlign:'center' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Driver card */}
          <div className="card">
            <p style={{ fontSize:12, fontWeight:500, marginBottom:10 }}>Livreur</p>
            {order.driver ? (
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'#EAF3DE', color:'#27500A', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:500 }}>
                  {order.driver.user?.firstName?.[0]}{order.driver.user?.lastName?.[0]}
                </div>
                <div>
                  <p style={{ fontWeight:500 }}>{order.driver.user?.firstName} {order.driver.user?.lastName}</p>
                  <p style={{ fontSize:11, color:'#6b6b67' }}>{order.driver.user?.phone}</p>
                  <p style={{ fontSize:11, color:'#854F0B' }}>{order.driver.stats?.averageRating?.toFixed(1)} ★ · {order.driver.vehicleType}</p>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ color:'#6b6b67', fontSize:12, marginBottom:10 }}>Aucun livreur assigné</p>
                <select style={{ marginBottom:8 }} id="driver-select">
                  <option value="">Choisir un livreur...</option>
                  {drivers.map(d => <option key={d._id} value={d._id}>{d.user?.firstName} {d.user?.lastName} — {d.zone}</option>)}
                </select>
                <button className="btn-primary btn-sm" onClick={() => {
                  const v = document.getElementById('driver-select').value;
                  if (v) assignDriver(v);
                }}>Assigner</button>
              </div>
            )}
          </div>

          {/* Order details */}
          <div className="card">
            <p style={{ fontSize:12, fontWeight:500, marginBottom:10 }}>Détails commande</p>
            <p style={{ fontSize:12, color:'#6b6b67', marginBottom:4 }}>Service : <span style={{ color:'#1a1a18', textTransform:'capitalize' }}>{order.serviceType}</span></p>
            {order.items?.map((item, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                <span>{item.name} ×{item.quantity}</span>
                <span>{(item.price * item.quantity).toLocaleString()} MRU</span>
              </div>
            ))}
            <div style={{ borderTop:'.5px solid rgba(0,0,0,0.09)', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#6b6b67' }}>Frais livraison</span>
              <span style={{ fontSize:12 }}>{order.pricing?.deliveryFee} MRU</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
              <span style={{ fontSize:13, fontWeight:500 }}>Total</span>
              <span style={{ fontSize:13, fontWeight:500 }}>{order.pricing?.total?.toLocaleString()} MRU</span>
            </div>
          </div>

          {/* Client */}
          <div className="card">
            <p style={{ fontSize:12, fontWeight:500, marginBottom:8 }}>Client</p>
            <p style={{ fontSize:13 }}>{order.client?.firstName} {order.client?.lastName}</p>
            <p style={{ fontSize:12, color:'#6b6b67' }}>{order.client?.phone}</p>
            <p style={{ fontSize:12, color:'#6b6b67', marginTop:4 }}>📍 {order.deliveryAddress?.label || order.deliveryAddress?.zone}</p>
          </div>

          {/* Actions */}
          <div className="card">
            <p style={{ fontSize:12, fontWeight:500, marginBottom:8 }}>Actions admin</p>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {order.status === 'en_route' && (
                <button className="btn-primary btn-sm" onClick={() => api.patch(`/orders/${id}/status`, { status:'livre' }).then(() => setOrder(p => ({ ...p, status:'livre' })))}>
                  Marquer comme livré
                </button>
              )}
              {order.status === 'en_attente' && (
                <button className="btn-sm" onClick={() => api.patch(`/orders/${id}/status`, { status:'annule' }).then(() => setOrder(p => ({ ...p, status:'annule' })))}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
