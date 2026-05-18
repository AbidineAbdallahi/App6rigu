import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import useAuthStore from '../../stores/authStore';
import useOrderStore from '../../stores/orderStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SOCKET_URL } from '../../constants';
import LeafletMap from '../../components/LeafletMap';

const NOUAKCHOTT = { latitude: 18.0735, longitude: -15.9582 };

function parseCoords(addr) {
  const raw = addr?.label || addr?.zone || addr?.street || '';
  const m = raw.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  return null;
}

function useReverseGeo(lat, lng) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    if (lat == null || lng == null) { setLabel(null); return; }
    setLabel(null);
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      .then(r => {
        if (!r?.length) return;
        const parts = [r[0].name, r[0].street, r[0].district, r[0].subregion, r[0].city].filter(Boolean);
        if (parts.length) setLabel(parts.slice(0, 3).join(', '));
      })
      .catch(() => {});
  }, [lat, lng]);
  return label;
}

export default function DriverMapScreen() {
  const { token, driverProfile } = useAuthStore();
  const { currentOrder } = useOrderStore();
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;
  const insets = useSafeAreaInsets();
  const bottomBar = Math.max(insets.bottom, 8);

  const [myPos,    setMyPos]    = useState(null);
  const [speed,    setSpeed]    = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [ready,    setReady]    = useState(false);

  const mapRef    = useRef(null);
  const socketRef = useRef(null);
  const watchRef  = useRef(null);

  const pickupCoords   = currentOrder ? parseCoords(currentOrder.pickupAddress)  : null;
  const deliveryCoords = currentOrder ? parseCoords(currentOrder.deliveryAddress) : null;
  const isEnRoute      = currentOrder?.status === 'en_route';
  const activeCoords   = isEnRoute ? deliveryCoords : pickupCoords;
  const lineColor      = isEnRoute ? COLORS.blue : COLORS.green;

  const destGeo = useReverseGeo(activeCoords?.latitude, activeCoords?.longitude);

  // Sync driver position
  useEffect(() => {
    if (myPos) mapRef.current?.setDriver(myPos.lat, myPos.lng, accuracy);
  }, [myPos, accuracy]);

  // Sync pickup marker
  useEffect(() => {
    if (pickupCoords) mapRef.current?.setPickup(pickupCoords.latitude, pickupCoords.longitude);
    else mapRef.current?.setPickup(null, null);
  }, [pickupCoords?.latitude, pickupCoords?.longitude]);

  // Sync delivery marker
  useEffect(() => {
    if (deliveryCoords) mapRef.current?.setDelivery(deliveryCoords.latitude, deliveryCoords.longitude);
    else mapRef.current?.setDelivery(null, null);
  }, [deliveryCoords?.latitude, deliveryCoords?.longitude]);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    if (driverProfile?._id) socket.emit('join_driver', driverProfile._id);
    startTracking();
    return () => { socket.disconnect(); watchRef.current?.remove?.(); };
  }, []);

  // Recadrer quand la commande change de statut
  useEffect(() => {
    if (!activeCoords) return;
    setTimeout(() => {
      const coords = myPos
        ? [[myPos.lat, myPos.lng], [activeCoords.latitude, activeCoords.longitude]]
        : [[activeCoords.latitude, activeCoords.longitude]];
      mapRef.current?.fitCoords(coords);
    }, 800);
  }, [currentOrder?._id, currentOrder?.status]);

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude: lat, longitude: lng } = current.coords;
    setMyPos({ lat, lng });
    setReady(true);
    mapRef.current?.centerMap(lat, lng, 15);

    socketRef.current?.emit('update_location', {
      driverId: driverProfile?._id, lat, lng, orderId: currentOrder?._id,
    });

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 3 },
      ({ coords }) => {
        const { latitude, longitude, speed: spd, accuracy: acc } = coords;
        setMyPos({ lat: latitude, lng: longitude });
        setSpeed(Math.round((spd || 0) * 3.6));
        setAccuracy(acc ? Math.round(acc) : null);
        if (!activeCoords) mapRef.current?.centerMap(latitude, longitude, 15);
        socketRef.current?.emit('update_location', {
          driverId: driverProfile?._id, lat: latitude, lng: longitude,
          orderId: currentOrder?._id,
        });
      }
    );
  };

  const fitToRoute = () => {
    if (!myPos) return;
    if (activeCoords) {
      mapRef.current?.fitCoords([[myPos.lat, myPos.lng], [activeCoords.latitude, activeCoords.longitude]]);
    } else {
      mapRef.current?.centerMap(myPos.lat, myPos.lng, 15);
    }
  };

  return (
    <View style={styles.container}>
      <LeafletMap ref={mapRef} style={styles.map} />

      {/* Badges haut */}
      <View style={[styles.topRow, { top: Math.max(insets.top, 16) }]}>
        <View style={styles.speedCard}>
          <Text style={styles.speedNum}>{speed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
        <View style={[styles.statusBadge, ready ? styles.badgeLive : styles.badgeWait]}>
          {ready && <View style={styles.liveDot} />}
          <Text style={[styles.badgeTxt, { color: ready ? '#27500A' : '#633806' }]}>
            {ready ? t.map_live : t.map_gps}
          </Text>
        </View>
        {currentOrder && (
          <View style={[styles.orderBadge, { backgroundColor: isEnRoute ? COLORS.blueLight : COLORS.greenLight }]}>
            <Text style={[styles.orderBadgeTxt, { color: isEnRoute ? COLORS.blue : COLORS.green }]}>
              {isEnRoute ? t.map_en_route_badge : t.map_pickup_badge}
            </Text>
          </View>
        )}
      </View>

      {/* Bouton recentrer */}
      <TouchableOpacity
        style={[styles.centerBtn, { bottom: (activeCoords ? 110 : 70) + bottomBar }]}
        onPress={fitToRoute}
      >
        <Text style={{ fontSize: 22 }}>{activeCoords ? '⊡' : '◎'}</Text>
      </TouchableOpacity>

      {/* Panneau destination */}
      {activeCoords ? (
        <View style={[styles.destPanel, { paddingBottom: bottomBar + 10 }]}>
          <View style={styles.destRow}>
            <Text style={styles.destEmoji}>{isEnRoute ? '🏠' : '📍'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.destTitle}>
                {isEnRoute ? t.map_deliver_title : t.map_retrieve_title}
              </Text>
              <Text style={styles.destAddr} numberOfLines={2}>
                {destGeo || (activeCoords
                  ? `${activeCoords.latitude.toFixed(5)}, ${activeCoords.longitude.toFixed(5)}`
                  : '…')}
              </Text>
            </View>
            <View style={[styles.destDot, { backgroundColor: lineColor }]} />
          </View>
        </View>
      ) : (
        myPos && (
          <View style={[styles.coordBar, { paddingBottom: bottomBar + 8 }]}>
            <Text style={styles.coordTxt}>
              {myPos.lat.toFixed(5)}, {myPos.lng.toFixed(5)}
              {accuracy ? `  ±${accuracy} m` : ''}
            </Text>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  map:          { flex: 1 },
  topRow:       { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  speedCard:    { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  speedNum:     { fontSize: 22, fontWeight: '800', color: COLORS.text, lineHeight: 24 },
  speedUnit:    { fontSize: 10, color: COLORS.muted },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  badgeLive:    { backgroundColor: '#EAF3DE' },
  badgeWait:    { backgroundColor: '#FAEEDA' },
  liveDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B6D11' },
  badgeTxt:     { fontSize: 11, fontWeight: '700' },
  orderBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  orderBadgeTxt:{ fontSize: 11, fontWeight: '700' },
  centerBtn:    { position: 'absolute', right: 16, backgroundColor: '#fff', width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  destPanel:    { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingTop: 14, paddingHorizontal: 16, borderTopWidth: 0.5, borderTopColor: COLORS.border, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 6 },
  destRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destEmoji:    { fontSize: 28 },
  destTitle:    { fontSize: 13, fontWeight: '700', color: COLORS.text },
  destAddr:     { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  destDot:      { width: 12, height: 12, borderRadius: 6 },
  coordBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 0.5, borderTopColor: COLORS.border },
  coordTxt:     { fontSize: 11, color: COLORS.muted, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
