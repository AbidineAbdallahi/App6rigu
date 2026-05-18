import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Animated, Alert } from 'react-native';
import CallModal from './CallModal';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { io } from 'socket.io-client';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SOCKET_URL, SERVICE_ICONS } from '../../constants';

const NOUAKCHOTT = { latitude: 18.0735, longitude: -15.9582, latitudeDelta: 0.05, longitudeDelta: 0.05 };

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseCoords(addr) {
  if (!addr) return null;
  if (typeof addr.lat === 'number' && typeof addr.lng === 'number')
    return { latitude: addr.lat, longitude: addr.lng };
  const raw = addr.label || addr.zone || addr.street || '';
  const m = raw.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (m) return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
  return null;
}

const LIVRAISON_STEPS = ['en_attente', 'accepte', 'en_preparation', 'en_route', 'livre'];
const COURSE_STEPS    = ['en_attente', 'accepte', 'en_route', 'en_preparation', 'livre'];

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function OrderTrackScreen({ route, navigation }) {
  const { orderId } = route.params;
  const { token, updateUser, user } = useAuthStore();
  const { lang }    = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const rtl  = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};
  const [unreadChat, setUnreadChat] = useState(0);
  const [callActive, setCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null); // { callerName, callerSocketId, orderId }

  const [order,        setOrder]        = useState(null);
  const [driverPos,    setDriverPos]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [elapsed,      setElapsed]      = useState(0);
  const [arrivedType,  setArrivedType]  = useState(null); // 'pickup' | 'delivery'
  const arrivedTimer   = useRef(null);
  const [courseTarif,  setCourseTarif]  = useState(null);
  const [finalPrice,   setFinalPrice]   = useState(null);
  const [eta,          setEta]          = useState(null); // { durationMin, distanceKm }
  const [liveKm,       setLiveKm]       = useState(0);

  const socketRef      = useRef(null);
  const timerRef       = useRef(null);
  const startMsRef     = useRef(null);
  const mapRef         = useRef(null);
  const etaPulse       = useRef(new Animated.Value(1)).current;
  const lastDriverPosRef = useRef(null);
  const orderStatusRef   = useRef(null);

  const startChrono = (sinceIso) => {
    if (timerRef.current) clearInterval(timerRef.current);
    startMsRef.current = sinceIso ? new Date(sinceIso).getTime() : Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMsRef.current) / 1000));
    }, 1000);
  };

  const stopChrono = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    api.get(`/orders/${orderId}`).then(r => {
      const o = r.data.order;
      setOrder(o);
      orderStatusRef.current = o.status;
      setLoading(false);
      const loc = o.driver?.currentLocation;
      if (loc?.lat) setDriverPos({ lat: loc.lat, lng: loc.lng });
      if (o.orderType === 'course' && o.status === 'en_preparation') {
        const hist = o.statusHistory?.find(h => h.status === 'en_preparation');
        startChrono(hist?.timestamp);
      }
    }).catch(() => setLoading(false));

    api.get('/tarifs').then(r => {
      const ct = r.data.tarifs?.find(t => t.serviceType === 'course');
      if (ct) setCourseTarif(ct);
    }).catch(() => {});

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('track_order', orderId);

    socket.on('driver_location', ({ lat, lng, eta: newEta }) => {
      setDriverPos({ lat, lng });
      if (newEta) {
        setEta(newEta);
        Animated.sequence([
          Animated.timing(etaPulse, { toValue: 1.06, duration: 180, useNativeDriver: true }),
          Animated.timing(etaPulse, { toValue: 1,    duration: 180, useNativeDriver: true }),
        ]).start();
      }
      // Suivi km passager à bord
      if (orderStatusRef.current === 'en_preparation') {
        if (lastDriverPosRef.current) {
          const d = haversineKm(lastDriverPosRef.current.lat, lastDriverPosRef.current.lng, lat, lng);
          if (d > 0.005) setLiveKm(prev => prev + d);
        }
        lastDriverPosRef.current = { lat, lng };
      }
    });

    socket.on('driver_arrived', ({ type }) => {
      setArrivedType(type);
      if (arrivedTimer.current) clearTimeout(arrivedTimer.current);
      arrivedTimer.current = setTimeout(() => setArrivedType(null), 6000);
    });

    socket.on('order_status_update', ({ status, driver, creditsRestored }) => {
      orderStatusRef.current = status;
      setOrder(p => {
        if (!p) return p;
        return { ...p, status, ...(driver ? { driver } : {}) };
      });
      if (status === 'annule' && creditsRestored > 0) {
        updateUser({ referralCredits: (useAuthStore.getState().user?.referralCredits || 0) + creditsRestored });
        Alert.alert('💰', `Votre livreur a annulé. ${creditsRestored} MRU ont été restitués sur votre compte.`);
      }
      if (status === 'en_preparation') {
        startChrono(null);
        setLiveKm(0);
        lastDriverPosRef.current = null;
      }
      if (status === 'livre' || status === 'annule') stopChrono();
    });

    socket.on('course_price_final', (data) => {
      setFinalPrice(data);
      stopChrono();
    });

    socket.on('call_incoming', ({ orderId: cOrdId, callerName, callerSocketId }) => {
      if (callerSocketId === socket.id) return; // ignorer notre propre écho
      setIncomingCall({ callerName, callerSocketId, orderId: cOrdId });
    });

    socket.on('chat_message', (msg) => {
      if (msg.senderRole !== 'driver') return;
      setUnreadChat(n => n + 1);
      Alert.alert(
        '💬 ' + (msg.senderName || t.chat_driver || 'Livreur'),
        msg.text,
        [
          { text: t.cancel || 'Ignorer', style: 'cancel' },
          { text: t.chat_reply || 'Répondre', onPress: () => { setUnreadChat(0); navigation.navigate('Chat', { orderId }); } },
        ]
      );
    });

    return () => {
      socket.disconnect();
      stopChrono();
    };
  }, [orderId]);

  const pickupCoords   = order ? parseCoords(order.pickupAddress)   : null;
  const deliveryCoords = order ? parseCoords(order.deliveryAddress) : null;

  // Recadrer la carte automatiquement sur les points visibles
  useEffect(() => {
    if (!mapRef.current) return;
    const coords = [];
    if (driverPos)    coords.push({ latitude: driverPos.lat, longitude: driverPos.lng });
    if (pickupCoords)   coords.push(pickupCoords);
    if (deliveryCoords) coords.push(deliveryCoords);
    if (coords.length === 1) {
      mapRef.current.animateToRegion({ ...coords[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    } else if (coords.length > 1) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [driverPos, order?._id, order?.status]);

  const openInMaps = () => {
    if (!driverPos) return;
    Linking.openURL(`https://www.openstreetmap.org/?mlat=${driverPos.lat}&mlon=${driverPos.lng}#map=16/${driverPos.lat}/${driverPos.lng}`);
  };

  const handleCancel = () => {
    Alert.alert(t.track_cancel_title, t.track_cancel_msg, [
      { text: t.track_cancel_no, style: 'cancel' },
      {
        text: t.track_cancel_confirm, style: 'destructive',
        onPress: async () => {
          try {
            const { data } = await api.post(`/orders/${orderId}/cancel`);
            setOrder(p => p ? { ...p, status: 'annule' } : p);
            stopChrono();
            if (data.creditsRestored > 0) {
              updateUser({ referralCredits: (useAuthStore.getState().user?.referralCredits || 0) + data.creditsRestored });
              Alert.alert('💰', `${data.creditsRestored} MRU ont été restitués sur votre compte.`);
            }
          } catch (e) {
            Alert.alert('Erreur', e.response?.data?.message || 'Impossible d\'annuler');
          }
        },
      },
    ]);
  };

  const isCourse   = order?.orderType === 'course';
  const steps      = isCourse ? COURSE_STEPS : LIVRAISON_STEPS;
  const isDone     = order?.status === 'livre' || order?.status === 'annule';
  const activeIdx  = order ? steps.indexOf(order.status) : 0;

  const COURSE_STATUS = {
    en_attente: t.cs_waiting, diffuse: t.cs_diffuse,
    accepte: t.cs_accepted,   en_route: t.cs_en_route,
    en_preparation: t.cs_onboard, livre: t.cs_done, annule: t.cs_cancelled,
  };

  const STATUS_LABELS = {
    en_attente: t.s_en_attente, diffuse: t.s_diffuse, accepte: t.s_accepte,
    en_preparation: t.s_en_preparation, en_route: t.s_en_route,
    livre: t.s_livre, annule: t.s_annule,
  };

  const COURSE_STEP_LABELS    = { accepte: t.step_accepted, en_route: t.step_en_route, en_preparation: t.step_onboard, livre: t.step_arrived };
  const LIVRAISON_STEP_LABELS = { accepte: t.step_accepted, en_preparation: t.step_prep, en_route: t.step_en_route, livre: t.step_delivered };
  const stepLabels = isCourse ? COURSE_STEP_LABELS : LIVRAISON_STEP_LABELS;

  const elapsedMin = elapsed / 60;
  const livePrice  = (courseTarif && isCourse && order?.status === 'en_preparation' && !finalPrice)
    ? Math.max(
        liveKm * (courseTarif.perKmFee || 30)
          + elapsedMin * (courseTarif.perMinuteFee || 10),
        courseTarif.minimumFare || 100
      )
    : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.purple} size="large" />
        <Text style={{ color: COLORS.muted, marginTop: 12 }}>{t.track_loading}</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={{ color: COLORS.muted }}>{t.track_not_found}</Text>
      </View>
    );
  }

  const bannerLabel = isCourse
    ? (COURSE_STATUS[order.status] || order.status)
    : (STATUS_LABELS[order.status] || order.status);

  const arrivedMsg = arrivedType === 'pickup'
    ? '🛵 Votre livreur est arrivé au point de retrait !'
    : '🏠 Votre livreur est arrivé à votre porte !';

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

      {/* Banner arrivée automatique */}
      {!!arrivedType && (
        <View style={styles.arrivedBanner}>
          <Text style={styles.arrivedBannerTxt}>{arrivedMsg}</Text>
        </View>
      )}

      {/* Status banner */}
      <View style={[styles.statusBanner, { backgroundColor: isDone ? '#EAF3DE' : '#EEEDFE' }]}>
        <Text style={[styles.statusBannerText, { color: isDone ? '#27500A' : '#3C3489' }, rtl]}>
          {bannerLabel}
        </Text>
      </View>

      {/* Bouton annulation — uniquement pour statuts annulables */}
      {['en_attente','diffuse','accepte'].includes(order.status) && (
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelBtnTxt}>{t.track_cancel_btn}</Text>
        </TouchableOpacity>
      )}

      {/* ETA — affiché si livreur en route et commande non terminée */}
      {driverPos && !isDone && order.status !== 'en_preparation' && (
        <Animated.View style={[styles.etaCard, { transform: [{ scale: etaPulse }] }]}>
          <View style={styles.etaLeft}>
            <Text style={styles.etaIcon}>⏱</Text>
            <View>
              {eta ? (
                <>
                  <Text style={styles.etaMain}>
                    {t.track_eta_arrival}{' '}
                    <Text style={styles.etaValue}>{eta.durationMin} {t.track_eta_min}</Text>
                  </Text>
                  <Text style={styles.etaSub}>📍 {eta.distanceKm} {t.track_eta_km}</Text>
                </>
              ) : (
                <Text style={styles.etaMain}>{t.track_eta_updating}</Text>
              )}
            </View>
          </View>
          <View style={styles.etaPulseDot} />
        </Animated.View>
      )}

      {/* Prix estimé course — avant embarquement */}
      {isCourse && !['en_preparation', 'livre', 'annule'].includes(order.status) && (
        <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.sectionTitle, rtl]}>
              {isAr ? 'السعر المقدّر' : 'Prix estimé'}
            </Text>
            <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
              {isAr ? 'يُحسب بدقة عند الوصول' : 'Calculé précisément à l\'arrivée'}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.purple }}>
            {order.trajetOuvert
              ? `~${courseTarif?.minimumFare || 100}+ MRU`
              : `${order.pricing?.total?.toLocaleString() || '—'} MRU`}
          </Text>
        </View>
      )}

      {/* Live meter */}
      {isCourse && order.status === 'en_preparation' && !finalPrice && (
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, rtl]}>{t.track_ride_live}</Text>
          <View style={styles.meterRow}>
            <View style={styles.meterCol}>
              <Text style={[styles.meterValue, { color: COLORS.purple }]}>{fmtTime(elapsed)}</Text>
              <Text style={styles.meterUnit}>{t.track_duration}</Text>
            </View>
            <View style={styles.meterCol}>
              <Text style={[styles.meterValue, { color: COLORS.blue }]}>{liveKm.toFixed(2)}</Text>
              <Text style={styles.meterUnit}>km</Text>
            </View>
            {livePrice !== null && (
              <View style={styles.meterCol}>
                <Text style={[styles.meterValue, { color: COLORS.amber }]}>~{Math.ceil(livePrice)}</Text>
                <Text style={styles.meterUnit}>{t.track_estimated}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.meterNote, rtl]}>{t.track_final_note}</Text>
        </View>
      )}

      {/* Final price */}
      {isCourse && finalPrice && (
        <View style={[styles.card, { borderColor: '#3B6D11', borderWidth: 1.5 }]}>
          <Text style={[styles.sectionTitle, rtl]}>{t.track_final_price}</Text>
          <Text style={styles.finalTotal}>{finalPrice.total} MRU</Text>
          <View style={{ marginTop: 14, gap: 8 }}>
            {finalPrice.actualDistanceKm != null && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t.track_real_distance}</Text>
                <Text style={styles.priceVal}>{Number(finalPrice.actualDistanceKm).toFixed(1)} km</Text>
              </View>
            )}
            {finalPrice.actualDurationMin != null && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>{t.track_real_duration}</Text>
                <Text style={styles.priceVal}>{Math.round(finalPrice.actualDurationMin)} min</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Progression */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, rtl]}>{t.track_progress}</Text>
        <View style={styles.steps}>
          {steps.filter(s => s !== 'en_attente').map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, { backgroundColor: i + 1 <= activeIdx ? COLORS.purple : COLORS.border }]} />
              <Text style={[styles.stepLabel, { color: i + 1 <= activeIdx ? COLORS.purple : COLORS.muted }]}>
                {stepLabels[s]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Chauffeur / Livreur */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, rtl]}>{isCourse ? t.track_chauffeur : t.track_driver}</Text>
        <View style={styles.driverRow}>
          <View style={styles.driverAvatar}>
            <Text style={{ color: COLORS.green, fontWeight: '600', fontSize: 18 }}>
              {order.driver?.user?.firstName?.[0] || '?'}{order.driver?.user?.lastName?.[0] || ''}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.driverName, rtl]}>
              {order.driver?.user?.firstName
                ? `${order.driver.user.firstName} ${order.driver.user.lastName}`
                : (isCourse ? t.track_no_chauffeur : t.track_no_driver)}
            </Text>
            <Text style={[styles.driverPhone, rtl]}>
              {order.driver?.user?.phone || t.track_waiting}
            </Text>
          </View>
        </View>

        {/* Bouton chat */}
        {order.driver && !isDone && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => { setUnreadChat(0); navigation.navigate('Chat', { orderId }); }}
          >
            <Text style={styles.chatBtnTxt}>
              💬 {t.chat_open || 'Chat'}
            </Text>
            {unreadChat > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeTxt}>{unreadChat}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Bouton appel VoIP */}
        {order.driver && !isDone && (
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => setCallActive(true)}
          >
            <Text style={styles.callBtnTxt}>📞 {t.call_btn || 'Appeler le livreur'}</Text>
          </TouchableOpacity>
        )}

        {/* Carte en temps réel */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={NOUAKCHOTT}
            showsCompass
            showsScale
            mapType="standard"
          >
            {/* Marqueur chauffeur */}
            {driverPos && (
              <Marker coordinate={{ latitude: driverPos.lat, longitude: driverPos.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.driverDot}>
                  <View style={styles.driverDotInner} />
                </View>
              </Marker>
            )}
            {/* Marqueur retrait */}
            {pickupCoords && (
              <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 1 }}>
                <Text style={{ fontSize: 30 }}>📍</Text>
              </Marker>
            )}
            {/* Marqueur livraison */}
            {deliveryCoords && (
              <Marker coordinate={deliveryCoords} anchor={{ x: 0.5, y: 1 }}>
                <Text style={{ fontSize: 30 }}>🏠</Text>
              </Marker>
            )}
            {/* Ligne chauffeur → destination */}
            {driverPos && (pickupCoords || deliveryCoords) && (
              <Polyline
                coordinates={[
                  { latitude: driverPos.lat, longitude: driverPos.lng },
                  order?.status === 'en_route' && deliveryCoords ? deliveryCoords : (pickupCoords || deliveryCoords),
                ]}
                strokeColor={COLORS.purple}
                strokeWidth={3}
                lineDashPattern={[10, 5]}
              />
            )}
          </MapView>

          {/* Badge EN DIRECT */}
          {driverPos && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeTxt}>{t.track_live}</Text>
            </View>
          )}

          {/* Bouton ouvrir dans Maps */}
          <TouchableOpacity style={styles.mapOpenBtn} onPress={openInMaps}>
            <Text style={styles.mapOpenBtnTxt}>{t.track_map_btn}</Text>
          </TouchableOpacity>

          {!driverPos && (
            <View style={styles.noPosOverlay}>
              <Text style={styles.noPosText}>{t.track_no_pos}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Itinéraire */}
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, rtl]}>{t.track_itinerary}</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.routeLabel, rtl]}>{t.track_departure}</Text>
            <Text style={[styles.routeAddress, rtl]} numberOfLines={2}>{order.pickupAddress?.label || '—'}</Text>
          </View>
        </View>
        <View style={styles.routeLine} />
        {order.deliveryAddress?.label ? (
          <View style={styles.routeRow}>
            <Text style={styles.routeIcon}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, rtl]}>{t.track_arrival}</Text>
              <Text style={[styles.routeAddress, rtl]} numberOfLines={2}>{order.deliveryAddress.label}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.routeRow}>
            <Text style={styles.routeIcon}>🗺</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.routeLabel, rtl]}>{t.track_destination}</Text>
              <Text style={[styles.routeAddress, { color: COLORS.muted }, rtl]}>{t.track_open_trip}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Résumé commande (livraison only) */}
      {!isCourse && (
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, rtl]}>{t.track_order}</Text>
          <View style={styles.orderRow}>
            <Text style={{ fontSize: 24 }}>{SERVICE_ICONS[order.serviceType]}</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.orderTitle, rtl]}>#{orderId.slice(-6).toUpperCase()}</Text>
              <Text style={[styles.orderSub, rtl]}>
                {order.items?.length || 0} {t.track_articles} · {order.pricing?.total?.toLocaleString()} MRU
              </Text>
            </View>
          </View>
        </View>
      )}

    </ScrollView>

    {/* Modal Appel VoIP */}
    {/* Appel sortant client → livreur */}
    <CallModal
      visible={callActive}
      mode="caller"
      myName={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Client'}
      peerName={
        [order.driver?.user?.firstName, order.driver?.user?.lastName]
          .filter(Boolean).join(' ') || 'Livreur'
      }
      orderId={orderId}
      driverId={order.driver?._id || order.driver}
      driverPhone={order.driver?.user?.phone}
      socketRef={socketRef}
      onEnd={() => setCallActive(false)}
    />

    {/* Appel entrant livreur → client */}
    <CallModal
      visible={!!incomingCall}
      mode="callee"
      peerName={
        incomingCall?.callerName &&
        incomingCall.callerName !== 'undefined' &&
        incomingCall.callerName !== 'undefined undefined'
          ? incomingCall.callerName
          : 'Livreur'
      }
      orderId={incomingCall?.orderId}
      callerSocketId={incomingCall?.callerSocketId}
      socketRef={socketRef}
      onEnd={() => setIncomingCall(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  etaCard:          { backgroundColor: COLORS.purple, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaLeft:          { flexDirection: 'row', alignItems: 'center', gap: 10 },
  etaIcon:          { fontSize: 24 },
  etaMain:          { color: '#fff', fontSize: 13, fontWeight: '500' },
  etaValue:         { color: '#fff', fontSize: 20, fontWeight: '800' },
  etaSub:           { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  etaPulseDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7CFC00', shadowColor: '#7CFC00', shadowOpacity: 0.8, shadowRadius: 4 },
  statusBanner:     { borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 },
  statusBannerText: { fontSize: 15, fontWeight: '700' },
  card:             { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: .5, borderColor: COLORS.border },
  sectionTitle:     { fontSize: 11, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 12 },
  meterRow:         { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  meterCol:         { alignItems: 'center' },
  meterValue:       { fontSize: 34, fontWeight: '800' },
  meterUnit:        { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  meterNote:        { fontSize: 11, color: COLORS.muted, textAlign: 'center' },
  finalTotal:       { fontSize: 38, fontWeight: '800', color: '#27500A', textAlign: 'center' },
  priceRow:         { flexDirection: 'row', justifyContent: 'space-between' },
  priceLabel:       { fontSize: 13, color: COLORS.muted },
  priceVal:         { fontSize: 13, fontWeight: '600', color: COLORS.text },
  steps:            { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem:         { alignItems: 'center', flex: 1 },
  stepDot:          { width: 12, height: 12, borderRadius: 6, marginBottom: 5 },
  stepLabel:        { fontSize: 9, textAlign: 'center' },
  driverRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  driverAvatar:     { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF3DE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  driverName:       { fontSize: 14, fontWeight: '600', color: COLORS.text },
  driverPhone:      { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  mapContainer:     { height: 220, borderRadius: 12, overflow: 'hidden', marginTop: 12, position: 'relative' },
  map:              { flex: 1 },
  driverDot:        { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(83,74,183,0.25)', alignItems: 'center', justifyContent: 'center' },
  driverDotInner:   { width: 13, height: 13, borderRadius: 7, backgroundColor: COLORS.purple, borderWidth: 2.5, borderColor: '#fff' },
  liveBadge:        { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EAF3DE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  liveDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3B6D11' },
  liveBadgeTxt:     { fontSize: 10, fontWeight: '700', color: '#27500A' },
  mapOpenBtn:       { position: 'absolute', bottom: 10, right: 10, backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  mapOpenBtnTxt:    { color: '#fff', fontWeight: '600', fontSize: 12 },
  noPosOverlay:     { position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(247,246,242,0.85)' },
  noPosText:        { fontSize: 13, color: COLORS.muted },
  routeRow:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  routeLine:        { width: 1, height: 14, backgroundColor: COLORS.border, marginLeft: 10, marginBottom: 4 },
  routeIcon:        { fontSize: 18, marginTop: 2 },
  routeLabel:       { fontSize: 10, color: COLORS.muted, marginBottom: 2 },
  routeAddress:     { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  orderRow:         { flexDirection: 'row', alignItems: 'center' },
  orderTitle:       { fontSize: 14, fontWeight: '700', color: COLORS.text },
  orderSub:         { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  cancelBtn:        { borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: COLORS.red, backgroundColor: '#FFF5F5' },
  cancelBtnTxt:     { color: COLORS.red, fontWeight: '600', fontSize: 13 },
  arrivedBanner:    { backgroundColor: '#25D366', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  arrivedBannerTxt: { color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  chatBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleLight, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: COLORS.purple },
  chatBtnTxt:       { color: COLORS.purple, fontWeight: '700', fontSize: 14 },
  chatBadge:        { marginLeft: 8, backgroundColor: COLORS.red, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chatBadgeTxt:     { color: '#fff', fontSize: 11, fontWeight: '800' },
  callBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF3DE', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: COLORS.green },
  callBtnTxt:       { color: COLORS.green, fontWeight: '700', fontSize: 14 },
});
