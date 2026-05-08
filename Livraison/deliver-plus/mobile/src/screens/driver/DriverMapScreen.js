import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import useAuthStore from '../../stores/authStore';
import { COLORS, SOCKET_URL } from '../../constants';

export default function DriverMapScreen() {
  const { token, driverProfile } = useAuthStore();

  const [myPos,    setMyPos]    = useState(null); // { lat, lng }
  const [speed,    setSpeed]    = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0); // metres traveled this session

  const socketRef  = useRef(null);
  const watchRef   = useRef(null);
  const prevPosRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    if (driverProfile?._id) socket.emit('join_driver', driverProfile._id);
    return () => { socket.disconnect(); stopTracking(); };
  }, []);

  const haversineM = (lat1, lng1, lat2, lng2) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    setTracking(true);
    setDistance(0);
    prevPosRef.current = null;

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 5 },
      ({ coords }) => {
        const { latitude: lat, longitude: lng, speed: spd, accuracy: acc } = coords;
        setMyPos({ lat, lng });
        setSpeed(Math.round((spd || 0) * 3.6));
        setAccuracy(acc ? Math.round(acc) : null);

        if (prevPosRef.current) {
          const d = haversineM(prevPosRef.current.lat, prevPosRef.current.lng, lat, lng);
          setDistance(prev => prev + d);
        }
        prevPosRef.current = { lat, lng };

        socketRef.current?.emit('update_location', {
          driverId: driverProfile?._id,
          lat,
          lng,
        });
      }
    );
  };

  const stopTracking = () => {
    watchRef.current?.remove?.();
    watchRef.current = null;
    setTracking(false);
    setSpeed(0);
  };

  const openInMaps = () => {
    if (!myPos) return;
    const url = `https://www.openstreetmap.org/?mlat=${myPos.lat}&mlon=${myPos.lng}#map=16/${myPos.lat}/${myPos.lng}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Suivi GPS</Text>
        {tracking && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN DIRECT</Text>
          </View>
        )}
      </View>

      {/* ── Position card ── */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Ma position</Text>
        {myPos ? (
          <>
            <Text style={styles.coords}>
              {myPos.lat.toFixed(6)}{'\n'}{myPos.lng.toFixed(6)}
            </Text>
            {accuracy !== null && (
              <Text style={styles.accuracy}>Précision : ±{accuracy} m</Text>
            )}
            <TouchableOpacity style={styles.mapBtn} onPress={openInMaps}>
              <Text style={styles.mapBtnText}>🗺️ Voir sur la carte</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.noPos}>
            {tracking ? 'Acquisition du signal GPS...' : 'Démarrez le suivi pour voir votre position'}
          </Text>
        )}
      </View>

      {/* ── Stats ── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{speed}</Text>
          <Text style={styles.statUnit}>km/h</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{(distance / 1000).toFixed(2)}</Text>
          <Text style={styles.statUnit}>km parcourus</Text>
        </View>
      </View>

      {/* ── Bouton Start/Stop ── */}
      <View style={styles.btnWrap}>
        <TouchableOpacity
          style={[styles.btn, tracking ? styles.btnStop : styles.btnStart]}
          onPress={tracking ? stopTracking : startTracking}
        >
          <Text style={styles.btnText}>
            {tracking ? '⏹  Arrêter le suivi' : '▶  Démarrer le suivi GPS'}
          </Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.bg, padding: 16 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 8 },
  headerTitle:{ fontSize: 20, fontWeight: '700', color: COLORS.text },
  liveBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF3DE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  liveDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#639922' },
  liveText:   { fontSize: 11, fontWeight: '700', color: '#27500A' },
  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: .5, borderColor: COLORS.border },
  cardLabel:  { fontSize: 11, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 10 },
  coords:     { fontSize: 18, fontWeight: '700', color: COLORS.text, fontFamily: 'monospace', marginBottom: 6, lineHeight: 26 },
  accuracy:   { fontSize: 12, color: COLORS.muted, marginBottom: 12 },
  noPos:      { fontSize: 13, color: COLORS.muted, textAlign: 'center', paddingVertical: 10 },
  mapBtn:     { backgroundColor: COLORS.purple, borderRadius: 10, padding: 11, alignItems: 'center' },
  mapBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  statsRow:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statBox:    { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: .5, borderColor: COLORS.border },
  statValue:  { fontSize: 26, fontWeight: '800', color: COLORS.text },
  statUnit:   { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  btnWrap:    { marginTop: 'auto', paddingTop: 16 },
  btn:        { borderRadius: 14, padding: 18, alignItems: 'center' },
  btnStart:   { backgroundColor: COLORS.purple },
  btnStop:    { backgroundColor: COLORS.red },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 16 },
});
