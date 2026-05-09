import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Circle, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import useAuthStore from '../../stores/authStore';
import useOrderStore from '../../stores/orderStore';
import { COLORS, SOCKET_URL } from '../../constants';

const NOUAKCHOTT = { latitude: 18.0735, longitude: -15.9582, latitudeDelta: 0.01, longitudeDelta: 0.01 };

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
  const insets = useSafeAreaInsets();
  const bottomBar = Math.max(insets.bottom, 8);
  const [myPos,    setMyPos]    = useState(null);
  const [speed,    setSpeed]    = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [ready,    setReady]    = useState(false);

  const mapRef    = useRef(null);
  const socketRef = useRef(null);
  const watchRef  = useRef(null);

  const pickupCoords   = currentOrder ? parseCoords(currentOrder.pickupAddress)   : null;
  const deliveryCoords = currentOrder ? parseCoords(currentOrder.deliveryAddress)  : null;
  const isEnRoute      = currentOrder?.status === 'en_route';
  const activeCoords   = isEnRoute ? deliveryCoords : pickupCoords;
  const activeLabel    = isEnRoute ? 'Livraison' : 'Retrait';
  const lineColor      = isEnRoute ? COLORS.blue : COLORS.green;

  const destGeo = useReverseGeo(activeCoords?.latitude, activeCoords?.longitude);

  useEffect(() => {
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    if (driverProfile?._id) socket.emit('join_driver', driverProfile._id);
    startTracking();
    return () => { socket.disconnect(); watchRef.current?.remove?.(); };
  }, []);

  // Recadrer la carte quand la commande change de statut
  useEffect(() => {
    if (!activeCoords) return;
    setTimeout(() => {
      const coords = myPos
        ? [{ latitude: myPos.lat, longitude: myPos.lng }, activeCoords]
        : [activeCoords];
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 160, left: 50 },
        animated: true,
      });
    }, 800);
  }, [currentOrder?._id, currentOrder?.status]);

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude: lat, longitude: lng } = current.coords;
    setMyPos({ lat, lng });
    setReady(true);
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 },
      600
    );
    // Envoyer la position immédiatement à l'ouverture de l'écran carte
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
        if (!activeCoords) {
          mapRef.current?.animateToRegion(
            { latitude, longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 },
            400
          );
        }
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
      mapRef.current?.fitToCoordinates(
        [{ latitude: myPos.lat, longitude: myPos.lng }, activeCoords],
        { edgePadding: { top: 100, right: 50, bottom: 160, left: 50 }, animated: true }
      );
    } else {
      mapRef.current?.animateToRegion(
        { latitude: myPos.lat, longitude: myPos.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 },
        400
      );
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={NOUAKCHOTT}
        showsCompass
        showsScale
        mapType="standard"
      >
        {/* Ligne de trajet (droite pointillée) */}
        {myPos && activeCoords && (
          <Polyline
            coordinates={[
              { latitude: myPos.lat, longitude: myPos.lng },
              activeCoords,
            ]}
            strokeColor={lineColor}
            strokeWidth={3}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Position du livreur */}
        {myPos && (
          <>
            <Marker coordinate={{ latitude: myPos.lat, longitude: myPos.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.dot}>
                <View style={styles.dotInner} />
              </View>
            </Marker>
            {accuracy != null && (
              <Circle
                center={{ latitude: myPos.lat, longitude: myPos.lng }}
                radius={accuracy}
                strokeColor="rgba(83,74,183,0.3)"
                fillColor="rgba(83,74,183,0.08)"
              />
            )}
          </>
        )}

        {/* Marqueur retrait */}
        {pickupCoords && (
          <Marker coordinate={pickupCoords} title="Retrait" anchor={{ x: 0.5, y: 1 }}>
            <Text style={styles.markerEmoji}>📍</Text>
          </Marker>
        )}

        {/* Marqueur livraison */}
        {deliveryCoords && (
          <Marker coordinate={deliveryCoords} title="Livraison" anchor={{ x: 0.5, y: 1 }}>
            <Text style={styles.markerEmoji}>🏠</Text>
          </Marker>
        )}
      </MapView>

      {/* Badges haut */}
      <View style={[styles.topRow, { top: Math.max(insets.top, 16) }]}>
        <View style={styles.speedCard}>
          <Text style={styles.speedNum}>{speed}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
        <View style={[styles.statusBadge, ready ? styles.badgeLive : styles.badgeWait]}>
          {ready && <View style={styles.liveDot} />}
          <Text style={[styles.badgeTxt, { color: ready ? '#27500A' : '#633806' }]}>
            {ready ? 'EN DIRECT' : 'Acquisition GPS…'}
          </Text>
        </View>
        {currentOrder && (
          <View style={[styles.orderBadge, { backgroundColor: isEnRoute ? COLORS.blueLight : COLORS.greenLight }]}>
            <Text style={[styles.orderBadgeTxt, { color: isEnRoute ? COLORS.blue : COLORS.green }]}>
              {isEnRoute ? '🚗 En route' : '📦 Récupération'}
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
                {isEnRoute ? 'Livrer chez le client' : 'Récupérer la commande'}
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
  dot:          { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(83,74,183,0.25)', alignItems: 'center', justifyContent: 'center' },
  dotInner:     { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.purple, borderWidth: 2.5, borderColor: '#fff' },
  markerEmoji:  { fontSize: 32 },
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
