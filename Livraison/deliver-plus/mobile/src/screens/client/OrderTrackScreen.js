import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { io } from 'socket.io-client';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import { COLORS, SOCKET_URL, STATUS_LABELS, SERVICE_ICONS } from '../../constants';

const STATUS_STEPS = ['en_attente', 'accepte', 'en_preparation', 'en_route', 'livre'];

export default function OrderTrackScreen({ route }) {
  const { orderId } = route.params;
  const { token }   = useAuthStore();

  const [order,       setOrder]       = useState(null);
  const [driverPos,   setDriverPos]   = useState(null); // { lat, lng }
  const [loading,     setLoading]     = useState(true);

  const socketRef = useRef(null);

  useEffect(() => {
    api.get(`/orders/${orderId}`).then(r => {
      const o = r.data.order;
      setOrder(o);
      setLoading(false);
      const loc = o.driver?.currentLocation;
      if (loc?.lat) setDriverPos({ lat: loc.lat, lng: loc.lng });
    }).catch(() => setLoading(false));

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('track_order', orderId);

    socket.on('driver_location', ({ lat, lng }) => setDriverPos({ lat, lng }));
    socket.on('order_status_update', ({ status }) =>
      setOrder(p => p ? { ...p, status } : p)
    );

    return () => socket.disconnect();
  }, [orderId]);

  const openInMaps = () => {
    if (!driverPos) return;
    const url = `https://www.openstreetmap.org/?mlat=${driverPos.lat}&mlon=${driverPos.lng}#map=16/${driverPos.lat}/${driverPos.lng}`;
    Linking.openURL(url);
  };

  const activeIdx = order ? STATUS_STEPS.indexOf(order.status) : 0;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.purple} size="large" />
        <Text style={{ color: COLORS.muted, marginTop: 12 }}>Chargement...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={{ color: COLORS.muted }}>Commande introuvable</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* ── Statut badge ── */}
      <View style={[styles.statusBanner, { backgroundColor: order.status === 'livre' ? '#EAF3DE' : '#EEEDFE' }]}>
        <Text style={[styles.statusBannerText, { color: order.status === 'livre' ? '#27500A' : '#3C3489' }]}>
          {STATUS_LABELS[order.status] || order.status}
        </Text>
      </View>

      {/* ── Barre de progression ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Progression</Text>
        <View style={styles.steps}>
          {STATUS_STEPS.filter(s => s !== 'en_attente').map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, { backgroundColor: i + 1 <= activeIdx ? COLORS.purple : COLORS.border }]} />
              <Text style={[styles.stepLabel, { color: i + 1 <= activeIdx ? COLORS.purple : COLORS.muted }]}>
                {STATUS_LABELS[s]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Info livreur ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Livreur</Text>
        <View style={styles.driverRow}>
          <View style={styles.driverAvatar}>
            <Text style={{ color: COLORS.green, fontWeight: '600', fontSize: 18 }}>
              {order.driver?.user?.firstName?.[0] || '?'}{order.driver?.user?.lastName?.[0] || ''}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.driverName}>
              {order.driver?.user?.firstName
                ? `${order.driver.user.firstName} ${order.driver.user.lastName}`
                : 'Recherche d\'un livreur...'}
            </Text>
            <Text style={styles.driverPhone}>
              {order.driver?.user?.phone || 'En attente d\'acceptation'}
            </Text>
          </View>
        </View>

        {/* Position en direct */}
        {driverPos ? (
          <View style={styles.liveBox}>
            <View style={styles.liveDotWrap}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>EN DIRECT</Text>
            </View>
            <Text style={styles.liveCoords}>
              {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)}
            </Text>
            <TouchableOpacity style={styles.mapBtn} onPress={openInMaps}>
              <Text style={styles.mapBtnText}>🗺️ Voir sur la carte</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.liveBox}>
            <Text style={{ color: COLORS.muted, fontSize: 13 }}>
              Position du livreur indisponible
            </Text>
          </View>
        )}
      </View>

      {/* ── Itinéraire ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Itinéraire</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeLabel}>Départ</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {order.pickupAddress?.label || '—'}
            </Text>
          </View>
        </View>
        <View style={[styles.routeLine]} />
        <View style={styles.routeRow}>
          <Text style={styles.routeIcon}>🏠</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeLabel}>Arrivée</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {order.deliveryAddress?.label || '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Résumé commande ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Commande</Text>
        <View style={styles.orderRow}>
          <Text style={{ fontSize: 24 }}>{SERVICE_ICONS[order.serviceType]}</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.orderTitle}>#{orderId.slice(-6).toUpperCase()}</Text>
            <Text style={styles.orderSub}>
              {order.items?.length || 0} article(s) · {order.pricing?.total?.toLocaleString()} MRU
            </Text>
            {order.pricing?.distanceKm > 0 && (
              <Text style={styles.orderSub}>{order.pricing.distanceKm} km</Text>
            )}
          </View>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBanner:    { borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  statusBannerText:{ fontSize: 15, fontWeight: '700' },
  card:            { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: .5, borderColor: COLORS.border },
  sectionTitle:    { fontSize: 11, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 12 },
  steps:           { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem:        { alignItems: 'center', flex: 1 },
  stepDot:         { width: 12, height: 12, borderRadius: 6, marginBottom: 5 },
  stepLabel:       { fontSize: 9, textAlign: 'center' },
  driverRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  driverAvatar:    { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF3DE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  driverName:      { fontSize: 14, fontWeight: '600', color: COLORS.text },
  driverPhone:     { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  liveBox:         { backgroundColor: COLORS.bg, borderRadius: 10, padding: 12 },
  liveDotWrap:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  liveDot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#639922' },
  liveLabel:       { fontSize: 10, fontWeight: '700', color: '#27500A' },
  liveCoords:      { fontSize: 12, color: COLORS.muted, fontFamily: 'monospace', marginBottom: 10 },
  mapBtn:          { backgroundColor: COLORS.purple, borderRadius: 10, padding: 10, alignItems: 'center' },
  mapBtnText:      { color: '#fff', fontWeight: '600', fontSize: 13 },
  routeRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  routeLine:       { width: 1, height: 14, backgroundColor: COLORS.border, marginLeft: 10, marginBottom: 4 },
  routeIcon:       { fontSize: 18, marginTop: 2 },
  routeLabel:      { fontSize: 10, color: COLORS.muted, marginBottom: 2 },
  routeAddress:    { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  orderRow:        { flexDirection: 'row', alignItems: 'center' },
  orderTitle:      { fontSize: 14, fontWeight: '700', color: COLORS.text },
  orderSub:        { fontSize: 12, color: COLORS.muted, marginTop: 2 },
});
