import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import useColors from '../../hooks/useColors';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, Modal, ActivityIndicator, Animated, TextInput, KeyboardAvoidingView, Platform, AppState } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { showOrderFullScreen, cancelOrderNotification, listenOrderNotificationEvents, startDriverService, stopDriverService } from '../../services/orderNotification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useOrderStore from '../../stores/orderStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SOCKET_URL, SERVICE_ICONS } from '../../constants';
import DriverChatModal from './DriverChatModal';
import CallModal from './CallModal';

const ORDER_TIMEOUT_MS = 20000;
const ARRIVAL_RADIUS_M = 100;

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function fmtAddr(addr) {
  const raw = addr?.label || addr?.zone || addr?.street || '—';
  const m = raw.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  if (m) return `${parseFloat(m[1]).toFixed(3)}, ${parseFloat(m[2]).toFixed(3)}`;
  return raw;
}

function GeoLabel({ addr, style, numberOfLines }) {
  const raw = addr?.label || addr?.zone || addr?.street || '—';
  const m   = raw.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  const fallback = m ? `${parseFloat(m[1]).toFixed(3)}, ${parseFloat(m[2]).toFixed(3)}` : raw;
  const [label, setLabel] = useState(fallback);
  useEffect(() => {
    if (!m) return;
    Location.reverseGeocodeAsync({ latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) })
      .then(r => {
        if (!r?.length) return;
        const parts = [r[0].name, r[0].street, r[0].district, r[0].subregion, r[0].city].filter(Boolean);
        if (parts.length) setLabel(parts.slice(0, 3).join(', '));
      })
      .catch(() => {});
  }, [raw]);
  return <Text style={style} numberOfLines={numberOfLines}>{label}</Text>;
}

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
  const { setCurrentOrder: syncOrder, clearCurrentOrder } = useOrderStore();
  const { lang } = useLangStore();
  const t = translations[lang];
  const insets = useSafeAreaInsets();
  const [driver, setDriver]         = useState(null);
  const [isOnline, setIsOnline]     = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [nearbyOrders, setNearbyOrders] = useState([]);   // commandes disponibles
  const [solde, setSolde]           = useState(0);
  const [todayStats, setTodayStats] = useState({ deliveries:0, earnings:0 });
  const [now, setNow]               = useState(Date.now());
  const [loading, setLoading]       = useState(true);
  const [soldeModal, setSoldeModal]         = useState(null);
  const [orderAlert, setOrderAlert]         = useState(null); // { order, distance, canAccept, timeLeft }
  const [pendingReview, setPendingReview]   = useState(false); // true when driver cancelled and awaiting admin
  const [cancelReason, setCancelReason]     = useState('');
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling]         = useState(false);
  const [courseTarif, setCourseTarif]       = useState(null);
  const [chatVisible, setChatVisible]       = useState(false);
  const [unreadChat, setUnreadChat]         = useState(0);
  const [incomingCall, setIncomingCall]     = useState(null); // { callerName, callerSocketId, orderId, clientPhone }
  const [callClientVisible, setCallClientVisible] = useState(false);
  const [liveKm, setLiveKm]               = useState(0);
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const alertPlayer = useAudioPlayer(require('../../../assets/alert.wav'));

  const socketRef      = useRef(null);
  const locationRef    = useRef(null);
  const driverIdRef    = useRef(null);
  const alertTimerRef  = useRef(null);
  const alertCountRef  = useRef(null);
  const currentOrderRef = useRef(null);
  const arrivedRef     = useRef(new Set());
  const lastKmPosRef   = useRef(null);

  const soundTimerRef = useRef(null);

  const stopBipSound = useCallback(() => {
    if (soundTimerRef.current) { clearInterval(soundTimerRef.current); soundTimerRef.current = null; }
    try { alertPlayer.pause(); alertPlayer.seekTo(0); } catch {}
  }, [alertPlayer]);

  const playBipSound = useCallback(() => {
    stopBipSound();
    try { alertPlayer.seekTo(0); alertPlayer.play(); } catch {}
    soundTimerRef.current = setInterval(() => {
      try { alertPlayer.seekTo(0); alertPlayer.play(); } catch {}
    }, 2200);
  }, [alertPlayer, stopBipSound]);

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
      // Redémarrer le service au premier plan si le livreur était déjà en ligne
      if (data.driver.status === 'actif') startDriverService().catch(() => {});
      if (data.driver.currentOrder) {
        const co = data.driver.currentOrder;
        if (co.status === 'annule' && co.driverCancellationPending) {
          setCurrentOrder(co);
          setPendingReview(true);
        } else if (co.status !== 'annule') {
          setCurrentOrder(co);
          syncOrder(co);
          currentOrderRef.current = co;
        }
      }
      driverIdRef.current = data.driver._id;
      // Si la socket est déjà connectée, rejoindre les rooms maintenant
      if (socketRef.current?.connected) {
        socketRef.current.emit('join_driver', data.driver._id);
        // Rejoindre aussi la room chat si une commande est active
        const activeOrderId = data.driver.currentOrder?._id || data.driver.currentOrder;
        if (activeOrderId) socketRef.current.emit('join_order_chat', activeOrderId);
        console.log('[SOCKET] join_driver envoyé depuis loadDriver:', data.driver._id);
      }
    } catch (e) { console.error('[loadDriver] erreur:', e.message); }
    finally { setLoading(false); }
  }, [driverProfile]);

  // ─── Charger tarif course pour compteur en temps réel ────────────────────
  useEffect(() => {
    api.get('/tarifs').then(r => {
      const ct = r.data.tarifs?.find(t => t.serviceType === 'course');
      if (ct) setCourseTarif(ct);
    }).catch(() => {});
  }, []);

  // ─── Charger commandes à proximité ────────────────────────────────────────
  const loadNearby = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/nearby');
      const now = Date.now();
      setNearbyOrders(
        (data.orders || []).map(o => ({ ...o, receivedAt: now }))
      );
    } catch {}
  }, []);

  // ─── Socket.io ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadDriver();
    const token = useAuthStore.getState().token;
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
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
      if (currentOrderRef.current) return; // déjà une commande en cours

      // Notification plein écran — ouvre l'app même téléphone verrouillé (comme un appel)
      showOrderFullScreen(order, distance).catch(() => {});

      setNearbyOrders(prev => {
        if (prev.find(o => o._id === order._id)) return prev;
        return [{ ...order, distance, minSoldeRequired, canAccept, receivedAt: Date.now() }, ...prev];
      });
      playBipSound();
      // Overlay custom avec compte à rebours auto-dismiss
      if (alertTimerRef.current) { clearTimeout(alertTimerRef.current); clearInterval(alertCountRef.current); }
      setOrderAlert({ order, distance, canAccept, timeLeft: 20 });
      alertCountRef.current = setInterval(() => {
        setOrderAlert(prev => {
          if (!prev) return null;
          if (prev.timeLeft <= 1) {
            clearInterval(alertCountRef.current);
            clearTimeout(alertTimerRef.current);
            stopBipSound();
            return null;
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
      alertTimerRef.current = setTimeout(() => {
        setOrderAlert(null);
        stopBipSound();
      }, 20000);
    });

    // Commande prise par un autre livreur
    socket.on('order_taken', ({ orderId }) => {
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
      setOrderAlert(prev => {
        if (!prev) return null;
        const same = prev.order._id === orderId || prev.order._id?.toString() === orderId?.toString();
        if (same) {
          clearInterval(alertCountRef.current);
          clearTimeout(alertTimerRef.current);
          stopBipSound();
          return null;
        }
        return prev;
      });
    });

    // Commande expirée (personne n'a accepté en 20s)
    socket.on('order_expired', ({ orderId }) => {
      cancelOrderNotification().catch(() => {});
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
      setOrderAlert(prev => {
        if (!prev) return null;
        const same = prev.order._id === orderId || prev.order._id?.toString() === orderId?.toString();
        if (same) {
          clearInterval(alertCountRef.current);
          clearTimeout(alertTimerRef.current);
          stopBipSound();
          return null;
        }
        return prev;
      });
    });

    // Boutons Accepter/Refuser depuis la notification (sans ouvrir l'app)
    const unsubNotifee = listenOrderNotificationEvents(
      (orderId) => {
        const order = nearbyOrders.find(o => o._id === orderId || o._id?.toString() === orderId);
        if (order) acceptOrder(order);
      },
      (orderId) => {
        rejectOrder(orderId);
        cancelOrderNotification().catch(() => {});
      }
    );

    // Mise à jour du solde après livraison
    socket.on('solde_updated', ({ solde: newSolde, message }) => {
      setSolde(newSolde);
      Alert.alert(t.solde_updated, message, [{ text: 'OK' }]);
    });

    // Commande annulée par le client
    socket.on('order_cancelled_by_client', () => {
      currentOrderRef.current = null;
      setCurrentOrder(null);
      setPendingReview(false);
      clearCurrentOrder();
      stopLocation();
      setUnreadChat(0);
      Alert.alert('❌ Annulé', 'Le client a annulé la commande.', [{ text: 'OK' }]);
    });

    // Admin a validé et libéré le livreur
    socket.on('order_cancelled_released', ({ message }) => {
      currentOrderRef.current = null;
      setCurrentOrder(null);
      setPendingReview(false);
      clearCurrentOrder();
      Alert.alert('✅ Libéré', message, [{ text: 'OK' }]);
      loadNearby();
    });

    // ── Ouvrir directement la course depuis une notification ──────────────────
    const openOrderFromNotif = async (orderId) => {
      if (currentOrderRef.current) return;
      try {
        const { data: nearbyData } = await api.get('/orders/nearby');
        const orders = nearbyData.orders || [];
        // Chercher la course spécifique, sinon prendre la première disponible
        let target = orders.find(o => o._id === orderId || o._id?.toString() === orderId);
        if (!target && orders.length > 0) target = orders[0];

        if (target) {
          // Ajouter à la liste
          setNearbyOrders(prev =>
            prev.find(o => o._id === target._id)
              ? prev
              : [{ ...target, receivedAt: Date.now() }, ...prev]
          );
          // Afficher le modal d'alerte directement
          if (alertTimerRef.current) { clearTimeout(alertTimerRef.current); clearInterval(alertCountRef.current); }
          setOrderAlert({ order: target, distance: target.distance, canAccept: target.canAccept, timeLeft: 20 });
          alertCountRef.current = setInterval(() => {
            setOrderAlert(prev => {
              if (!prev) return null;
              if (prev.timeLeft <= 1) { clearInterval(alertCountRef.current); stopBipSound(); return null; }
              return { ...prev, timeLeft: prev.timeLeft - 1 };
            });
          }, 1000);
          alertTimerRef.current = setTimeout(() => { setOrderAlert(null); stopBipSound(); }, 20000);
          playBipSound();
        } else {
          // Course expirée ou prise — rafraîchir la liste
          setNearbyOrders(orders.map(o => ({ ...o, receivedAt: Date.now() })));
        }
      } catch { loadNearby(); }
    };

    // ── Notification tap : app en arrière-plan → avant-plan ──────────────────
    const notifResponseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const d = response.notification.request.content.data || {};
      if (d.type === 'new_order') openOrderFromNotif(d.orderId);
    });

    // ── Notification tap : app fermée → démarrage à froid ─────────────────────
    // Attendre que loadDriver() termine avant de charger la course
    Notifications.getLastNotificationResponseAsync().then(response => {
      const d = response?.notification?.request?.content?.data || {};
      if (d.type === 'new_order') {
        // Petit délai pour laisser loadDriver() et l'auth s'initialiser
        setTimeout(() => openOrderFromNotif(d.orderId), 1500);
      }
    });

    // ── AppState : retour au premier plan → rafraîchir les commandes ──────────
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') loadNearby();
    });

    // ── Chat : rejoindre la room de la commande en cours au connect ───────────
    // (timeout court pour laisser loadDriver() définir currentOrderRef)
    socket.on('connect', () => {
      setTimeout(() => {
        if (currentOrderRef.current?._id) {
          socket.emit('join_order_chat', currentOrderRef.current._id);
        }
      }, 500);
    });

    // ── Appel entrant du client ────────────────────────────────────────────────
    socket.on('call_incoming', ({ orderId: cOrdId, callerName, callerSocketId, clientPhone }) => {
      if (callerSocketId === socket.id) return; // ignorer notre propre écho
      setIncomingCall({ callerName, callerSocketId, orderId: cOrdId, clientPhone });
    });

    // ── Chat : recevoir les messages du client même modal fermé ───────────────
    socket.on('chat_message', (msg) => {
      if (msg.senderRole !== 'client') return;
      setUnreadChat(n => n + 1);
      Alert.alert(
        '💬 ' + (msg.senderName || 'Client'),
        msg.text,
        [
          { text: 'Ignorer', style: 'cancel' },
          { text: 'Répondre', onPress: () => { setUnreadChat(0); setChatVisible(true); } },
        ]
      );
    });

    return () => {
      socket.disconnect();
      stopLocation();
      stopBipSound();
      notifResponseSub.remove();
      appStateSub.remove();
      unsubNotifee();
    };
  }, [driverProfile]);

  // ─── Action en attente (Accepter/Refuser depuis notification arrière-plan) ──
  useEffect(() => {
    const checkPendingAction = async () => {
      try {
        const val = await AsyncStorage.getItem('pending_order_action');
        if (!val) return;
        const { action, orderId } = JSON.parse(val);
        await AsyncStorage.removeItem('pending_order_action');
        if (action === 'accept') {
          const { data } = await api.post(`/orders/${orderId}/accept`);
          currentOrderRef.current = data.order;
          setCurrentOrder(data.order);
          syncOrder(data.order);
          setNearbyOrders([]);
          cancelOrderNotification().catch(() => {});
          startLocationTracking(data.order._id);
          socketRef.current?.emit('join_order_chat', data.order._id);
        } else if (action === 'reject') {
          await api.post(`/orders/${orderId}/reject`);
          setNearbyOrders(prev => prev.filter(o => o._id?.toString() !== orderId));
          cancelOrderNotification().catch(() => {});
        }
      } catch {}
    };
    // Délai pour laisser loadDriver() et le socket s'initialiser
    const timer = setTimeout(checkPendingAction, 2000);
    return () => clearTimeout(timer);
  }, []);

  // ─── Accepter une commande ─────────────────────────────────────────────────
  const dismissAlert = () => {
    clearInterval(alertCountRef.current);
    clearTimeout(alertTimerRef.current);
    setOrderAlert(null);
    stopBipSound();
  };

  const acceptOrder = async (order) => {
    dismissAlert();
    currentOrderRef.current = order;
    try {
      const { data } = await api.post(`/orders/${order._id}/accept`);
      currentOrderRef.current = data.order;
      setCurrentOrder(data.order);
      syncOrder(data.order);
      setNearbyOrders([]);
      startLocationTracking(data.order._id);
      setUnreadChat(0);
      socketRef.current?.emit('join_order_chat', data.order._id);
      const isCourseOrder = data.order?.orderType === 'course';
      Alert.alert(
        isCourseOrder ? t.acc_ride_title : t.acc_order_title,
        isCourseOrder
          ? t.acc_ride_msg
          : `${t.acc_order_msg} ${data.order.pricing?.commission} ${t.acc_order_msg2}`
      );
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
    dismissAlert();
    try {
      await api.post(`/orders/${orderId}/reject`);
      setNearbyOrders(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
    } catch {}
  };

  // ─── Annuler la commande en cours ─────────────────────────────────────────
  const submitCancelOrder = async () => {
    if (!cancelReason.trim()) {
      Alert.alert(t.error, t.cancel_err_reason);
      return;
    }
    setCancelling(true);
    try {
      await api.post(`/orders/${currentOrder._id}/cancel`, { reason: cancelReason.trim() });
      setCancelModalVisible(false);
      setCancelReason('');
      setPendingReview(true);
      stopLocation();
    } catch (err) {
      Alert.alert(t.error, err.response?.data?.message || t.err_update);
    } finally {
      setCancelling(false);
    }
  };

  // ─── Changer statut commande ───────────────────────────────────────────────
  const updateOrderStatus = async (status) => {
    if (!currentOrder) return;
    try {
      await api.patch(`/orders/${currentOrder._id}/status`, { status });
      setCurrentOrder(prev => ({ ...prev, status }));
      syncOrder({ ...currentOrder, status });
      if (status === 'en_preparation') {
        setLiveKm(0);
        lastKmPosRef.current = null;
      }
      if (status === 'livre') {
        stopLocation();
        arrivedRef.current.clear();
        currentOrderRef.current = null;
        setCurrentOrder(null);
        clearCurrentOrder();
        setLiveKm(0);
        lastKmPosRef.current = null;
        setTodayStats(p => ({
          deliveries: p.deliveries + 1,
          earnings: p.earnings + (currentOrder.pricing?.driverEarning || 0),
        }));
        loadNearby();
      }
    } catch { Alert.alert(t.error, t.err_update); }
  };

  // ─── GPS tracking ──────────────────────────────────────────────────────────
  const startLocationTracking = async (orderId) => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    // Arrêter l'ancien watcher avant d'en démarrer un nouveau
    stopLocation();
    const dId = driverIdRef.current || driverProfile?._id;
    // Envoyer la position immédiatement
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      socketRef.current?.emit('update_location', {
        driverId: dId, lat: pos.coords.latitude, lng: pos.coords.longitude, orderId,
      });
    } catch {}
    locationRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      ({ coords }) => {
        const { latitude: lat, longitude: lng } = coords;
        socketRef.current?.emit('update_location', {
          driverId: driverIdRef.current || driverProfile?._id,
          lat, lng, orderId,
        });

        // Suivi km en temps réel (passager à bord)
        const order = currentOrderRef.current;
        if (order?.status === 'en_preparation') {
          if (lastKmPosRef.current) {
            const d = haversineM(lastKmPosRef.current.lat, lastKmPosRef.current.lng, lat, lng) / 1000;
            if (d > 0.005) setLiveKm(prev => prev + d); // ignorer micro-mouvements < 5m
          }
          lastKmPosRef.current = { lat, lng };
        }

        // Détection d'arrivée automatique
        if (order && !['livre','annule'].includes(order.status)) {
          const check = (target, type) => {
            if (!target?.lat || !target?.lng) return;
            const key = `${order._id}_${type}`;
            if (arrivedRef.current.has(key)) return;
            if (haversineM(lat, lng, target.lat, target.lng) < ARRIVAL_RADIUS_M) {
              arrivedRef.current.add(key);
              socketRef.current?.emit('driver_arrived', { orderId: order._id, type });
            }
          };
          if (order.status === 'accepte')   check(order.pickupAddress,   'pickup');
          if (order.status === 'en_route')  check(order.deliveryAddress, 'delivery');
        }
      }
    );
  };

  const startLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t.perm_denied); return; }
    const dId = driverIdRef.current || driverProfile?._id;
    // Envoyer la position immédiatement dès que le chauffeur passe en ligne
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      socketRef.current?.emit('update_location', {
        driverId: dId, lat: pos.coords.latitude, lng: pos.coords.longitude,
      });
    } catch {}
    locationRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 8 },
      ({ coords }) => {
        socketRef.current?.emit('update_location', {
          driverId: driverIdRef.current || driverProfile?._id,
          lat: coords.latitude,
          lng: coords.longitude,
        });
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
      if (val) {
        startLocation();
        loadNearby();
        // Service au premier plan : garde l'app et le socket vivants (téléphone verrouillé)
        startDriverService().catch(() => {});
      } else {
        stopLocation();
        stopDriverService().catch(() => {});
      }
    } catch { Alert.alert(t.error, t.err_status); }
  };

  const isCourse = currentOrder?.orderType === 'course';

  const STATUS_NEXT = isCourse ? {
    accepte:        { next:'en_route',       label: t.btn_en_route_ride, color: COLORS.blue },
    en_route:       { next:'en_preparation', label: t.btn_onboard,       color: COLORS.amber },
    en_preparation: { next:'livre',          label: t.btn_end_ride,      color: COLORS.green },
  } : {
    accepte:  { next:'en_route', label: t.btn_pickup_order, color: COLORS.blue },
    en_route: { next:'livre',    label: t.btn_delivered,    color: COLORS.green },
  };

  // ─── Compteur live pour les courses (passager à bord) ─────────────────────
  const [meterSec, setMeterSec] = useState(0);
  useEffect(() => {
    if (isCourse && currentOrder?.status === 'en_preparation') {
      const startEntry = currentOrder.statusHistory?.slice().reverse()
        .find(h => h.status === 'en_preparation');
      const startTs = startEntry?.timestamp
        ? new Date(startEntry.timestamp).getTime()
        : Date.now();
      const t = setInterval(() => setMeterSec(Math.floor((Date.now() - startTs) / 1000)), 1000);
      return () => clearInterval(t);
    }
    setMeterSec(0);
  }, [currentOrder?.status, isCourse]);

  const liveFare = (courseTarif && isCourse && currentOrder?.status === 'en_preparation')
    ? Math.max(
        liveKm * (courseTarif.perKmFee || 30)
          + (meterSec / 60) * (courseTarif.perMinuteFee || 10),
        courseTarif.minimumFare || 100
      )
    : null;

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.purple, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#fff" size="large" />
      <Text style={{ color: 'rgba(255,255,255,0.75)', marginTop: 12, fontSize: 14, fontWeight: '600' }}>Chargement…</Text>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topSection}>

        {/* ── CARTE HERO ─────────────────────────────────────── */}
        <View style={styles.heroCard}>
          <View style={styles.heroBubble1} />
          <View style={styles.heroBubble2} />

          {/* Ligne haut : salutation + badge statut */}
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroGreeting}>
                {t.home_hello} {user?.firstName} {driver?.driverType === 'course' ? '🚖' : '🛵'}
              </Text>
              <Text style={styles.heroZone} numberOfLines={1}>{driver?.zone} · {driver?.vehicleType}</Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: isOnline ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.12)' }]}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? '#4ADE80' : 'rgba(255,255,255,0.45)' }]} />
              <Text style={styles.statusChipText}>{isOnline ? t.home_online : t.home_offline}</Text>
            </View>
          </View>

          {/* Solde */}
          <Text style={styles.heroSoldeLabel}>{t.home_solde}</Text>
          <Text style={styles.heroSoldeValue}>{solde.toLocaleString()} MRU</Text>

          {/* Toggle */}
          <View style={styles.heroToggleRow}>
            <Text style={styles.heroToggleLabel}>{isOnline ? t.home_receive : t.home_activate}</Text>
            <Switch
              value={isOnline}
              onValueChange={toggleOnline}
              trackColor={{ false: 'rgba(255,255,255,0.22)', true: '#4ADE80' }}
              thumbColor="#fff"
              ios_backgroundColor="rgba(255,255,255,0.22)"
            />
          </View>
        </View>

        {/* ── STATS DU JOUR ──────────────────────────────────── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>{driver?.driverType === 'course' ? '🚖' : '📦'}</Text>
            <Text style={styles.statValue}>{todayStats.deliveries}</Text>
            <Text style={styles.statLabel}>{driver?.driverType === 'course' ? t.stat_rides : t.stat_deliveries}</Text>
          </View>
          <View style={[styles.statCard, { borderColor: COLORS.purpleLight, borderWidth: 1.5 }]}>
            <Text style={styles.statIcon}>💰</Text>
            <Text style={[styles.statValue, { color: COLORS.green }]}>{todayStats.earnings.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{t.stat_earnings} MRU</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⭐</Text>
            <Text style={[styles.statValue, { color: '#B45309' }]}>{driver?.stats?.averageRating?.toFixed(1) || '—'}</Text>
            <Text style={styles.statLabel}>{t.stat_rating}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.contentArea, { flex: 1, paddingBottom: orderAlert ? 220 : 24 }]}>

        {/* ── ANNULATION EN ATTENTE ──────────────────────────── */}
        {pendingReview && (
          <View style={styles.pendingCard}>
            <View style={styles.pendingIconWrap}>
              <Text style={{ fontSize: 22 }}>⏳</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>{t.cancel_pending_title}</Text>
              <Text style={styles.pendingSub}>{t.cancel_pending_msg}</Text>
              {currentOrder && (
                <View style={styles.pendingOrderBadge}>
                  <Text style={{ fontSize: 12, color: COLORS.amber, fontWeight: '700' }}>
                    #{currentOrder._id?.slice(-6).toUpperCase()}
                  </Text>
                  {currentOrder.cancellationReason && (
                    <Text style={{ fontSize: 11, color: C.muted, marginTop: 2, fontStyle: 'italic' }}>
                      "{currentOrder.cancellationReason}"
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── COMMANDE EN COURS ──────────────────────────────── */}
        {currentOrder && !pendingReview ? (
          <View style={styles.orderCard}>
            {/* Barre de couleur selon le statut */}
            <View style={[styles.orderStatusBar, { backgroundColor: STATUS_NEXT[currentOrder.status]?.color || COLORS.purple }]} />

            <View style={styles.orderCardBody}>
              {/* En-tête */}
              <View style={styles.orderHeader}>
                <View style={styles.orderIconWrap}>
                  <Text style={{ fontSize: 20 }}>{isCourse ? '🚖' : SERVICE_ICONS[currentOrder.serviceType]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderTitle}>
                    {isCourse ? t.order_ride : t.order_cmd} #{currentOrder._id?.slice(-6).toUpperCase()}
                  </Text>
                  <View style={[styles.orderStatusBadge, { backgroundColor: (STATUS_NEXT[currentOrder.status]?.color || COLORS.purple) + '1A' }]}>
                    <Text style={[styles.orderStatusText, { color: STATUS_NEXT[currentOrder.status]?.color || COLORS.purple }]}>
                      {isCourse
                        ? ({ accepte: t.order_st_en_route_ride, en_route: t.order_st_pickup_ride, en_preparation: t.order_st_onboard }[currentOrder.status] || currentOrder.status)
                        : ({ en_attente: t.s_en_attente, accepte: t.s_accepte, en_preparation: t.s_en_preparation, en_route: t.s_en_route, livre: t.s_livre, annule: t.s_annule }[currentOrder.status] || currentOrder.status)}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {isCourse && currentOrder.status === 'en_preparation' ? (
                    <>
                      <Text style={[styles.orderPrice, { color: COLORS.amber }]}>~{Math.ceil(liveFare || 0)} MRU</Text>
                      <Text style={{ fontSize: 11, color: COLORS.purple, fontWeight: '700', marginTop: 1 }}>
                        📍 {liveKm.toFixed(2)} km
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.amber, fontWeight: '600', marginTop: 1 }}>
                        {String(Math.floor(meterSec/60)).padStart(2,'0')}:{String(meterSec%60).padStart(2,'0')}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.orderPrice}>
                      {isCourse && currentOrder.status !== 'livre'
                        ? `~${currentOrder.pricing?.total?.toLocaleString() || 100} MRU`
                        : `${currentOrder.pricing?.total?.toLocaleString()} MRU`}
                    </Text>
                  )}
                  <Text style={styles.orderCommNote}>
                    {isCourse ? t.order_price_end : `−${currentOrder.pricing?.commission} MRU`}
                  </Text>
                </View>
              </View>

              {/* Adresses */}
              <View style={styles.addressBlock}>
                <View style={styles.addrRow}>
                  <View style={[styles.addrDot, { backgroundColor: COLORS.green }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrLabel}>{isCourse ? t.order_pickup_ride : t.order_pickup}</Text>
                    <GeoLabel addr={currentOrder.pickupAddress} style={styles.addrText} numberOfLines={2} />
                  </View>
                </View>
                {!currentOrder.trajetOuvert ? (
                  <>
                    <View style={styles.addrSeparator} />
                    <View style={styles.addrRow}>
                      <View style={[styles.addrDot, { backgroundColor: COLORS.red }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.addrLabel}>{isCourse ? t.order_dest_ride : t.order_delivery}</Text>
                        <GeoLabel addr={currentOrder.deliveryAddress} style={styles.addrText} numberOfLines={2} />
                      </View>
                    </View>
                  </>
                ) : (
                  <Text style={[styles.addrLabel, { marginTop: 6, color: COLORS.amber }]}>{t.order_open_trip}</Text>
                )}
              </View>

              {/* Info commission */}
              <View style={styles.commBadge}>
                {isCourse ? (
                  <Text style={styles.commText}>
                    {t.order_comm_pct} <Text style={{ color: COLORS.red, fontWeight: '700' }}>{currentOrder.pricing?.commissionPercent || 15}%</Text> {t.order_comm_final}
                  </Text>
                ) : (
                  <Text style={styles.commText}>
                    {t.order_at_delivery} <Text style={{ color: COLORS.red, fontWeight: '700' }}>−{currentOrder.pricing?.commission} MRU</Text>
                    {' · '}Encaissement <Text style={{ color: COLORS.green, fontWeight: '700' }}>{currentOrder.pricing?.total?.toLocaleString()} MRU</Text>
                  </Text>
                )}
              </View>

              {/* Bouton action principal */}
              {STATUS_NEXT[currentOrder.status] && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: STATUS_NEXT[currentOrder.status].color }]}
                  onPress={() => Alert.alert(t.confirm, STATUS_NEXT[currentOrder.status].label, [
                    { text: t.cancel, style: 'cancel' },
                    { text: t.confirm, onPress: () => updateOrderStatus(STATUS_NEXT[currentOrder.status].next) },
                  ])}
                >
                  <Text style={styles.primaryBtnText}>{STATUS_NEXT[currentOrder.status].label}</Text>
                </TouchableOpacity>
              )}

              {/* Chat + Appel */}
              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { flex: 2 }]}
                  onPress={() => { setUnreadChat(0); setChatVisible(true); }}
                >
                  <Text style={styles.secondaryBtnText}>
                    💬 {t.chat_open || 'Chat'}
                    {unreadChat > 0 && <Text style={{ color: COLORS.red }}> ({unreadChat})</Text>}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { flex: 1, backgroundColor: COLORS.greenLight, borderColor: COLORS.green }]}
                  onPress={() => setCallClientVisible(true)}
                >
                  <Text style={[styles.secondaryBtnText, { color: COLORS.green }]}>📞</Text>
                </TouchableOpacity>
              </View>

              {/* Annulation */}
              {(isCourse ? ['accepte','en_route'].includes(currentOrder.status) : currentOrder.status === 'accepte') && (
                <TouchableOpacity
                  style={styles.cancelOrderBtn}
                  onPress={() => { setCancelReason(''); setCancelModalVisible(true); }}
                >
                  <Text style={styles.cancelOrderBtnTxt}>✕ {t.btn_cancel_order}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : !pendingReview ? (
          <>
            {nearbyOrders.length > 0 ? (
              <View>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t.home_nearby}</Text>
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeText}>{nearbyOrders.length}</Text>
                  </View>
                </View>

                {nearbyOrders.filter(o => !orderAlert || o._id !== orderAlert.order._id).map(order => {
                  const timeLeft = Math.max(0, Math.ceil((ORDER_TIMEOUT_MS - (now - (order.receivedAt || now))) / 1000));
                  const urgent   = timeLeft <= 5;
                  return (
                    <View key={order._id} style={[styles.nearbyCard, urgent && styles.nearbyCardUrgent]}>
                      <View style={styles.nearbyHeader}>
                        <View style={[styles.nearbyIconWrap, urgent && { backgroundColor: COLORS.redLight }]}>
                          <Text style={{ fontSize: 18 }}>{SERVICE_ICONS[order.serviceType]}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[styles.nearbyId, urgent && { color: COLORS.red }]}>
                            #{order._id.slice(-6).toUpperCase()} · {order.distance} km
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
                            <GeoLabel addr={order.pickupAddress} style={styles.nearbyAddr} numberOfLines={1} />
                            <Text style={styles.nearbyAddr}> → </Text>
                            <GeoLabel addr={order.deliveryAddress} style={styles.nearbyAddr} numberOfLines={1} />
                          </View>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.nearbyPrice}>{order.pricing?.total?.toLocaleString()} MRU</Text>
                          <CountdownRing timeLeft={timeLeft} />
                        </View>
                      </View>

                      <View style={styles.nearbyInfoBox}>
                        <Text style={{ fontSize: 12, color: C.muted }}>
                          {t.home_solde_req} <Text style={{ fontWeight: '700' }}>{order.pricing?.minSoldeRequired} MRU</Text>
                          {'  '}{t.home_your_solde} <Text style={{ fontWeight: '700', color: order.canAccept ? COLORS.green : COLORS.red }}>{solde} MRU</Text>
                        </Text>
                      </View>

                      <View style={styles.nearbyActions}>
                        <TouchableOpacity style={styles.refuseBtn} onPress={() => rejectOrder(order._id)}>
                          <Text style={styles.refuseBtnText}>{t.btn_refuse}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.acceptBtn, !order.canAccept && { opacity: 0.4 }]}
                          disabled={!order.canAccept}
                          onPress={() => order.canAccept ? acceptOrder(order) : setSoldeModal({ required: order.pricing?.minSoldeRequired, current: solde })}
                        >
                          <Text style={styles.acceptBtnText}>{order.canAccept ? t.btn_accept : t.btn_insufficient}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 52, marginBottom: 14 }}>{driver?.driverType === 'course' ? '🚖' : '📦'}</Text>
                <Text style={styles.emptyTitle}>
                  {isOnline
                    ? driver?.driverType === 'course' ? t.wait_passenger : t.wait_order
                    : t.go_online}
                </Text>
                <Text style={styles.emptySub}>
                  {isOnline ? `${t.current_solde} ${solde} MRU` : t.activate_hint}
                </Text>
                {!isOnline && (
                  <TouchableOpacity style={styles.goOnlineBtn} onPress={() => toggleOnline(true)}>
                    <Text style={styles.goOnlineBtnText}>Passer en ligne →</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* ── OVERLAY NOUVELLE COMMANDE ──────────────────────── */}
      {!!orderAlert && (
        <View style={[styles.alertOverlay, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
          <View style={styles.alertCard}>
            <View style={styles.alertTop}>
              <Text style={styles.alertTitle}>
                {orderAlert.order?.orderType === 'course' ? t.alert_new_ride : t.alert_new_order}
              </Text>
              <View style={[styles.alertCountdown, { borderColor: orderAlert.timeLeft <= 5 ? COLORS.red : COLORS.purple }]}>
                <Text style={[styles.alertCountdownNum, { color: orderAlert.timeLeft <= 5 ? COLORS.red : COLORS.purple }]}>
                  {orderAlert.timeLeft}
                </Text>
                <Text style={{ fontSize: 8, color: C.muted }}>s</Text>
              </View>
            </View>

            <View style={styles.alertInfoRow}>
              <Text style={{ fontSize: 30 }}>
                {orderAlert.order?.orderType === 'course' ? '🚖' : SERVICE_ICONS[orderAlert.order.serviceType]}
              </Text>
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.alertPrice}>
                  {orderAlert.order?.orderType === 'course'
                    ? `~${orderAlert.order.trajetOuvert ? `${courseTarif?.minimumFare || 100}+ MRU` : `${orderAlert.order.pricing?.total?.toLocaleString() || (courseTarif?.minimumFare || 100)} MRU`}`
                    : `${orderAlert.order.pricing?.total?.toLocaleString()} MRU`}
                </Text>
                <Text style={styles.alertDist}>{orderAlert.distance} km</Text>
              </View>
            </View>

            <View style={styles.alertAddrRow}>
              <View style={[styles.addrDot, { backgroundColor: COLORS.green }]} />
              <GeoLabel addr={orderAlert.order.pickupAddress} style={styles.alertAddrText} numberOfLines={1} />
            </View>
            {!orderAlert.order?.trajetOuvert ? (
              <View style={styles.alertAddrRow}>
                <View style={[styles.addrDot, { backgroundColor: COLORS.red }]} />
                <GeoLabel addr={orderAlert.order.deliveryAddress} style={styles.alertAddrText} numberOfLines={1} />
              </View>
            ) : (
              <Text style={[styles.alertAddrText, { color: COLORS.amber, marginLeft: 18 }]}>{t.alert_open}</Text>
            )}

            {!orderAlert.canAccept && (
              <Text style={{ fontSize: 12, color: COLORS.red, marginTop: 6, fontWeight: '600' }}>{t.alert_low_solde}</Text>
            )}

            <View style={styles.alertBtns}>
              <TouchableOpacity style={styles.alertRefuseBtn} onPress={() => rejectOrder(orderAlert.order._id)}>
                <Text style={styles.alertRefuseTxt}>{t.alert_reject}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.alertAcceptBtn, !orderAlert.canAccept && { opacity: 0.4 }]}
                disabled={!orderAlert.canAccept}
                onPress={() => orderAlert.canAccept ? acceptOrder(orderAlert.order) : null}
              >
                <Text style={styles.alertAcceptTxt}>{t.alert_accept}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal solde insuffisant */}
      <Modal visible={!!soldeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={{ fontSize: 38, textAlign: 'center', marginBottom: 10 }}>💰</Text>
            <Text style={styles.modalTitle}>{t.modal_low_title}</Text>
            <Text style={styles.modalText}>
              {t.modal_low_1}{' '}
              <Text style={{ fontWeight: '700', color: COLORS.purple }}>{soldeModal?.required} MRU</Text>.
            </Text>
            <Text style={styles.modalText}>
              {t.modal_low_2}{' '}
              <Text style={{ fontWeight: '700', color: COLORS.red }}>{soldeModal?.current} MRU</Text>
            </Text>
            <Text style={[styles.modalText, { marginTop: 8, color: C.muted }]}>{t.modal_low_3}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setSoldeModal(null)}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{t.modal_close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal annulation livreur */}
      <Modal visible={cancelModalVisible} transparent animationType="slide" onRequestClose={() => setCancelModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '80%' }]}>
              <Text style={styles.modalTitle}>{t.cancel_modal_title}</Text>
              <Text style={[styles.modalText, { color: C.muted, marginBottom: 12 }]}>
                #{currentOrder?._id?.slice(-6).toUpperCase()}
              </Text>
              <TextInput
                style={styles.cancelInput}
                placeholder={t.cancel_reason_ph}
                placeholderTextColor={C.muted}
                value={cancelReason}
                onChangeText={setCancelReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border }]}
                  onPress={() => setCancelModalVisible(false)}
                >
                  <Text style={{ color: C.muted, fontWeight: '600' }}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { flex: 2, backgroundColor: COLORS.red }]}
                  onPress={submitCancelOrder}
                  disabled={cancelling}
                >
                  {cancelling
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#fff', fontWeight: '700' }}>{t.cancel_confirm_btn}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <DriverChatModal
        visible={chatVisible}
        orderId={currentOrder?._id}
        onClose={() => { setChatVisible(false); setUnreadChat(0); }}
      />

      <CallModal
        visible={!!incomingCall}
        mode="callee"
        peerName={
          incomingCall?.callerName &&
          incomingCall.callerName !== 'undefined' &&
          incomingCall.callerName !== 'undefined undefined'
            ? incomingCall.callerName
            : 'Client'
        }
        orderId={incomingCall?.orderId}
        callerSocketId={incomingCall?.callerSocketId}
        clientPhone={incomingCall?.clientPhone}
        socketRef={socketRef}
        onEnd={() => setIncomingCall(null)}
      />

      <CallModal
        visible={callClientVisible}
        mode="caller"
        myName={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Livreur'}
        peerName={
          [currentOrder?.client?.firstName, currentOrder?.client?.lastName]
            .filter(Boolean).join(' ') || 'Client'
        }
        orderId={currentOrder?._id}
        clientPhone={currentOrder?.client?.phone}
        socketRef={socketRef}
        onEnd={() => setCallClientVisible(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F3F2FA' },
  topSection:  { paddingHorizontal: 16, paddingTop: 10 },
  contentArea: { paddingHorizontal: 16, paddingTop: 8 },

  /* Hero card */
  heroCard:      { backgroundColor: COLORS.purple, borderRadius: 20, padding: 14, marginBottom: 10, overflow: 'hidden' },
  heroBubble1:   { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30 },
  heroBubble2:   { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -24, left: 20 },
  heroTop:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  heroGreeting:  { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  heroZone:      { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' },
  statusChip:    { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusChipText:{ fontSize: 11, fontWeight: '700', color: '#fff' },
  heroSoldeLabel:{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  heroSoldeValue:{ fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 0.3, marginBottom: 10 },
  heroToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  heroToggleLabel: { fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: '500' },

  /* Stats */
  statsRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statCard:  { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 10, alignItems: 'center', shadowColor: COLORS.purple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  statIcon:  { fontSize: 14, marginBottom: 4 },
  statValue: { fontSize: 17, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 1, textAlign: 'center' },

  /* Pending */
  pendingCard:       { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: COLORS.amberLight, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.amber + '50' },
  pendingIconWrap:   { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.amber + '22', alignItems: 'center', justifyContent: 'center' },
  pendingTitle:      { fontSize: 14, fontWeight: '700', color: COLORS.amber, marginBottom: 4 },
  pendingSub:        { fontSize: 12, color: C.muted, lineHeight: 17 },
  pendingOrderBadge: { marginTop: 8, backgroundColor: C.card, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },

  /* Order card */
  orderCard:        { backgroundColor: C.card, borderRadius: 20, marginBottom: 12, overflow: 'hidden', shadowColor: COLORS.purple, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4 },
  orderStatusBar:   { height: 5 },
  orderCardBody:    { padding: 12 },
  orderHeader:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  orderIconWrap:    { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center' },
  orderTitle:       { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 5 },
  orderStatusBadge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  orderStatusText:  { fontSize: 11, fontWeight: '700' },
  orderPrice:       { fontSize: 17, fontWeight: '800', color: COLORS.purple },
  orderCommNote:    { fontSize: 11, color: COLORS.red, marginTop: 2 },

  addressBlock:   { backgroundColor: C.bg, borderRadius: 12, padding: 10, marginBottom: 8 },
  addrRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  addrDot:        { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  addrSeparator:  { width: 1.5, height: 12, backgroundColor: C.border, marginLeft: 4, marginVertical: 3 },
  addrLabel:      { fontSize: 10, color: C.muted, marginBottom: 1 },
  addrText:       { fontSize: 13, color: C.text, fontWeight: '500' },
  commBadge:      { backgroundColor: C.bg, borderRadius: 10, padding: 8, marginBottom: 8 },
  commText:       { fontSize: 11, color: C.muted, lineHeight: 16 },

  primaryBtn:     { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 8, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 2 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
  secondaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  secondaryBtn:   { backgroundColor: COLORS.purpleLight, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.purple + '30' },
  secondaryBtnText: { color: COLORS.purple, fontWeight: '700', fontSize: 13 },
  cancelOrderBtn:    { marginTop: 2, borderRadius: 12, paddingVertical: 10, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.red, backgroundColor: COLORS.redLight },
  cancelOrderBtnTxt: { color: COLORS.red, fontWeight: '700', fontSize: 13 },

  /* Section header */
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle:     { fontSize: 15, fontWeight: '700', color: C.text },
  sectionBadge:     { backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  sectionBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  /* Nearby cards */
  nearbyCard:       { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  nearbyCardUrgent: { backgroundColor: '#2A0E0E', borderWidth: 1.5, borderColor: COLORS.red },
  nearbyHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  nearbyIconWrap:   { width: 46, height: 46, borderRadius: 14, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center' },
  nearbyId:         { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 2 },
  nearbyAddr:       { fontSize: 11, color: C.muted },
  nearbyPrice:      { fontSize: 15, fontWeight: '800', color: COLORS.purple, marginBottom: 6 },
  nearbyInfoBox:    { backgroundColor: C.bg, borderRadius: 8, padding: 8, marginBottom: 10 },
  nearbyActions:    { flexDirection: 'row', gap: 8 },
  refuseBtn:        { flex: 1, backgroundColor: COLORS.redLight, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  refuseBtnText:    { color: COLORS.red, fontWeight: '700', fontSize: 13 },
  acceptBtn:        { flex: 2, backgroundColor: COLORS.green, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  acceptBtnText:    { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* Empty state */
  emptyState:     { backgroundColor: C.card, borderRadius: 22, padding: 36, alignItems: 'center', shadowColor: COLORS.purple, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  emptyTitle:     { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6, textAlign: 'center' },
  emptySub:       { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18, marginBottom: 4 },
  goOnlineBtn:    { marginTop: 18, backgroundColor: COLORS.purple, borderRadius: 14, paddingHorizontal: 26, paddingVertical: 13 },
  goOnlineBtnText:{ color: '#fff', fontWeight: '700', fontSize: 14 },

  /* Alert overlay */
  alertOverlay:      { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 },
  alertCard:         { backgroundColor: C.card, borderRadius: 24, padding: 18, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 22, elevation: 16, borderWidth: 2, borderColor: COLORS.purple },
  alertTop:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  alertTitle:        { fontSize: 16, fontWeight: '800', color: C.text },
  alertCountdown:    { width: 46, height: 46, borderRadius: 23, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  alertCountdownNum: { fontSize: 16, fontWeight: '800' },
  alertInfoRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  alertPrice:        { fontSize: 22, fontWeight: '800', color: COLORS.purple },
  alertDist:         { fontSize: 13, color: C.muted, marginTop: 2 },
  alertAddrRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  alertAddrText:     { fontSize: 13, color: C.text, flex: 1 },
  alertBtns:         { flexDirection: 'row', gap: 10, marginTop: 14 },
  alertRefuseBtn:    { flex: 1, backgroundColor: COLORS.redLight, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  alertRefuseTxt:    { color: COLORS.red, fontWeight: '700', fontSize: 14 },
  alertAcceptBtn:    { flex: 2, backgroundColor: COLORS.green, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  alertAcceptTxt:    { color: '#fff', fontWeight: '700', fontSize: 15 },

  /* Modals */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard:    { backgroundColor: C.card, borderRadius: 22, padding: 24, width: '100%' },
  modalTitle:   { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 10, textAlign: 'center' },
  modalText:    { fontSize: 14, color: C.text, marginBottom: 6, lineHeight: 20, textAlign: 'center' },
  modalBtn:     { backgroundColor: COLORS.purple, borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 16 },
  cancelInput:  { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, color: C.text, minHeight: 90, textAlignVertical: 'top', backgroundColor: C.bg },
});
