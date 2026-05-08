import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

const NOUAKCHOTT = { lat: 18.0858, lng: -15.9785 };
const SERVICE_ICONS = { nourriture: '🍔', courses: '🛒', colis: '📦', pharmacie: '💊' };
const SERVICE_LABELS = { nourriture: 'Nourriture', courses: 'Courses', colis: 'Colis', pharmacie: 'Pharmacie' };

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const mapRef          = useRef(null);
  const leafletRef      = useRef(null);
  const pickupMarkerRef = useRef(null);
  const deliverMarkerRef = useRef(null);
  const clickHandlerRef = useRef(null);

  const [form, setForm] = useState({
    serviceType: 'colis',
    price: '',
    broadcastRadius: 5,
    commissionPercent: 15,
  });
  const [pickup,   setPickup]   = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [step,     setStep]     = useState('pickup'); // 'pickup' | 'delivery' | 'done'
  const [loading,  setLoading]  = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Ref pour que le handler de clic sur la carte lise toujours l'état courant
  const stepRef     = useRef('pickup');
  const setPickupRef   = useRef(setPickup);
  const setDeliveryRef = useRef(setDelivery);
  setPickupRef.current   = setPickup;
  setDeliveryRef.current = setDelivery;

  useEffect(() => {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const initMap = (L) => {
      if (mapRef.current) return;
      // Clear leftover Leaflet state on the container (React StrictMode double-invoke)
      const container = document.getElementById('create-order-map');
      if (container && container._leaflet_id) delete container._leaflet_id;
      leafletRef.current = L;
      const map = L.map('create-order-map').setView([NOUAKCHOTT.lat, NOUAKCHOTT.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);

      map.on('click', (e) => {
        if (clickHandlerRef.current) clickHandlerRef.current(e.latlng.lat, e.latlng.lng);
      });
    };

    if (window.L) { initMap(window.L); return; }
    const script   = document.createElement('script');
    script.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload  = () => initMap(window.L);
    document.head.appendChild(script);

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Mettre à jour le handler à chaque render pour avoir les refs à jour
  clickHandlerRef.current = (lat, lng) => {
    const L   = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const makeIcon = (color) => L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8], className: '',
    });

    if (stepRef.current === 'pickup') {
      if (pickupMarkerRef.current) pickupMarkerRef.current.remove();
      pickupMarkerRef.current = L.marker([lat, lng], { icon: makeIcon('#3B6D11') })
        .addTo(map).bindPopup('📍 Point de retrait').openPopup();
      setPickupRef.current({ lat, lng, label, zone: label });
      stepRef.current = 'delivery';
      setStep('delivery');

    } else if (stepRef.current === 'delivery') {
      if (deliverMarkerRef.current) deliverMarkerRef.current.remove();
      deliverMarkerRef.current = L.marker([lat, lng], { icon: makeIcon('#A32D2D') })
        .addTo(map).bindPopup('🏠 Point de livraison').openPopup();
      setDeliveryRef.current({ lat, lng, label, zone: label });
      stepRef.current = 'done';
      setStep('done');
    }
  };

  const resetPoints = () => {
    if (pickupMarkerRef.current)  { pickupMarkerRef.current.remove();  pickupMarkerRef.current  = null; }
    if (deliverMarkerRef.current) { deliverMarkerRef.current.remove(); deliverMarkerRef.current = null; }
    setPickup(null);
    setDelivery(null);
    stepRef.current = 'pickup';
    setStep('pickup');
  };

  const handleSubmit = async () => {
    if (!pickup || !delivery)       return toast.error('Sélectionnez les deux points sur la carte');
    if (!form.price || Number(form.price) <= 0) return toast.error('Prix invalide');

    setLoading(true);
    try {
      const { data } = await api.post('/admin/orders', {
        serviceType:       form.serviceType,
        pickupAddress:     { lat: pickup.lat,   lng: pickup.lng,   label: pickup.label,   zone: pickup.label },
        deliveryAddress:   { lat: delivery.lat, lng: delivery.lng, label: delivery.label, zone: delivery.label },
        price:             Number(form.price),
        broadcastRadius:   Number(form.broadcastRadius),
        commissionPercent: Number(form.commissionPercent),
      });
      toast.success(`✅ Commande créée et diffusée à ${data.order.notifiedDrivers?.length ?? 0} livreur(s)`);
      navigate('/orders');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const price      = Number(form.price) || 0;
  const commission = Math.round(price * form.commissionPercent / 100);
  const canSubmit  = pickup && delivery && price > 0 && !loading;

  const STEP_MSG = {
    pickup:   { text: '📍 Cliquez sur la carte pour placer le point de RETRAIT',   color: '#3B6D11', bg: '#EAF3DE' },
    delivery: { text: '🏠 Cliquez sur la carte pour placer le point de LIVRAISON', color: '#A32D2D', bg: '#FCEBEB' },
    done:     { text: '✅ Les deux points sont sélectionnés',                       color: '#534AB7', bg: '#EEEDFE' },
  };

  return (
    <div>
      <div className="page-header">
        <h1>➕ Créer une commande</h1>
        <button onClick={() => navigate('/orders')}>← Retour</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Colonne gauche : formulaire ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Type de service */}
          <div className="card">
            <p style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Type de service</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Object.entries(SERVICE_ICONS).map(([type, icon]) => (
                <button key={type}
                  onClick={() => setForm(f => ({ ...f, serviceType: type }))}
                  style={{
                    padding: '10px 8px', borderRadius: 8, fontSize: 12, textAlign: 'center',
                    background:   form.serviceType === type ? '#EEEDFE' : 'transparent',
                    border:       form.serviceType === type ? '1.5px solid #534AB7' : '.5px solid rgba(0,0,0,0.09)',
                    color:        form.serviceType === type ? '#3C3489' : '#6b6b67',
                    fontWeight:   form.serviceType === type ? 600 : 400,
                  }}>
                  {icon} {SERVICE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Prix + Commission + Rayon */}
          <div className="card">
            <p style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Tarification</p>

            <div className="form-group">
              <label>Prix du service (MRU)</label>
              <input type="number" min="0" placeholder="Ex : 1000"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>

            <div className="form-group">
              <label>Commission plateforme prélevée sur le solde du livreur</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[15, 20].map(p => (
                  <button key={p}
                    onClick={() => setForm(f => ({ ...f, commissionPercent: p }))}
                    style={{
                      flex: 1, padding: '9px', borderRadius: 8, fontSize: 13,
                      background: form.commissionPercent === p ? '#EEEDFE' : 'transparent',
                      border:     form.commissionPercent === p ? '1.5px solid #534AB7' : '.5px solid rgba(0,0,0,0.09)',
                      color:      form.commissionPercent === p ? '#3C3489' : '#6b6b67',
                      fontWeight: form.commissionPercent === p ? 700 : 400,
                    }}>
                    {p} %
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Rayon de diffusion (km)</label>
              <input type="number" min="1" max="30" placeholder="Ex : 3"
                value={form.broadcastRadius}
                onChange={e => setForm(f => ({ ...f, broadcastRadius: e.target.value }))} />
              <p style={{ fontSize: 11, color: '#6b6b67', marginTop: 4 }}>
                Seuls les livreurs actifs dans ce rayon avec un solde ≥ {commission} MRU recevront la commande.
              </p>
            </div>
          </div>

          {/* Résumé financier */}
          {price > 0 && (
            <div className="card" style={{ background: '#F7F6F2', border: '.5px solid rgba(0,0,0,0.09)' }}>
              <p style={{ fontSize: 12, color: '#6b6b67', marginBottom: 10, fontWeight: 500 }}>Résumé financier</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>Prix total</span>
                <span style={{ fontWeight: 600 }}>{price.toLocaleString()} MRU</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#A32D2D' }}>Commission ({form.commissionPercent}%)</span>
                <span style={{ fontWeight: 600, color: '#A32D2D' }}>−{commission.toLocaleString()} MRU</span>
              </div>
              <div style={{ borderTop: '.5px solid rgba(0,0,0,0.09)', paddingTop: 8 }}>
                <p style={{ fontSize: 11, color: '#6b6b67' }}>
                  À la livraison, <strong>{commission.toLocaleString()} MRU</strong> sont prélevés sur le solde du livreur.
                  Le livreur encaisse les <strong>{price.toLocaleString()} MRU</strong> en cash auprès du destinataire.
                </p>
              </div>
            </div>
          )}

          {/* Points sélectionnés */}
          <div className="card">
            <p style={{ fontWeight: 500, marginBottom: 10, fontSize: 13 }}>Points sélectionnés</p>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: pickup ? '#3B6D11' : '#D3D1C7', marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 11, color: '#6b6b67' }}>Retrait</p>
                <p style={{ fontSize: 12 }}>{pickup ? pickup.label : <span style={{ color: '#9b9b97' }}>— non défini</span>}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: delivery ? '#A32D2D' : '#D3D1C7', marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 11, color: '#6b6b67' }}>Livraison</p>
                <p style={{ fontSize: 12 }}>{delivery ? delivery.label : <span style={{ color: '#9b9b97' }}>— non défini</span>}</p>
              </div>
            </div>

            {/* Instruction */}
            <div style={{ background: STEP_MSG[step].bg, borderRadius: 8, padding: '8px 10px', marginBottom: (pickup || delivery) ? 10 : 0 }}>
              <p style={{ fontSize: 12, color: STEP_MSG[step].color, fontWeight: 500 }}>{STEP_MSG[step].text}</p>
            </div>

            {(pickup || delivery) && (
              <button onClick={resetPoints} style={{ width: '100%', fontSize: 11, color: '#A32D2D' }}>
                🔄 Réinitialiser les points
              </button>
            )}
          </div>

          {/* Bouton créer */}
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ padding: '13px', fontSize: 14, opacity: canSubmit ? 1 : 0.45 }}>
            {loading ? '⏳ Création en cours...' : '🚀 Créer et diffuser la commande'}
          </button>
        </div>

        {/* ── Colonne droite : carte ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '.5px solid rgba(0,0,0,0.09)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 500 }}>
              {step === 'pickup' ? '📍 Cliquez pour le point de retrait' :
               step === 'delivery' ? '🏠 Cliquez pour le point de livraison' :
               '✅ Points sélectionnés — rayon de diffusion actif'}
            </p>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b6b67' }}>
              <span><span style={{ color: '#3B6D11', fontWeight: 700 }}>●</span> Retrait</span>
              <span><span style={{ color: '#A32D2D', fontWeight: 700 }}>●</span> Livraison</span>
            </div>
          </div>
          {!mapReady && (
            <div style={{ height: 540, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          )}
          <div id="create-order-map" style={{ height: 540, width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
