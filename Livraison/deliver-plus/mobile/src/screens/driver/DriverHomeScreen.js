import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, Modal, ActivityIndicator, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { io } from 'socket.io-client';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import { COLORS, SOCKET_URL, SERVICE_ICONS, STATUS_LABELS } from '../../constants';

const ORDER_TIMEOUT_MS = 20000; // 20 secondes

// ─── Anneau de compte à rebours ───────────────────────────────────────────────
const RING_SIZE   = 56;
const RING_BORDER = 5;

function CountdownRing({ timeLeft, total = 20 }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const urgent    = timeLeft <= 5 && timeLeft > 0;

  useEffect(() => {
    if (urgent) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 220, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 220, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [urgent]);

  const deg      = (timeLeft / total) * 360;
  const color    = timeLeft > 10 ? '#3B6D11' : timeLeft > 5 ? '#854F0B' : '#A32D2D';
  const rightRot = Math.min(deg, 180) - 90;
  const leftRot  = Math.max(deg - 180, 0) - 90;

  return (
    <Animated.View style={{ width: RING_SIZE, height: RING_SIZE, transform: [{ scale: pulseAnim }] }}>
      {/* Fond gris */}
      <View style={{ position:'absolute', width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:'#E0E0E0' }} />
      {/* Demi-arc droit (0–180°) */}
      <View style={{ position:'absolute', right:0, width:RING_SIZE/2, height:RING_SIZE, overflow:'hidden' }}>
        <View style={{ position:'absolute', right:0, width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:color, transform:[{ rotate:`${rightRot}deg` }] }} />
      </View>
      {/* Demi-arc gauche (180–360°) */}
      <View style={{ position:'absolute', left:0, width:RING_SIZE/2, height:RING_SIZE, overflow:'hidden' }}>
        <View style={{ position:'absolute', left:0, width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:color, transform:[{ rotate:`${leftRot}deg` }] }} />
      </View>
      {/* Texte central */}
      <View style={{ position:'absolute', width:RING_SIZE, height:RING_SIZE, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize:16, fontWeight:'800', color, lineHeight:18 }}>{timeLeft}</Text>
        <Text style={{ fontSize:7, color, opacity:0.75 }}>sec</Text>
      </View>
    </Animated.View>
  );
}

export default function DriverHomeScreen() {
  const { user, driverProfile } = useAuthStore();
  const [driver, setDriver]         = useState(null);
  const [isOnline, setIsOnline]     = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [nearbyOrders, setNearbyOrders] = useState([]);   // commandes disponibles
  const [solde, setSolde]           = useState(0);
  const [todayStats, setTodayStats] = useState({ deliveries:0, earnings:0 });
  const [now, setNow]               = useState(Date.now());
  const [loading, setLoading]       = useState(true);
  const [soldeModal, setSoldeModal] = useState(null);     // commande avec solde insuffisant
  const socketRef   = useRef(null);
  const locationRef = useRef(null);
  const driverIdRef = useRef(null);
  const soundRef      = useRef(null);
  const soundTimerRef = useRef(null);

  // ─── Sonnerie bip moderne ─────────────────────────────────────────────────
  const stopBipSound = async () => {
    if (soundTimerRef.current) { clearInterval(soundTimerRef.current); soundTimerRef.current = null; }
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
  };

  const playBipSound = async () => {
    await stopBipSound();
    const playOnce = async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/alert.wav'),
          { shouldPlay: true, isLooping: false, volume: 1.0 }
        );
        soundRef.current = sound;
        setTimeout(async () => {
          try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
          if (soundRef.current === sound) soundRef.current = null;
        }, 400);
      } catch (e) { console.error('[SON]:', e.message); }
    };
    playOnce();
    soundTimerRef.current = setInterval(playOnce, 1800);
  };

  // ─── Horloge globale pour les comptes à rebours ───────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ─── Auto-supprimer les commandes expirées localement ─────────────────────
  useEffect(() => {
    setNearbyOrders(prev => {
      const filtered = prev.filter(o => (now - (o.receivedAt || now)) < ORDER_TIMEOUT_MS);
      if (filtered.length === 0 && prev.length > 0) stopBipSound();
      return filtered;
    });
  }, [now]);

  // ─── Charger profil livreur ────────────────────────────────────────────────
  const loadDriver = useCallback(async () => {
    try {
      if (!driverProfile?._id) return;
      const { data } = await api.get(`/drivers/${driverProfile._id}`);
      setDriver(data.driver);
      setSolde(data.driver.solde || 0);
      setIsOnline(data.driver.status === 'actif');
      if (data.driver.currentOrder) setCurrentOrder(data.driver.currentOrder);
      driverIdRef.current = data.driver._id;
      // Si la socket est déjà connectée, rejoindre la room maintenant
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_driver', data.driver._id);
        console.log('[SOCKET] join_driver envoyé depuis loadDriver:', data.driver._id);
      }
    } catch (e) { console.error('[loadDriver] erreur:', e.message); }
    finally { setLoading(false); }
  }, [driverProfile]);

  // ─── Charger commandes à proximité ────────────────────────────────────────
  const loadNearby = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/nearby');
      setNearbyOrders(data.orders || []);
    } catch {}
  }, []);

  // ─── Socket.io ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadDriver();
    const token = useAuthStore.getState().token;
    const socket = io(SOCKET_URL, { auth: { token }, reconnection: true });
    socketRef.current = socket;

    // Rejoindre la room à chaque connexion (initiale + reconnexion)
    // On lit le store directement pour éviter les problèmes de closure (store pas encore chargé)
    socket.on('connect', () => {
      const storeProfile = useAuthStore.getState().driverProfile;
      const dId = driverIdRef.current || storeProfile?._id || driverProfile?._id;
      console.log('[SOCKET] connect | socketId:', socket.id, '| driverId:', dId);
      if (dId) socket.emit('join_driver', dId);
      else console.warn('[SOCKET] join_driver non envoyé : driverId inconnu au moment du connect');
    });

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] connect_error:', err.message);
    });

    // Nouvelle commande disponible à proximité
    socket.on('new_order_nearby', ({ order, distance, minSoldeRequired, driverSolde, canAccept }) => {
      setNearbyOrders(prev => {
        if (prev.find(o => o._id === order._id)) return prev;
        return [{ ...order, distance, minSoldeRequired, canAccept, receivedAt: Date.now() }, ...prev];
      });
      playBipSound();
      if (canAccept) {
        Alert.alert(
          `🚨 Nouvelle commande !`,
          `${SERVICE_ICONS[order.serviceType]} à ${distance} km\nTotal : ${order.pricing?.total} MRU\nVotre solde : ${driverSolde} MRU`,
          [
            { text: 'Refuser', style:'cancel', onPress: () => rejectOrder(order._id) },
            { text: '✅ Accepter', onPress: () => acceptOrder(order) },
          ]
        );
      } else {
        Alert.alert(
          '⚠️ Commande disponible — Solde insuffisant',
          `Commande à ${distance} km\nSolde requis : ${minSoldeRequired} MRU\nVotre solde : ${driverSolde} MRU\n\nVous ne pouvez pas accepter cette commande.`,
          [{ text: 'OK' }]
        );
      }
    });

    // Commande prise par un autre livreur
    socket.on('order_taken', ({ orderId }) => {
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
    });

    // Commande expirée (personne n'a accepté en 20s)
    socket.on('order_expired', ({ orderId }) => {
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
    });

    // Mise à jour du solde après livraison
    socket.on('solde_updated', ({ solde: newSolde, message }) => {
      setSolde(newSolde);
      Alert.alert('💰 Solde mis à jour', message, [{ text: 'OK' }]);
    });

    return () => { socket.disconnect(); stopLocation(); stopBipSound(); };
  }, [driverProfile]);

  // ─── Accepter une commande ─────────────────────────────────────────────────
  const acceptOrder = async (order) => {
    stopBipSound();
    try {
      const { data } = await api.post(`/orders/${order._id}/accept`);
      setCurrentOrder(data.order);
      setNearbyOrders([]);
      startLocationTracking(data.order._id);
      Alert.alert('✅ Commande acceptée !', `Rendez-vous au point de retrait.\nCommission finale : ${data.order.pricing?.commission} MRU sera prélevée à la livraison.`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Erreur';
      if (err.response?.data?.required) {
        setSoldeModal({ required: err.response.data.required, current: err.response.data.current });
      } else {
        Alert.alert('Erreur', msg);
      }
    }
  };

  // ─── Refuser une commande ──────────────────────────────────────────────────
  const rejectOrder = async (orderId) => {
    try {
      await api.post(`/orders/${orderId}/reject`);
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
    } catch {}
  };

  // ─── Changer statut commande ───────────────────────────────────────────────
  const updateOrderStatus = async (status) => {
    if (!currentOrder) return;
    try {
      await api.patch(`/orders/${currentOrder._id}/status`, { status });
      setCurrentOrder(prev => ({ ...prev, status }));
      if (status === 'livre') {
        stopLocation();
        setCurrentOrder(null);
        setTodayStats(p => ({
          deliveries: p.deliveries + 1,
          earnings: p.earnings + (currentOrder.pricing?.driverEarning || 0),
        }));
        loadNearby();
      }
    } catch { Alert.alert('Erreur', 'Impossible de mettre à jour'); }
  };

  // ─── GPS tracking ──────────────────────────────────────────────────────────
  const startLocationTracking = async (orderId) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    locationRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
      ({ coords }) => {
        const dId = driverIdRef.current || driverProfile?._id;
        socketRef.current?.emit('update_location', {
          driverId: dId,
          lat: coords.latitude,
          lng: coords.longitude,
          orderId,
        });
      }
    );
  };

  const startLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission refusée'); return; }
    locationRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
      ({ coords }) => {
        const dId = driverIdRef.current || driverProfile?._id;
        socketRef.current?.emit('update_location', { driverId: dId, lat: coords.latitude, lng: coords.longitude });
      }
    );
  };

  const stopLocation = () => { locationRef.current?.remove?.(); locationRef.current = null; };

  // ─── Toggle en ligne ───────────────────────────────────────────────────────
  const toggleOnline = async (val) => {
    const newStatus = val ? 'actif' : 'pause';
    try {
      await api.patch(`/drivers/${driverIdRef.current || driverProfile?._id}/status`, { status: newStatus });
      socketRef.current?.emit('update_driver_status', { driverId: driverIdRef.current, status: newStatus });
      setIsOnline(val);
      if (val) { startLocation(); loadNearby(); } else stopLocation();
    } catch { Alert.alert('Erreur', 'Impossible de changer le statut'); }
  };

  const STATUS_NEXT = {
    accepte:  { next:'en_route', label:'📦 Récupérer la commande', color: COLORS.blue },
    en_route: { next:'livre',    label:'✅ Finir le trajet',        color: COLORS.green },
  };

  if (loading) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.loadingCenter}><ActivityIndicator color={COLORS.purple} size="large" /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header + Solde */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour, {user?.firstName} 🛵</Text>
            <Text style={styles.sub}>{driver?.zone} · {driver?.vehicleType}</Text>
          </View>
          <View style={styles.soldeBox}>
            <Text style={styles.soldeLabel}>Solde</Text>
            <Text style={styles.soldeValue}>{solde.toLocaleString()} MRU</Text>
          </View>
        </View>

        {/* Toggle en ligne */}
        <View style={styles.toggleCard}>
          <View>
            <Text style={styles.toggleTitle}>{isOnline ? '🟢 En ligne' : '⚫ Hors ligne'}</Text>
            <Text style={styles.toggleSub}>{isOnline ? 'Vous recevez des commandes' : 'Activez pour recevoir des commandes'}</Text>
          </View>
          <Switch value={isOnline} onValueChange={toggleOnline}
            trackColor={{ false:'#D3D1C7', true: COLORS.purple }} thumbColor="#fff" />
        </View>

        {/* Stats du jour */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{todayStats.deliveries}</Text>
            <Text style={styles.statLabel}>Livraisons</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: COLORS.green }]}>{todayStats.earnings.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Gains MRU</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color:'#854F0B' }]}>{driver?.stats?.averageRating?.toFixed(1) || '—'}</Text>
            <Text style={styles.statLabel}>Note ★</Text>
          </View>
        </View>

        {/* Commande en cours */}
        {currentOrder ? (
          <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
              <Text style={{ fontSize:22 }}>{SERVICE_ICONS[currentOrder.serviceType]}</Text>
              <View style={{ flex:1, marginLeft:10 }}>
                <Text style={styles.orderTitle}>Commande #{currentOrder._id?.slice(-6).toUpperCase()}</Text>
                <Text style={styles.orderSub}>{STATUS_LABELS[currentOrder.status]}</Text>
              </View>
              <View style={{ alignItems:'flex-end' }}>
                <Text style={styles.orderTotal}>{currentOrder.pricing?.total?.toLocaleString()} MRU</Text>
                <Text style={{ fontSize:11, color: COLORS.red }}>Com. : {currentOrder.pricing?.commission} MRU</Text>
              </View>
            </View>

            <View style={styles.addressBlock}>
              <Text style={styles.addressLabel}>📍 Retrait</Text>
              <Text style={styles.addressText}>{currentOrder.pickupAddress?.label || currentOrder.pickupAddress?.zone || '—'}</Text>
              <Text style={[styles.addressLabel, { marginTop:8 }]}>🏠 Livraison</Text>
              <Text style={styles.addressText}>{currentOrder.deliveryAddress?.label || currentOrder.deliveryAddress?.zone || '—'}</Text>
            </View>

            <View style={styles.commissionInfo}>
              <Text style={{ fontSize:12, color: COLORS.muted }}>
                À la livraison :{' '}
                <Text style={{ color: COLORS.red, fontWeight:'600' }}>-{currentOrder.pricing?.commission} MRU</Text>
                {' '}seront prélevés sur votre solde. Vous encaissez{' '}
                <Text style={{ color: COLORS.green, fontWeight:'600' }}>{currentOrder.pricing?.total?.toLocaleString()} MRU</Text>
                {' '}en cash auprès du client.
              </Text>
            </View>

            {STATUS_NEXT[currentOrder.status] && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: STATUS_NEXT[currentOrder.status].color }]}
                onPress={() => {
                  Alert.alert(
                    'Confirmer',
                    STATUS_NEXT[currentOrder.status].label,
                    [
                      { text: 'Annuler', style:'cancel' },
                      { text: 'Confirmer', onPress: () => updateOrderStatus(STATUS_NEXT[currentOrder.status].next) },
                    ]
                  );
                }}>
                <Text style={styles.actionBtnText}>{STATUS_NEXT[currentOrder.status].label}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Commandes à proximité */}
            {nearbyOrders.length > 0 ? (
              <View>
                <Text style={styles.sectionTitle}>🔔 Commandes disponibles ({nearbyOrders.length})</Text>
                {nearbyOrders.map(order => {
                  const timeLeft = Math.max(0, Math.ceil((ORDER_TIMEOUT_MS - (now - (order.receivedAt || now))) / 1000));
                  const urgent   = timeLeft <= 5;
                  return (
                  <View key={order._id} style={[styles.nearbyCard, urgent && styles.nearbyCardUrgent]}>
                    <View style={styles.orderHeader}>
                      <Text style={{ fontSize:20 }}>{SERVICE_ICONS[order.serviceType]}</Text>
                      <View style={{ flex:1, marginLeft:10 }}>
                        <Text style={styles.orderTitle}>#{order._id.slice(-6).toUpperCase()} · {order.distance} km</Text>
                        <Text style={styles.orderSub}>{order.pickupAddress?.zone} → {order.deliveryAddress?.zone}</Text>
                      </View>
                      <View style={{ alignItems:'center' }}>
                        <Text style={[styles.orderTotal, { marginBottom:4 }]}>{order.pricing?.total?.toLocaleString()} MRU</Text>
                        <CountdownRing timeLeft={timeLeft} />
                      </View>
                    </View>

                    <View style={styles.soldeCheck}>
                      <Text style={{ fontSize:12, color: COLORS.muted }}>
                        Solde requis : <Text style={{ fontWeight:'600' }}>{order.pricing?.minSoldeRequired} MRU</Text>
                        {'  '}Votre solde : <Text style={{ fontWeight:'600', color: order.canAccept ? COLORS.green : COLORS.red }}>{solde} MRU</Text>
                      </Text>
                    </View>

                    <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectOrder(order._id)}>
                        <Text style={{ color: COLORS.red, fontWeight:'600', fontSize:13 }}>Refuser</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptBtn, !order.canAccept && { opacity:0.4 }]}
                        disabled={!order.canAccept}
                        onPress={() => order.canAccept ? acceptOrder(order) : setSoldeModal({ required: order.pricing?.minSoldeRequired, current: solde })}>
                        <Text style={{ color:'#fff', fontWeight:'600', fontSize:13 }}>
                          {order.canAccept ? '✅ Accepter' : '⚠️ Solde insuffisant'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyOrder}>
                <Text style={{ fontSize:40, marginBottom:8 }}>📦</Text>
                <Text style={{ fontSize:15, fontWeight:'600', color: COLORS.text, marginBottom:4, textAlign:'center' }}>
                  {isOnline ? 'En attente d\'une commande...' : 'Passez en ligne pour recevoir des commandes'}
                </Text>
                <Text style={{ fontSize:13, color: COLORS.muted, textAlign:'center' }}>
                  {isOnline ? `Votre solde actuel : ${solde} MRU` : 'Activez le bouton ci-dessus.'}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Modal solde insuffisant */}
      <Modal visible={!!soldeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⚠️ Solde insuffisant</Text>
            <Text style={styles.modalText}>
              Pour accepter cette commande, votre solde doit être d'au moins{' '}
              <Text style={{ fontWeight:'700', color: COLORS.purple }}>{soldeModal?.required} MRU</Text>.
            </Text>
            <Text style={styles.modalText}>
              Votre solde actuel :{' '}
              <Text style={{ fontWeight:'700', color: COLORS.red }}>{soldeModal?.current} MRU</Text>
            </Text>
            <Text style={[styles.modalText, { marginTop:8, color: COLORS.muted }]}>
              Contactez l'administrateur pour recharger votre solde.
            </Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setSoldeModal(null)}>
              <Text style={{ color:'#fff', fontWeight:'600' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex:1, backgroundColor: COLORS.bg },
  scroll:        { padding:20 },
  loadingCenter: { flex:1, alignItems:'center', justifyContent:'center' },
  header:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  greeting:      { fontSize:20, fontWeight:'600', color: COLORS.text },
  sub:           { fontSize:13, color: COLORS.muted, marginTop:2, textTransform:'capitalize' },
  soldeBox:      { backgroundColor: COLORS.purpleLight, borderRadius:12, padding:10, alignItems:'center' },
  soldeLabel:    { fontSize:10, color: COLORS.purple },
  soldeValue:    { fontSize:16, fontWeight:'700', color: COLORS.purple },
  toggleCard:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#fff', borderRadius:14, padding:16, marginBottom:16, borderWidth:.5, borderColor: COLORS.border },
  toggleTitle:   { fontSize:15, fontWeight:'600', color: COLORS.text },
  toggleSub:     { fontSize:12, color: COLORS.muted, marginTop:2 },
  statsRow:      { flexDirection:'row', gap:10, marginBottom:16 },
  statCard:      { flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', borderWidth:.5, borderColor: COLORS.border },
  statValue:     { fontSize:20, fontWeight:'700', color: COLORS.text },
  statLabel:     { fontSize:11, color: COLORS.muted, marginTop:2 },
  sectionTitle:  { fontSize:15, fontWeight:'600', color: COLORS.text, marginBottom:12 },
  orderCard:     { backgroundColor:'#fff', borderRadius:14, padding:16, borderWidth:.5, borderColor: COLORS.border, marginBottom:12 },
  nearbyCard:       { backgroundColor:'#fff', borderRadius:14, padding:14, borderWidth:.5, borderColor: COLORS.border, marginBottom:10 },
  nearbyCardUrgent: { backgroundColor:'#FFF5F5', borderColor:'#A32D2D', borderWidth:1.5 },
  orderHeader:   { flexDirection:'row', alignItems:'center', marginBottom:12 },
  orderTitle:    { fontSize:14, fontWeight:'600', color: COLORS.text },
  orderSub:      { fontSize:12, color: COLORS.muted, marginTop:2 },
  orderTotal:    { fontSize:15, fontWeight:'700', color: COLORS.purple },
  addressBlock:  { backgroundColor: COLORS.bg, borderRadius:10, padding:12, marginBottom:10 },
  addressLabel:  { fontSize:11, color: COLORS.muted, marginBottom:2 },
  addressText:   { fontSize:13, color: COLORS.text, fontWeight:'500' },
  commissionInfo:{ backgroundColor:'#FFF8F0', borderRadius:8, padding:10, marginBottom:12 },
  soldeCheck:    { backgroundColor: COLORS.bg, borderRadius:8, padding:8 },
  actionBtn:     { borderRadius:12, padding:14, alignItems:'center' },
  actionBtnText: { color:'#fff', fontWeight:'600', fontSize:14 },
  acceptBtn:     { flex:2, backgroundColor: COLORS.green, borderRadius:10, padding:12, alignItems:'center' },
  rejectBtn:     { flex:1, backgroundColor: COLORS.redLight, borderRadius:10, padding:12, alignItems:'center' },
  emptyOrder:    { backgroundColor:'#fff', borderRadius:14, padding:32, alignItems:'center', borderWidth:.5, borderColor: COLORS.border },
  modalOverlay:  { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center', padding:24 },
  modalCard:     { backgroundColor:'#fff', borderRadius:16, padding:24, width:'100%' },
  modalTitle:    { fontSize:18, fontWeight:'600', color: COLORS.text, marginBottom:12 },
  modalText:     { fontSize:14, color: COLORS.text, marginBottom:6, lineHeight:20 },
  modalBtn:      { backgroundColor: COLORS.purple, borderRadius:10, padding:12, alignItems:'center', marginTop:16 },
});
