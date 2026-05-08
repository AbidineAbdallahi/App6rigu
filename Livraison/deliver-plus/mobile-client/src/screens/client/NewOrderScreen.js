import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import api from '../../services/api';
import { COLORS, SERVICE_ICONS, SERVICE_COLORS } from '../../constants';

const BROADCAST_KM = 3;

const SERVICES = [
  { key: 'nourriture', label: 'Nourriture' },
  { key: 'courses',    label: 'Courses' },
  { key: 'colis',      label: 'Colis' },
  { key: 'pharmacie',  label: 'Pharmacie' },
];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=mr&accept-language=fr`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'AmderApp/1.0' } });
  const data = await res.json();
  return data.map(d => ({
    label: d.display_name.split(',').slice(0, 3).join(', '),
    lat:   parseFloat(d.lat),
    lng:   parseFloat(d.lon),
  }));
}

async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'AmderApp/1.0' } }
    );
    const data = await res.json();
    const a    = data.address || {};
    return a.suburb || a.neighbourhood || a.quarter || a.city_district
        || a.village || a.town || data.display_name?.split(',')[0]
        || 'Ma position';
  } catch { return 'Ma position actuelle'; }
}

function AddressField({ label, icon, value, onSelect, placeholder }) {
  const [text, setText]           = useState(value?.label || '');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]           = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => { setText(value?.label || ''); }, [value?.label]);

  const onChangeText = (t) => {
    setText(t);
    onSelect(null);
    clearTimeout(debounceRef.current);
    if (t.length < 3) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await nominatimSearch(t);
        setResults(r);
        setOpen(r.length > 0);
      } catch {}
      setSearching(false);
    }, 600);
  };

  const pick = (item) => {
    onSelect(item);
    setText(item.label);
    setResults([]);
    setOpen(false);
  };

  const confirmed = !!value;

  return (
    <View style={st.fieldWrap}>
      <View style={[st.fieldHeader, confirmed && st.fieldHeaderOk]}>
        <Text style={st.fieldIcon}>{icon}</Text>
        <Text style={[st.fieldLabel, confirmed && { color: COLORS.green }]}>{label}</Text>
        {confirmed && <Text style={{ color: COLORS.green, fontSize: 16 }}>✓</Text>}
      </View>
      <View style={st.inputRow}>
        <TextInput
          style={[st.inp, confirmed && st.inpOk]}
          value={text}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
        />
        {searching && <ActivityIndicator style={{ marginLeft: 8 }} size="small" color={COLORS.purple} />}
      </View>
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

export default function NewOrderScreen({ route, navigation }) {
  const { serviceType: initialService = 'colis' } = route.params || {};

  const [serviceType, setServiceType] = useState(initialService);
  const [pickup,      setPickup]      = useState(null);
  const [delivery,    setDelivery]    = useState(null);
  const [locLoading,  setLocLoading]  = useState(true);
  const [submitting,  setSubmitting]  = useState(false);

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

  const distanceKm = pickup && delivery
    ? haversine(pickup.lat, pickup.lng, delivery.lat, delivery.lng)
    : 0;

  const canSubmit = !!pickup && !!delivery && !submitting;

  const submitOrder = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/orders', {
        serviceType,
        items: [],
        pickupAddress:   { label: pickup.label,   lat: pickup.lat,   lng: pickup.lng },
        deliveryAddress: { label: delivery.label,  lat: delivery.lat, lng: delivery.lng },
        distanceKm:      Math.round(distanceKm * 10) / 10,
        broadcastRadius: BROADCAST_KM,
      });
      if (!data.success) throw new Error(data.message);
      Alert.alert(
        '✅ Commande envoyée !',
        `Les livreurs dans un rayon de ${BROADCAST_KM} km ont été notifiés.`,
        [
          { text: 'Suivre ma commande', onPress: () => navigation.replace('OrderTrack', { orderId: data.order._id }) },
          { text: 'OK',                 onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      Alert.alert('Erreur', err.message || 'Impossible de créer la commande');
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        <Text style={st.sectionTitle}>Type de service</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
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

        {locLoading ? (
          <View style={[st.fieldWrap, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 }]}>
            <ActivityIndicator color={COLORS.green} />
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>Localisation GPS en cours...</Text>
          </View>
        ) : (
          <AddressField
            label="Point de départ"
            icon="📍"
            value={pickup}
            onSelect={setPickup}
            placeholder="Rechercher l'adresse de départ..."
          />
        )}

        <AddressField
          label="Point d'arrivée"
          icon="🏠"
          value={delivery}
          onSelect={setDelivery}
          placeholder="Rechercher l'adresse de livraison..."
        />

        {pickup && delivery && (
          <View style={st.summary}>
            <View style={st.summaryRow}>
              <Text style={st.summaryLabel}>📍 De</Text>
              <Text style={st.summaryVal} numberOfLines={1}>{pickup.label}</Text>
            </View>
            <View style={st.summaryRow}>
              <Text style={st.summaryLabel}>🏠 À</Text>
              <Text style={st.summaryVal} numberOfLines={1}>{delivery.label}</Text>
            </View>
            <View style={[st.summaryRow, { marginTop: 8, paddingTop: 8, borderTopWidth: .5, borderTopColor: COLORS.border }]}>
              <Text style={st.summaryLabel}>Distance estimée</Text>
              <Text style={[st.summaryVal, { color: COLORS.purple, fontWeight: '700' }]}>{distanceKm.toFixed(1)} km</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[st.btn, !canSubmit && st.btnDisabled]}
          onPress={submitOrder}
          disabled={!canSubmit}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.btnTxt}>
                {!pickup ? '📍 Choisir le point de départ' :
                 !delivery ? '🏠 Choisir le point d\'arrivée' :
                 'Commander →'}
              </Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  sectionTitle:  { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 },
  chip:          { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8, backgroundColor: '#fff' },
  chipLabel:     { fontSize: 13, color: COLORS.muted },
  fieldWrap:     { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: .5, borderColor: COLORS.border },
  fieldHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  fieldHeaderOk: {},
  fieldIcon:     { fontSize: 18 },
  fieldLabel:    { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  inputRow:      { flexDirection: 'row', alignItems: 'center' },
  inp:           { flex: 1, borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 11, fontSize: 13, backgroundColor: COLORS.bg, color: COLORS.text },
  inpOk:         { borderColor: COLORS.green, backgroundColor: '#F2FAF0' },
  dropdown:      { marginTop: 6, borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' },
  dropdownItem:  { padding: 12 },
  dropdownBorder:{ borderBottomWidth: .5, borderBottomColor: COLORS.border },
  summary:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: .5, borderColor: COLORS.border },
  summaryRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  summaryLabel:  { fontSize: 12, color: COLORS.muted, flex: .4 },
  summaryVal:    { fontSize: 12, color: COLORS.text, flex: .6, textAlign: 'right' },
  btn:           { backgroundColor: COLORS.purple, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnDisabled:   { backgroundColor: '#C4C0E4' },
  btnTxt:        { color: '#fff', fontWeight: '700', fontSize: 15 },
});
