import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Modal,
  Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../../services/api';
import { COLORS, SERVICE_ICONS, SERVICE_COLORS } from '../../constants';
import useLangStore from '../../stores/langStore';
import useAuthStore from '../../stores/authStore';
import { translations } from '../../i18n';
import { useFavorites } from '../../hooks/useFavorites';

const { width: SW, height: SH } = Dimensions.get('window');
const BROADCAST_KM = 3;

// ─── Lieux populaires de Nouakchott ──────────────────────────────────────────
const PLACES_LOCAUX = [
  { label: 'Marché Capitale',           lat: 18.0858, lng: -15.9785 },
  { label: 'Marché Cinquième',          lat: 18.0908, lng: -15.9756 },
  { label: 'Marché Carrefour',          lat: 18.0823, lng: -15.9801 },
  { label: 'Marché Médina',             lat: 18.0936, lng: -15.9847 },
  { label: 'Aéroport de Nouakchott',    lat: 18.0981, lng: -15.9478 },
  { label: 'Hôpital National',          lat: 18.0795, lng: -15.9701 },
  { label: 'Hôpital Cheikh Zayed',      lat: 18.0834, lng: -15.9734 },
  { label: 'Hôpital Mère Enfant',       lat: 18.0812, lng: -15.9720 },
  { label: 'Université de Nouakchott',  lat: 18.0820, lng: -15.9640 },
  { label: 'Stade Olympique',           lat: 18.0734, lng: -15.9812 },
  { label: 'Port Autonome',             lat: 18.1012, lng: -16.0123 },
  { label: 'Palais Présidentiel',       lat: 18.0893, lng: -15.9812 },
  { label: 'Tevragh Zeina',             lat: 18.1042, lng: -15.9689 },
  { label: 'Ksar',                      lat: 18.0936, lng: -15.9847 },
  { label: 'Sebkha',                    lat: 18.0968, lng: -15.9983 },
  { label: 'Teyarett',                  lat: 18.0793, lng: -15.9852 },
  { label: 'El Mina',                   lat: 18.0823, lng: -16.0012 },
  { label: 'Dar Naim',                  lat: 18.1085, lng: -15.9634 },
  { label: 'Riyadh',                    lat: 18.0765, lng: -15.9731 },
  { label: 'Arafat',                    lat: 18.0602, lng: -15.9456 },
  { label: 'Toujounine',                lat: 18.0502, lng: -15.9467 },
  { label: 'Cité Plaisance',            lat: 18.0978, lng: -15.9534 },
  { label: 'Plage de Nouakchott',       lat: 18.0890, lng: -16.0200 },
  { label: 'Centre Culturel Français',  lat: 18.0867, lng: -15.9801 },
  { label: 'Mosquée Saudi',             lat: 18.0856, lng: -15.9812 },
  { label: 'Carrefour Espagne',         lat: 18.0912, lng: -15.9723 },
  { label: 'Carrefour Madrid',          lat: 18.0856, lng: -15.9867 },
  { label: 'Zone Franche',              lat: 18.1034, lng: -15.9467 },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nominatimSearch(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Nouakchott')}&limit=6&countrycodes=mr&accept-language=fr`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AmderApp/1.0' } });
    const data = await res.json();
    return data.map(d => ({
      label: d.display_name.split(',').slice(0, 3).join(', '),
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    }));
  } catch { return []; }
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'AmderApp/1.0' } }
    );
    const data = await res.json();
    const a = data.address || {};
    return a.suburb || a.neighbourhood || a.quarter || a.city_district
        || a.village || a.town || data.display_name?.split(',')[0]
        || 'Ma position';
  } catch { return 'Ma position actuelle'; }
}

function filterLocal(query) {
  if (!query) return [];
  const q = query.toLowerCase();
  return PLACES_LOCAUX.filter(p => p.label.toLowerCase().includes(q)).slice(0, 5);
}

// ─── Modal carte plein écran ──────────────────────────────────────────────────
function MapPickerModal({ visible, onClose, onConfirm, initialRegion, title }) {
  const { lang } = useLangStore();
  const t = translations[lang];

  const mapRef = useRef(null);
  const [region, setRegion] = useState(initialRegion || {
    latitude: 18.0858, longitude: -15.9785,
    latitudeDelta: 0.01, longitudeDelta: 0.01,
  });
  const [label,      setLabel]      = useState('');
  const [geocoding,  setGeocoding]  = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchRes,  setSearchRes]  = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const geocodeTimer  = useRef(null);
  const searchTimer   = useRef(null);

  // reset à chaque ouverture
  useEffect(() => {
    if (visible) {
      setRegion(initialRegion || { latitude: 18.0858, longitude: -15.9785, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      setLabel('');
      setSearchText('');
      setSearchRes([]);
      setShowSearch(false);
    }
  }, [visible]);

  const onRegionChangeComplete = useCallback((r) => {
    setRegion(r);
    clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      setGeocoding(true);
      const l = await reverseGeocode(r.latitude, r.longitude);
      setLabel(l);
      setGeocoding(false);
    }, 600);
  }, []);

  const onSearchChange = (v) => {
    setSearchText(v);
    clearTimeout(searchTimer.current);
    if (!v.trim()) { setSearchRes([]); return; }
    const local = filterLocal(v);
    setSearchRes(local);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const remote = await nominatimSearch(v);
      const seen = new Set(local.map(p => p.label));
      setSearchRes([...local, ...remote.filter(r => !seen.has(r.label))].slice(0, 8));
      setSearching(false);
    }, 400);
  };

  const pickSearchResult = (item) => {
    const r = { latitude: item.lat, longitude: item.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    mapRef.current?.animateToRegion(r, 500);
    setRegion(r);
    setLabel(item.label);
    setSearchText(item.label);
    setSearchRes([]);
    setShowSearch(false);
  };

  const confirm = () => {
    onConfirm({ label: label || t.new_map_selected, lat: region.latitude, lng: region.longitude });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
        />

        {/* Pin central fixe */}
        <View pointerEvents="none" style={mp.pinContainer}>
          <View style={mp.pin}>
            <Text style={{ fontSize: 32 }}>📍</Text>
          </View>
          <View style={mp.pinShadow} />
        </View>

        {/* Barre du haut : retour + recherche */}
        <View style={mp.topBar}>
          <TouchableOpacity onPress={onClose} style={mp.backBtn}>
            <Text style={{ fontSize: 20, color: COLORS.text }}>←</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={mp.searchBox}
            onPress={() => setShowSearch(true)}
            activeOpacity={1}
          >
            <Text style={{ fontSize: 14 }}>🔍</Text>
            <TextInput
              style={mp.searchInput}
              value={searchText}
              onChangeText={onSearchChange}
              placeholder={t.new_map_search_ph || 'Rechercher un lieu…'}
              placeholderTextColor={COLORS.muted}
              onFocus={() => setShowSearch(true)}
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={COLORS.purple} style={{ marginRight: 4 }} />}
          </TouchableOpacity>
        </View>

        {/* Résultats de recherche */}
        {showSearch && searchRes.length > 0 && (
          <View style={mp.searchDropdown}>
            {searchRes.map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[mp.searchItem, i < searchRes.length - 1 && mp.searchItemBorder]}
                onPress={() => pickSearchResult(r)}
              >
                <Text style={{ fontSize: 13, color: COLORS.text }} numberOfLines={2}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Barre du bas : adresse + confirmer */}
        <View style={mp.bottomBar}>
          <View style={mp.addressRow}>
            <Text style={mp.addressIcon}>📍</Text>
            <View style={{ flex: 1 }}>
              {geocoding
                ? <ActivityIndicator size="small" color={COLORS.purple} />
                : <Text style={mp.addressText} numberOfLines={2}>{label || t.new_map_moving}</Text>
              }
            </View>
          </View>
          <TouchableOpacity style={mp.confirmBtn} onPress={confirm} disabled={geocoding}>
            <Text style={mp.confirmTxt}>{title?.toUpperCase() || t.new_map_confirm}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Champ adresse avec recherche + favoris ──────────────────────────────────
function AddressField({ label, icon, value, onSelect, placeholder, onOpenMap, favorites = [] }) {
  const { lang } = useLangStore();
  const t = translations[lang];

  const [text, setText]       = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => { setText(value?.label || ''); }, [value?.label]);

  const onChangeText = (v) => {
    setText(v);
    onSelect(null);
    clearTimeout(debounceRef.current);
    if (!v) { setResults([]); setOpen(favorites.length > 0); return; }
    const local = filterLocal(v);
    if (local.length > 0) { setResults(local); setOpen(true); }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const remote = await nominatimSearch(v);
      const allLabels = new Set(local.map(p => p.label));
      const merged = [...local, ...remote.filter(r => !allLabels.has(r.label))].slice(0, 8);
      setResults(merged);
      setOpen(merged.length > 0);
      setLoading(false);
    }, 400);
  };

  const pick = (item) => {
    onSelect(item);
    setText(item.label);
    setResults([]);
    setOpen(false);
    setFocused(false);
  };

  const onFocus = () => {
    setFocused(true);
    if (!text && favorites.length > 0) setOpen(true);
  };

  const confirmed = !!value;
  const showFavs  = focused && !text && favorites.length > 0;

  return (
    <View style={st.fieldWrap}>
      <View style={[st.fieldHeader, confirmed && st.fieldHeaderOk]}>
        <Text style={st.fieldIcon}>{icon}</Text>
        <Text style={[st.fieldLabel, confirmed && { color: COLORS.green }]}>{label}</Text>
        {confirmed && <Text style={{ color: COLORS.green, fontSize: 16 }}>✓</Text>}
        <TouchableOpacity onPress={onOpenMap} style={st.mapBtn}>
          <Text style={st.mapBtnTxt}>{t.new_map_btn}</Text>
        </TouchableOpacity>
      </View>
      <View style={st.inputRow}>
        <TextInput
          style={[st.inp, confirmed && st.inpOk]}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          onFocus={onFocus}
          onBlur={() => setTimeout(() => { setFocused(false); if (!text) setOpen(false); }, 150)}
        />
        {loading && <ActivityIndicator style={{ marginLeft: 8 }} size="small" color={COLORS.purple} />}
      </View>

      {/* Favoris en chips rapides */}
      {showFavs && (
        <View style={st.favChips}>
          {favorites.map(f => (
            <TouchableOpacity key={f._id} style={st.favChip} onPress={() => pick({ label: f.label, lat: f.lat, lng: f.lng })}>
              <Text style={st.favChipIcon}>{f.icon}</Text>
              <Text style={st.favChipName} numberOfLines={1}>{f.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {open && results.length > 0 && (
        <View style={st.dropdown}>
          {results.map((r, i) => (
            <TouchableOpacity
              key={i}
              style={[st.dropdownItem, i < results.length - 1 && st.dropdownBorder]}
              onPress={() => pick(r)}
            >
              <Text style={{ fontSize: 12, color: COLORS.text }} numberOfLines={2}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────
export default function NewOrderScreen({ route, navigation }) {
  const { orderType = 'livraison', serviceType: initialService = 'colis' } = route.params || {};
  const { lang } = useLangStore();
  const { user, updateUser } = useAuthStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const availableCredits = user?.referralCredits || 0;

  const SERVICES = [
    { key: 'nourriture', label: t.svc_nourriture },
    { key: 'courses',    label: t.svc_courses    },
    { key: 'colis',      label: t.svc_colis      },
    { key: 'pharmacie',  label: t.svc_pharmacie  },
  ];

  const { favorites, load: loadFavs } = useFavorites();

  const [serviceType,  setServiceType]  = useState(initialService);
  const [pickup,       setPickup]       = useState(null);
  const [delivery,     setDelivery]     = useState(null);
  const [trajetOuvert, setTrajetOuvert] = useState(false);
  const [locLoading,   setLocLoading]   = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [mapTarget,    setMapTarget]    = useState(null);
  const [pricing,      setPricing]      = useState(null);
  const [estimating,   setEstimating]   = useState(false);
  const estimateTimer = useRef(null);

  useEffect(() => { loadFavs(); }, []);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = loc.coords;
          const label = await reverseGeocode(latitude, longitude);
          setPickup({ label, lat: latitude, lng: longitude });
        } catch {}
      }
      setLocLoading(false);
    })();
  }, []);

  useEffect(() => {
    clearTimeout(estimateTimer.current);
    if (!pickup) { setPricing(null); return; }
    if (!trajetOuvert && !delivery) { setPricing(null); return; }
    setEstimating(true);
    estimateTimer.current = setTimeout(async () => {
      try {
        const body = {
          orderType,
          serviceType: orderType === 'livraison' ? serviceType : undefined,
          pickupLat: pickup.lat, pickupLng: pickup.lng,
        };
        if (!trajetOuvert && delivery) {
          body.deliveryLat = delivery.lat;
          body.deliveryLng = delivery.lng;
        }
        const { data } = await api.post('/orders/estimate', body);
        if (data.success) setPricing({ ...data.pricing, distanceKm: data.distanceKm });
      } catch {}
      setEstimating(false);
    }, 600);
  }, [pickup, delivery, trajetOuvert, orderType, serviceType]);

  const canSubmit = !!pickup && (trajetOuvert || !!delivery) && !submitting;

  const submitOrder = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = {
        orderType,
        serviceType: orderType === 'livraison' ? serviceType : null,
        items: [],
        pickupAddress: { label: pickup.label, lat: pickup.lat, lng: pickup.lng },
        broadcastRadius: BROADCAST_KM,
        trajetOuvert: trajetOuvert || false,
      };
      if (!trajetOuvert && delivery) {
        body.deliveryAddress = { label: delivery.label, lat: delivery.lat, lng: delivery.lng };
        body.distanceKm = Math.round((pricing?.distanceKm || 0) * 10) / 10;
      }
      const { data } = await api.post('/orders', body);
      if (!data.success) throw new Error(data.message);

      if (data.creditsApplied > 0) {
        updateUser({ referralCredits: data.remainingCredits ?? 0 });
      }

      const creditNote = data.creditsApplied > 0
        ? (isAr ? ` (−${data.creditsApplied} MRU رصيد)` : ` (−${data.creditsApplied} MRU crédits déduits)`)
        : '';
      const alertBody = isAr
        ? `${orderType === 'course' ? 'السائقين' : 'الموصّلين'} المتاحين في دائرة ${BROADCAST_KM} كم تم إخطارهم.${creditNote}`
        : `Les ${orderType === 'course' ? 'chauffeurs' : 'livreurs'} disponibles dans un rayon de ${BROADCAST_KM} km ont été notifiés.${creditNote}`;

      Alert.alert(t.new_alert_title, alertBody, [
        { text: t.new_alert_track, onPress: () => navigation.replace('OrderTrack', { orderId: data.order._id }) },
        { text: t.new_alert_ok,    onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(isAr ? 'خطأ' : 'Erreur', err.message || t.new_err_cmd);
    } finally { setSubmitting(false); }
  };

  const pickupRegion = pickup
    ? { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : undefined;
  const deliveryRegion = delivery
    ? { latitude: delivery.lat, longitude: delivery.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : pickupRegion;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ── Type ─────────────────────────────────────────────────────────── */}
        <Text style={st.sectionTitle}>
          {orderType === 'course' ? t.new_type_course : t.new_type_service}
        </Text>

        {orderType === 'course' ? (
          <View style={[st.chip, { backgroundColor:'#EEF0FF', borderColor: COLORS.purple, marginBottom:16 }]}>
            <Text style={{ fontSize:20 }}>🚖</Text>
            <Text style={[st.chipLabel, { color: COLORS.purple, fontWeight:'700' }]}>{t.new_type_course}</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {SERVICES.map(s => {
              const active = s.key === serviceType;
              const c = SERVICE_COLORS[s.key];
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setServiceType(s.key)}
                  style={[st.chip, active && { backgroundColor: c.bg, borderColor: c.text }]}
                >
                  <Text style={{ fontSize: 20 }}>{SERVICE_ICONS[s.key]}</Text>
                  <Text style={[st.chipLabel, active && { color: c.text, fontWeight: '700' }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── Trajet ouvert ─────────────────────────────────────────────────── */}
        {orderType === 'course' && (
          <TouchableOpacity
            style={[st.trajetOuvertBtn, trajetOuvert && st.trajetOuvertBtnActive]}
            onPress={() => { setTrajetOuvert(v => !v); if (!trajetOuvert) setDelivery(null); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[st.trajetOuvertLabel, trajetOuvert && { color: '#fff' }]}>
                {t.new_open_trip}
              </Text>
              <Text style={[st.trajetOuvertDesc, trajetOuvert && { color: 'rgba(255,255,255,0.8)' }]}>
                {t.new_open_trip_desc}
              </Text>
            </View>
            <View style={[st.toggle, trajetOuvert && st.toggleOn]}>
              <View style={[st.toggleDot, trajetOuvert && st.toggleDotOn]} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Point de départ ───────────────────────────────────────────────── */}
        {locLoading ? (
          <View style={[st.fieldWrap, { flexDirection:'row', alignItems:'center', gap:10, padding:16 }]}>
            <ActivityIndicator color={COLORS.green} />
            <Text style={{ color: COLORS.muted, fontSize:13 }}>{t.new_gps_loading}</Text>
          </View>
        ) : (
          <AddressField
            label={t.new_pickup_label}
            icon="📍"
            value={pickup}
            onSelect={setPickup}
            placeholder={t.new_pickup_ph}
            onOpenMap={() => setMapTarget('pickup')}
            favorites={favorites}
          />
        )}

        {/* ── Destination ───────────────────────────────────────────────────── */}
        {!trajetOuvert && (
          <AddressField
            label={t.new_dest_label}
            icon="🏁"
            value={delivery}
            onSelect={setDelivery}
            placeholder={t.new_dest_ph}
            onOpenMap={() => setMapTarget('delivery')}
            favorites={favorites}
          />
        )}

        {/* ── Récap ─────────────────────────────────────────────────────────── */}
        {pickup && delivery && !trajetOuvert && (
          <View style={st.summary}>
            <View style={st.summaryRow}>
              <Text style={st.summaryLabel}>{t.new_summary_dept}</Text>
              <Text style={st.summaryVal} numberOfLines={1}>{pickup.label}</Text>
            </View>
            <View style={st.summaryRow}>
              <Text style={st.summaryLabel}>{t.new_summary_arrival}</Text>
              <Text style={st.summaryVal} numberOfLines={1}>{delivery.label}</Text>
            </View>
            <View style={[st.summaryRow, { marginTop:8, paddingTop:8, borderTopWidth:.5, borderTopColor: COLORS.border }]}>
              <Text style={st.summaryLabel}>{t.new_distance}</Text>
              <Text style={[st.summaryVal, { color: COLORS.purple, fontWeight:'700' }]}>{(pricing?.distanceKm || 0).toFixed(1)} km</Text>
            </View>
          </View>
        )}

        {/* ── Estimation de prix ────────────────────────────────────────────── */}
        {(pickup && (delivery || trajetOuvert)) && (
          <View style={st.priceCard}>
            {estimating ? (
              <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                <ActivityIndicator color={COLORS.purple} size="small" />
                <Text style={{ color: COLORS.muted, fontSize:13 }}>{t.new_price_calc}</Text>
              </View>
            ) : pricing ? (
              <>
                <View style={st.priceHeader}>
                  <Text style={st.priceLabelMain}>{trajetOuvert ? t.new_min_fare : t.new_price_est}</Text>
                  <Text style={st.priceTotalMain}>{(pricing.total || 0).toLocaleString()} MRU</Text>
                </View>
                {availableCredits > 0 && (
                  <View style={st.creditPreview}>
                    <Text style={st.creditPreviewTxt}>
                      {t.new_credit_preview} : {Math.min(availableCredits, pricing.total || 0)} {t.new_credit_applied}
                    </Text>
                  </View>
                )}
                {!trajetOuvert && (
                  <View style={st.priceDetails}>
                    <View style={st.priceRow}>
                      <Text style={st.priceLabel}>{t.new_base_fee}</Text>
                      <Text style={st.priceVal}>{pricing.base} MRU</Text>
                    </View>
                    {pricing.distanceKm > 0 && (
                      <View style={st.priceRow}>
                        <Text style={st.priceLabel}>{pricing.distanceKm?.toFixed(1)} km × {pricing.perKm} MRU/km</Text>
                        <Text style={st.priceVal}>{Math.round(pricing.distanceKm * pricing.perKm)} MRU</Text>
                      </View>
                    )}
                    {pricing.isNight && (
                      <View style={st.priceRow}>
                        <Text style={[st.priceLabel, { color: COLORS.amber }]}>{t.new_night}</Text>
                        <Text style={[st.priceVal,   { color: COLORS.amber }]}>{t.new_night_val}</Text>
                      </View>
                    )}
                  </View>
                )}
                {trajetOuvert && (
                  <Text style={st.priceNote}>{t.new_price_note}</Text>
                )}
              </>
            ) : null}
          </View>
        )}

        {/* ── Bouton envoi ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[st.btn, !canSubmit && st.btnDisabled]}
          onPress={submitOrder}
          disabled={!canSubmit}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.btnTxt}>
                {!pickup          ? t.new_btn_no_loc :
                 !trajetOuvert && !delivery ? t.new_btn_no_dest :
                 orderType === 'course'     ? t.new_btn_ride :
                 t.new_btn_order}
              </Text>
          }
        </TouchableOpacity>

      </ScrollView>

      {/* ── Modals carte ──────────────────────────────────────────────────────── */}
      <MapPickerModal
        visible={mapTarget === 'pickup'}
        title={t.new_map_pickup_title}
        initialRegion={pickupRegion}
        onClose={() => setMapTarget(null)}
        onConfirm={(point) => { setPickup(point); setMapTarget(null); }}
      />
      <MapPickerModal
        visible={mapTarget === 'delivery'}
        title={t.new_map_dest_title}
        initialRegion={deliveryRegion}
        onClose={() => setMapTarget(null)}
        onConfirm={(point) => { setDelivery(point); setMapTarget(null); }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  sectionTitle:        { fontSize:13, fontWeight:'600', color: COLORS.muted, marginBottom:10, textTransform:'uppercase', letterSpacing:.5 },
  chip:                { flexDirection:'row', alignItems:'center', gap:7, borderWidth:1, borderColor: COLORS.border, borderRadius:20, paddingHorizontal:14, paddingVertical:9, marginRight:8, backgroundColor:'#fff' },
  chipLabel:           { fontSize:13, color: COLORS.muted },
  trajetOuvertBtn:     { backgroundColor:'#fff', borderRadius:14, padding:14, flexDirection:'row', alignItems:'center', gap:12, borderWidth:1, borderColor: COLORS.border, marginBottom:16 },
  trajetOuvertBtnActive:{ backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  trajetOuvertLabel:   { fontSize:14, fontWeight:'600', color: COLORS.text },
  trajetOuvertDesc:    { fontSize:11, color: COLORS.muted, marginTop:2 },
  toggle:              { width:40, height:22, borderRadius:11, backgroundColor:'#ddd', padding:2, justifyContent:'center' },
  toggleOn:            { backgroundColor:'rgba(255,255,255,0.35)' },
  toggleDot:           { width:18, height:18, borderRadius:9, backgroundColor:'#aaa' },
  toggleDotOn:         { backgroundColor:'#fff', alignSelf:'flex-end' },
  fieldWrap:           { backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:12, borderWidth:.5, borderColor: COLORS.border },
  fieldHeader:         { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  fieldHeaderOk:       {},
  fieldIcon:           { fontSize:18 },
  fieldLabel:          { flex:1, fontSize:14, fontWeight:'600', color: COLORS.text },
  mapBtn:              { backgroundColor: COLORS.purpleLight, borderRadius:10, paddingHorizontal:10, paddingVertical:5 },
  mapBtnTxt:           { fontSize:11, color: COLORS.purple, fontWeight:'600' },
  inputRow:            { flexDirection:'row', alignItems:'center' },
  inp:                 { flex:1, borderWidth:.5, borderColor: COLORS.border, borderRadius:10, padding:11, fontSize:13, backgroundColor: COLORS.bg, color: COLORS.text },
  inpOk:               { borderColor: COLORS.green, backgroundColor:'#F2FAF0' },
  dropdown:            { marginTop:6, borderWidth:.5, borderColor: COLORS.border, borderRadius:10, overflow:'hidden', backgroundColor:'#fff' },
  dropdownItem:        { padding:12 },
  dropdownBorder:      { borderBottomWidth:.5, borderBottomColor: COLORS.border },
  favChips:            { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8, marginBottom:4 },
  favChip:             { flexDirection:'row', alignItems:'center', gap:5, backgroundColor: COLORS.purpleLight, borderRadius:20, paddingHorizontal:12, paddingVertical:7 },
  favChipIcon:         { fontSize:14 },
  favChipName:         { fontSize:12, fontWeight:'600', color: COLORS.purple, maxWidth:90 },
  summary:             { backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:16, borderWidth:.5, borderColor: COLORS.border },
  summaryRow:          { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  summaryLabel:        { fontSize:12, color: COLORS.muted, flex:.4 },
  summaryVal:          { fontSize:12, color: COLORS.text, flex:.6, textAlign:'right' },
  btn:            { backgroundColor: COLORS.purple, borderRadius:14, padding:16, alignItems:'center' },
  btnDisabled:    { backgroundColor:'#C4C0E4' },
  btnTxt:         { color:'#fff', fontWeight:'700', fontSize:15 },
  priceCard:      { backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:16, borderWidth:1, borderColor: COLORS.purpleLight },
  priceHeader:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  priceLabelMain: { fontSize:13, fontWeight:'600', color: COLORS.muted },
  priceTotalMain: { fontSize:22, fontWeight:'800', color: COLORS.purple },
  priceDetails:   { borderTopWidth:.5, borderTopColor: COLORS.border, paddingTop:10, gap:6 },
  priceRow:       { flexDirection:'row', justifyContent:'space-between' },
  priceLabel:     { fontSize:12, color: COLORS.muted },
  priceVal:       { fontSize:12, color: COLORS.text, fontWeight:'600' },
  priceNote:      { fontSize:11, color: COLORS.muted, fontStyle:'italic', marginTop:6 },
  creditPreview:  { backgroundColor:'#F0FFF4', borderRadius:8, padding:8, marginTop:8 },
  creditPreviewTxt:{ fontSize:12, color:'#1A7A3C', fontWeight:'600', textAlign:'center' },
});

const mp = StyleSheet.create({
  pinContainer:      { position:'absolute', top:0, left:0, right:0, bottom:0, alignItems:'center', justifyContent:'center', pointerEvents:'none' },
  pin:               { marginBottom: -8 },
  pinShadow:         { width:12, height:5, borderRadius:6, backgroundColor:'rgba(0,0,0,0.25)' },
  topBar:            { position:'absolute', top:0, left:0, right:0, flexDirection:'row', alignItems:'center', gap:10, padding:12, paddingTop: Platform.OS === 'ios' ? 54 : 16, backgroundColor:'rgba(255,255,255,0.97)' },
  backBtn:           { width:38, height:38, borderRadius:19, backgroundColor:'#f0f0f0', alignItems:'center', justifyContent:'center' },
  searchBox:         { flex:1, flexDirection:'row', alignItems:'center', gap:8, backgroundColor: COLORS.bg, borderRadius:12, paddingHorizontal:12, paddingVertical:9, borderWidth:.5, borderColor: COLORS.border },
  searchInput:       { flex:1, fontSize:14, color: COLORS.text, padding:0 },
  searchDropdown:    { position:'absolute', top: Platform.OS === 'ios' ? 110 : 72, left:12, right:12, backgroundColor:'#fff', borderRadius:12, borderWidth:.5, borderColor: COLORS.border, shadowColor:'#000', shadowOffset:{width:0,height:4}, shadowOpacity:.1, shadowRadius:8, elevation:10, zIndex:999, maxHeight:280 },
  searchItem:        { padding:14 },
  searchItemBorder:  { borderBottomWidth:.5, borderBottomColor: COLORS.border },
  bottomBar:         { position:'absolute', bottom:0, left:0, right:0, backgroundColor:'#fff', padding:16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, borderTopLeftRadius:20, borderTopRightRadius:20, shadowColor:'#000', shadowOffset:{ width:0, height:-2 }, shadowOpacity:.1, shadowRadius:10, elevation:12 },
  addressRow:        { flexDirection:'row', alignItems:'center', gap:10, marginBottom:14 },
  addressIcon:       { fontSize:20 },
  addressText:       { fontSize:13, color: COLORS.text, fontWeight:'500' },
  confirmBtn:        { backgroundColor: COLORS.purple, borderRadius:14, padding:16, alignItems:'center' },
  confirmTxt:        { color:'#fff', fontWeight:'700', fontSize:15, letterSpacing:.5 },
});
