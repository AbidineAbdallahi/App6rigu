import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { io } from 'socket.io-client';
import { API_URL, SOCKET_URL, COLORS, SERVICE_ICONS } from './src/constants';
import useAuthStore from './src/stores/authStore';
import PhoneOtpLoginScreen from './src/screens/auth/PhoneOtpLoginScreen';
import ClientNavigator from './src/navigation/ClientNavigator';

// ─── Helper fetch avec auth ───────────────────────────────────────────────────
async function authFetch(url, token, options = {}) {
  const res = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  return data;
}

// ─── Logo Amder ───────────────────────────────────────────────────────────────
function AmderLogo({ size = 110 }) {
  const r  = Math.round(size * 0.22);
  const lw = Math.round(size * 0.115);
  const lh = Math.round(size * 0.70);
  const ang = 20;
  return (
    <View style={{
      width: size, height: size, borderRadius: r,
      backgroundColor: '#3B328F', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: '#2B2480', shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.55, shadowRadius: 16, elevation: 12,
    }}>
      <View style={{ position:'absolute', top:-size*0.22, left:-size*0.22, width:size*0.75, height:size*0.75, borderRadius:size*0.375, backgroundColor:'rgba(255,255,255,0.08)' }}/>
      <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', left:size*0.14, top:size*0.1, transform:[{rotate:`${ang}deg`}] }}/>
      <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', right:size*0.14, top:size*0.1, transform:[{rotate:`${-ang}deg`}] }}/>
      <View style={{ position:'absolute', top:size*0.53, flexDirection:'row', alignItems:'center', left:size*0.17 }}>
        <View style={{ width:size*0.40, height:size*0.09, backgroundColor:'#F59E0B', borderRadius:3 }}/>
        <View style={{ width:0, height:0, borderTopWidth:size*0.065, borderBottomWidth:size*0.065, borderLeftWidth:size*0.09, borderTopColor:'transparent', borderBottomColor:'transparent', borderLeftColor:'#F59E0B' }}/>
      </View>
    </View>
  );
}

// ─── Écran de sélection du rôle ───────────────────────────────────────────────
function RoleSelectScreen({ onSelect }) {
  return (
    <SafeAreaView style={st.safe}>
      <View style={[st.center, { padding: 32 }]}>
        <AmderLogo size={120} />
        <Text style={[st.title, { marginTop: 20 }]}>Amder</Text>
        <Text style={st.sub}>Livraison & Transport</Text>

        <TouchableOpacity
          style={[st.roleBtn, { backgroundColor: COLORS.purple, marginTop: 40 }]}
          onPress={() => onSelect('client')}
        >
          <Text style={{ fontSize: 28, marginBottom: 6 }}>📦</Text>
          <Text style={st.roleBtnTitle}>Je suis un Client</Text>
          <Text style={st.roleBtnSub}>Passer et suivre mes commandes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[st.roleBtn, { backgroundColor: COLORS.green, marginTop: 16 }]}
          onPress={() => onSelect('driver')}
        >
          <Text style={{ fontSize: 28, marginBottom: 6 }}>🛵</Text>
          <Text style={st.roleBtnTitle}>Je suis un Livreur</Text>
          <Text style={st.roleBtnSub}>Recevoir et effectuer des livraisons</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Connexion Livreur (email + mot de passe) ─────────────────────────────────
function DriverLoginScreen({ onBack }) {
  const { login, loading, error } = useAuthStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    const role = await login(email.trim().toLowerCase(), password);
    if (role && role !== 'driver') {
      useAuthStore.getState().logout();
    }
  };

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <TouchableOpacity onPress={onBack} style={{ alignSelf: 'flex-start', marginBottom: 16, marginLeft: 8 }}>
          <Text style={{ color: COLORS.purple, fontSize: 14 }}>← Retour</Text>
        </TouchableOpacity>
        <AmderLogo size={110} />
        <Text style={st.title}>Amder</Text>
        <Text style={st.sub}>Espace Livreur</Text>
        <View style={st.card}>
          {!!error && <View style={st.errBox}><Text style={st.errTxt}>{error}</Text></View>}
          <Text style={st.lbl}>Email</Text>
          <TextInput style={st.inp} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" placeholder="livreur@amder.mr" />
          <Text style={st.lbl}>Mot de passe</Text>
          <TextInput style={st.inp} value={password} onChangeText={setPassword}
            secureTextEntry placeholder="••••••••" />
          <TouchableOpacity style={st.btn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Se connecter</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Compte à rebours 20s ─────────────────────────────────────────────────────
const ORDER_TIMEOUT_MS = 20000;
const RING_SIZE   = 56;
const RING_BORDER = 5;

function CountdownRing({ timeLeft, total = 20 }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const urgent    = timeLeft <= 5 && timeLeft > 0;
  useEffect(() => {
    if (urgent) {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 220, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 220, useNativeDriver: true }),
      ]));
      anim.start();
      return () => anim.stop();
    } else { pulseAnim.setValue(1); }
  }, [urgent]);
  const deg      = (timeLeft / total) * 360;
  const color    = timeLeft > 10 ? '#3B6D11' : timeLeft > 5 ? '#854F0B' : '#A32D2D';
  const rightRot = Math.min(deg, 180) - 90;
  const leftRot  = Math.max(deg - 180, 0) - 90;
  return (
    <Animated.View style={{ width:RING_SIZE, height:RING_SIZE, transform:[{scale:pulseAnim}] }}>
      <View style={{ position:'absolute', width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:'#E0E0E0' }} />
      <View style={{ position:'absolute', right:0, width:RING_SIZE/2, height:RING_SIZE, overflow:'hidden' }}>
        <View style={{ position:'absolute', right:0, width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:color, transform:[{rotate:`${rightRot}deg`}] }} />
      </View>
      <View style={{ position:'absolute', left:0, width:RING_SIZE/2, height:RING_SIZE, overflow:'hidden' }}>
        <View style={{ position:'absolute', left:0, width:RING_SIZE, height:RING_SIZE, borderRadius:RING_SIZE/2, borderWidth:RING_BORDER, borderColor:color, transform:[{rotate:`${leftRot}deg`}] }} />
      </View>
      <View style={{ position:'absolute', width:RING_SIZE, height:RING_SIZE, alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize:16, fontWeight:'800', color, lineHeight:18 }}>{timeLeft}</Text>
        <Text style={{ fontSize:7, color, opacity:0.75 }}>sec</Text>
      </View>
    </Animated.View>
  );
}

// ─── Géocodage inverse (Nominatim) ───────────────────────────────────────────
const _geoCache = {};
function _parseCoords(str) {
  if (!str) return null;
  const m = String(str).match(/^\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}
async function _fetchPlaceName(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (_geoCache[key]) return _geoCache[key];
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'DeliverPlusApp/1.0' } }
    );
    const data = await res.json();
    const a    = data.address || {};
    const name = a.suburb || a.neighbourhood || a.quarter || a.city_district
              || a.village || a.town || a.city || a.county
              || data.display_name?.split(',')[0] || key;
    _geoCache[key] = name;
    return name;
  } catch { _geoCache[key] = key; return key; }
}
function AddressText({ address, prefix = '', style }) {
  const raw    = address?.label || address?.zone || '';
  const coords = _parseCoords(raw);
  const [name, setName] = useState(coords ? '…' : (raw || '—'));
  useEffect(() => {
    if (!coords) { setName(raw || '—'); return; }
    let active = true;
    _fetchPlaceName(coords.lat, coords.lng).then(n => { if (active) setName(n); });
    return () => { active = false; };
  }, [raw]);
  return <Text style={style}>{prefix}{name}</Text>;
}

// ─── DASHBOARD LIVREUR ────────────────────────────────────────────────────────
function Dashboard({ session, onLogout }) {
  const { user, token } = session;
  const driverId = session.driverProfile?._id;

  const [isOnline, setIsOnline]   = useState(false);
  const [solde, setSolde]         = useState(0);
  const [order, setOrder]         = useState(null);
  const [nearby, setNearby]       = useState([]);
  const [stats, setStats]         = useState({ d:0, e:0 });
  const [busy, setBusy]           = useState(false);
  const [msg, setMsg]             = useState(null);
  const [suspended, setSuspended] = useState(false);
  const [now, setNow]             = useState(Date.now());
  const socketRef    = useRef(null);
  const soundRef     = useRef(null);
  const soundTimerRef = useRef(null);

  const loadProfile = useCallback(async () => {
    const data = await authFetch(`/drivers/${driverId}`, token);
    if (!data.success) return;
    setSolde(data.driver.solde || 0);
    if (data.driver.currentOrder) {
      const oid = data.driver.currentOrder?._id || data.driver.currentOrder;
      const od = await authFetch(`/orders/${oid}`, token);
      if (od.success) setOrder(od.order);
    } else { setOrder(null); }
  }, [driverId, token]);

  const loadNearby = useCallback(async () => {
    const data = await authFetch('/orders/nearby', token);
    if (data.success) {
      setNearby(prev => {
        const prevMap = {};
        prev.forEach(o => { prevMap[o._id] = o.receivedAt; });
        return (data.orders || []).map(o => ({ ...o, receivedAt: prevMap[o._id] ?? Date.now() }));
      });
      if (data.driverSolde !== undefined) setSolde(data.driverSolde);
    }
  }, [token]);

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
        const { sound } = await Audio.Sound.createAsync(require('./assets/alert.wav'), { shouldPlay: true, isLooping: false, volume: 1.0 });
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setNearby(prev => {
      const filtered = prev.filter(o => (now - (o.receivedAt || now)) < ORDER_TIMEOUT_MS);
      if (filtered.length === 0 && prev.length > 0) stopBipSound();
      return filtered;
    });
  }, [now]);

  useEffect(() => {
    loadProfile();
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    socket.emit('join_driver', driverId);
    socket.on('new_order_nearby', ({ order: o, distance, canAccept }) => {
      setNearby(prev => prev.find(x => x._id === o._id) ? prev : [{ ...o, distance, canAccept, receivedAt: Date.now() }, ...prev]);
      playBipSound();
      setMsg({ text: `🔔 Nouvelle commande à ${distance} km !`, type: canAccept ? 'info' : 'warn' });
    });
    socket.on('order_taken', ({ orderId }) => {
      setNearby(prev => {
        const next = prev.filter(o => o._id !== orderId);
        if (next.length === 0) stopBipSound();
        return next;
      });
    });
    socket.on('solde_updated',     ({ solde: s, message }) => { setSolde(s); setMsg({ text: message, type: 'success' }); });
    socket.on('account_suspended',  ({ message }) => { setSuspended(true);  setIsOnline(false); Alert.alert('🚫 Suspendu', message); });
    socket.on('account_reactivated',({ message }) => { setSuspended(false); Alert.alert('✅ Réactivé', message); });
    return () => { socket.disconnect(); stopBipSound(); };
  }, [driverId, token]);

  useEffect(() => { if (isOnline) loadNearby(); }, [isOnline]);

  const toggleOnline = async () => {
    if (suspended) return Alert.alert('Compte suspendu', 'Contactez l\'administrateur');
    const newStatus = isOnline ? 'pause' : 'actif';
    const data = await authFetch(`/drivers/${driverId}/status`, token, { method: 'PATCH', body: { status: newStatus } });
    if (data.success) {
      socketRef.current?.emit('update_driver_status', { driverId, status: newStatus });
      setIsOnline(!isOnline);
    }
  };

  const acceptOrder = async (o) => {
    stopBipSound();
    setBusy(true);
    const data = await authFetch(`/orders/${o._id}/accept`, token, { method: 'POST' });
    setBusy(false);
    if (!data.success) return Alert.alert('Erreur', data.message);
    setOrder(data.order);
    setNearby([]);
    setMsg({ text: `✅ Acceptée ! Commission : ${data.order.pricing?.commission} MRU`, type: 'success' });
  };

  const rejectOrder = async (oid) => {
    await authFetch(`/orders/${oid}/reject`, token, { method: 'POST' });
    setNearby(prev => {
      const next = prev.filter(o => o._id !== oid);
      if (next.length === 0) stopBipSound();
      return next;
    });
  };

  const updateStatus = async (nextStatus) => {
    if (!order) return;
    const oid = order._id || order.id;
    if (!oid) { Alert.alert('Erreur', 'ID commande manquant'); return; }
    setBusy(true);
    try {
      const data = await authFetch(`/orders/${oid}/status`, token, { method: 'PATCH', body: { status: nextStatus } });
      if (!data.success) { Alert.alert('Erreur', data.message || 'Mise à jour échouée'); return; }
      setOrder(prev => ({ ...prev, status: nextStatus }));
      setMsg({ text: `Statut : ${nextStatus}`, type: 'success' });
      if (nextStatus === 'livre') {
        const earning = order.pricing?.driverEarning || 0;
        const comm    = order.pricing?.commission    || 0;
        setStats(p => ({ d: p.d + 1, e: p.e + earning }));
        setMsg({ text: `🎉 Livré ! +${earning} MRU (commission -${comm} MRU)`, type: 'success' });
        setOrder(null);
        await loadProfile();
        if (isOnline) loadNearby();
      }
    } catch (e) { Alert.alert('Erreur réseau', e.message); }
    finally { setBusy(false); }
  };

  const STEPS = {
    accepte:        { next: 'en_preparation', label: '📦 Commande récupérée',  color: '#185FA5' },
    en_preparation: { next: 'en_route',       label: '🛵 Je suis en route !',   color: '#534AB7' },
    en_route:       { next: 'livre',          label: '✅ Marquer comme livré',   color: '#3B6D11' },
  };

  const MSG_BG   = { info:'#EEEDFE', success:'#EAF3DE', warn:'#FAEEDA', error:'#FCEBEB' };
  const MSG_TEXT = { info:'#3C3489', success:'#27500A', warn:'#633806', error:'#A32D2D' };

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <View>
            <Text style={st.title2}>Bonjour {user.firstName} 🛵</Text>
            <Text style={{ fontSize:13, color:COLORS.muted }}>{session.driverProfile?.zone} · {session.driverProfile?.vehicleType}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AmderLogo size={32} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.purple }}>Amder</Text>
            </View>
            <TouchableOpacity onPress={onLogout} style={{ borderWidth:.5, borderColor:'#F09595', borderRadius:8, paddingHorizontal:10, paddingVertical:5 }}>
              <Text style={{ color:COLORS.red, fontSize:11 }}>Déconnexion</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ backgroundColor:COLORS.purpleLight, borderRadius:14, padding:16, marginBottom:14, alignItems:'center' }}>
          <Text style={{ fontSize:13, color:COLORS.purple }}>💰 Votre solde</Text>
          <Text style={{ fontSize:32, fontWeight:'700', color:COLORS.purpleDark, marginTop:4 }}>{solde.toLocaleString()} MRU</Text>
          <Text style={{ fontSize:11, color:COLORS.purple, marginTop:4 }}>Min. requis = 20% du total commande</Text>
        </View>

        {suspended && (
          <View style={{ backgroundColor:'#FCEBEB', borderRadius:12, padding:14, marginBottom:14 }}>
            <Text style={{ color:'#A32D2D', fontWeight:'700', textAlign:'center', fontSize:14 }}>
              🚫 Compte suspendu — Contactez l'administrateur
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={toggleOnline}
          style={{ backgroundColor: suspended ? '#999' : isOnline ? '#3B6D11' : '#888780', borderRadius:14, padding:16, alignItems:'center', marginBottom:14 }}>
          <Text style={{ color:'#fff', fontWeight:'700', fontSize:14 }}>
            {suspended ? '🚫 COMPTE SUSPENDU' : isOnline ? '🟢 EN LIGNE — Appuyez pour se déconnecter' : '⚫ HORS LIGNE — Appuyez pour aller en ligne'}
          </Text>
        </TouchableOpacity>

        {msg && (
          <TouchableOpacity onPress={() => setMsg(null)}>
            <View style={{ backgroundColor: MSG_BG[msg.type] || '#EEEDFE', borderRadius:10, padding:12, marginBottom:12 }}>
              <Text style={{ color: MSG_TEXT[msg.type] || '#3C3489', fontSize:13 }}>{msg.text}</Text>
              <Text style={{ color: MSG_TEXT[msg.type], fontSize:10, marginTop:2, opacity:.7 }}>Appuyez pour fermer</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection:'row', gap:12, marginBottom:14 }}>
          <View style={st.statCard}><Text style={{ fontSize:22, fontWeight:'700', color:COLORS.text }}>{stats.d}</Text><Text style={{ fontSize:11, color:COLORS.muted }}>Livraisons</Text></View>
          <View style={st.statCard}><Text style={{ fontSize:22, fontWeight:'700', color:COLORS.green }}>{stats.e.toLocaleString()}</Text><Text style={{ fontSize:11, color:COLORS.muted }}>Gains MRU</Text></View>
        </View>

        {order && (
          <View style={{ backgroundColor:'#fff', borderRadius:14, padding:16, borderWidth:2, borderColor:COLORS.purple, marginBottom:12 }}>
            <Text style={{ fontSize:15, fontWeight:'600', color:COLORS.text, marginBottom:10 }}>📦 Commande en cours</Text>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <Text style={{ fontSize:24 }}>{SERVICE_ICONS[order.serviceType] || '📦'}</Text>
              <Text style={{ fontSize:18, fontWeight:'700', color:COLORS.purple }}>{order.pricing?.total?.toLocaleString()} MRU</Text>
            </View>
            <Text style={{ fontSize:14, fontWeight:'600', color:COLORS.text }}>#{(order._id || '').slice(-6).toUpperCase()}</Text>
            <AddressText address={order.pickupAddress}  prefix="📍 Retrait : "   style={{ fontSize:12, color:COLORS.muted, marginTop:4 }} />
            <AddressText address={order.deliveryAddress} prefix="🏠 Livraison : " style={{ fontSize:12, color:COLORS.muted, marginTop:2 }} />
            <Text style={{ fontSize:12, color:COLORS.muted, marginTop:2 }}>Statut : <Text style={{ fontWeight:'600', color:COLORS.purple }}>{order.status}</Text></Text>
            <View style={{ flexDirection:'row', justifyContent:'space-between', backgroundColor:COLORS.bg, padding:10, borderRadius:8, marginTop:10 }}>
              <Text style={{ fontSize:12, color:COLORS.red }}>Commission : -{order.pricing?.commission || 0} MRU</Text>
              <Text style={{ fontSize:12, color:COLORS.green, fontWeight:'600' }}>Gain : +{order.pricing?.driverEarning || 0} MRU</Text>
            </View>
            {STEPS[order.status] && (
              <TouchableOpacity
                disabled={busy}
                style={{ backgroundColor: STEPS[order.status].color, borderRadius:12, padding:14, alignItems:'center', marginTop:12 }}
                onPress={() => {
                  const step = STEPS[order.status];
                  Alert.alert('Confirmer', step.label + ' ?', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Confirmer', onPress: () => updateStatus(step.next) },
                  ]);
                }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'700', fontSize:15 }}>{STEPS[order.status].label}</Text>}
              </TouchableOpacity>
            )}
            {order.status === 'livre' && (
              <View style={{ backgroundColor:'#EAF3DE', borderRadius:10, padding:12, marginTop:10, alignItems:'center' }}>
                <Text style={{ color:'#27500A', fontWeight:'700', fontSize:14 }}>✅ Livraison terminée !</Text>
              </View>
            )}
          </View>
        )}

        {!order && isOnline && !suspended && (
          <View>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <Text style={{ fontSize:15, fontWeight:'600', color:COLORS.text }}>
                {nearby.length > 0 ? `🔔 ${nearby.length} commande(s)` : '⏳ En attente...'}
              </Text>
              <TouchableOpacity onPress={loadNearby}>
                <Text style={{ color:COLORS.purple, fontSize:12 }}>🔄 Actualiser</Text>
              </TouchableOpacity>
            </View>
            {nearby.map(o => {
              const ok       = solde >= (o.pricing?.minSoldeRequired || 0);
              const timeLeft = Math.max(0, Math.ceil((ORDER_TIMEOUT_MS - (now - (o.receivedAt || now))) / 1000));
              const urgent   = timeLeft <= 5;
              return (
                <View key={o._id} style={{ backgroundColor: urgent ? '#FFF5F5' : '#fff', borderRadius:14, padding:14, borderLeftWidth:3, borderLeftColor: urgent ? '#A32D2D' : ok ? COLORS.green : COLORS.red, marginBottom:10 }}>
                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                    <Text style={{ fontSize:22 }}>{SERVICE_ICONS[o.serviceType] || '📦'}</Text>
                    <Text style={{ fontSize:16, fontWeight:'700', color:COLORS.purple }}>{o.pricing?.total?.toLocaleString()} MRU</Text>
                    <CountdownRing timeLeft={timeLeft} />
                  </View>
                  <Text style={{ fontWeight:'600', marginTop:4 }}>#{(o._id || '').slice(-6).toUpperCase()}</Text>
                  <AddressText address={o.pickupAddress}  prefix="📍 " style={{ fontSize:12, color:COLORS.muted, marginTop:2 }} />
                  <AddressText address={o.deliveryAddress} prefix="🏠 " style={{ fontSize:12, color:COLORS.muted }} />
                  <Text style={{ fontSize:12, color:COLORS.muted }}>Distance : {o.distance} km</Text>
                  <View style={{ flexDirection:'row', justifyContent:'space-between', backgroundColor:COLORS.bg, padding:8, borderRadius:8, marginTop:8 }}>
                    <Text style={{ fontSize:12, color:COLORS.muted }}>Requis : <Text style={{ fontWeight:'700' }}>{o.pricing?.minSoldeRequired} MRU</Text></Text>
                    <Text style={{ fontSize:12, color: ok ? COLORS.green : COLORS.red, fontWeight:'700' }}>Solde : {solde} MRU {ok ? '✅' : '❌'}</Text>
                  </View>
                  <View style={{ flexDirection:'row', gap:8, marginTop:10 }}>
                    <TouchableOpacity onPress={() => rejectOrder(o._id)} style={{ flex:1, backgroundColor:'#FCEBEB', borderRadius:10, padding:11, alignItems:'center' }}>
                      <Text style={{ color:COLORS.red, fontWeight:'600' }}>✕ Refuser</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => ok ? acceptOrder(o) : Alert.alert('Solde insuffisant', `Requis : ${o.pricing?.minSoldeRequired} MRU\nVotre solde : ${solde} MRU`)}
                      style={{ flex:2, backgroundColor: ok ? COLORS.green : '#ccc', borderRadius:10, padding:11, alignItems:'center' }}>
                      <Text style={{ color:'#fff', fontWeight:'700' }}>✓ Accepter</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
        {busy && <ActivityIndicator color={COLORS.purple} size="large" style={{ marginTop:20 }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, token, driverProfile, logout, initialized, init } = useAuthStore();
  const [role, setRole] = useState(null); // null | 'client' | 'driver'

  useEffect(() => { init(); }, []);

  const handleLogout = () => { logout(); setRole(null); };

  // Splash pendant l'initialisation
  if (!initialized) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#3B328F', alignItems: 'center', justifyContent: 'center' }}>
          <AmderLogo size={90} />
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 18 }}>Amder</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  // Non connecté → flux d'authentification
  if (!token) {
    if (!role) {
      return (
        <SafeAreaProvider>
          <StatusBar style="light" />
          <RoleSelectScreen onSelect={setRole} />
        </SafeAreaProvider>
      );
    }
    if (role === 'driver') {
      return (
        <SafeAreaProvider>
          <StatusBar style="light" />
          <DriverLoginScreen onBack={() => setRole(null)} />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PhoneOtpLoginScreen onBack={() => setRole(null)} />
      </SafeAreaProvider>
    );
  }

  // Connecté en tant que Livreur
  if (user?.role === 'driver') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Dashboard session={{ user, token, driverProfile }} onLogout={handleLogout} />
      </SafeAreaProvider>
    );
  }

  // Connecté en tant que Client
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <ClientNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  safe:    { flex:1, backgroundColor: COLORS.bg },
  center:  { flexGrow:1, justifyContent:'center', padding:24 },
  title:   { fontSize:28, fontWeight:'900', color:COLORS.text, textAlign:'center', marginBottom:4, marginTop:14 },
  title2:  { fontSize:20, fontWeight:'600', color:COLORS.text },
  sub:     { fontSize:13, color:COLORS.muted, textAlign:'center', marginBottom:24 },
  card:    { backgroundColor:'#fff', borderRadius:16, padding:20, borderWidth:.5, borderColor:COLORS.border },
  lbl:     { fontSize:12, color:COLORS.muted, marginBottom:5 },
  inp:     { borderWidth:.5, borderColor:COLORS.border, borderRadius:10, padding:12, fontSize:14, backgroundColor:COLORS.bg, marginBottom:14 },
  btn:     { backgroundColor:COLORS.purple, borderRadius:12, padding:14, alignItems:'center' },
  btnTxt:  { color:'#fff', fontWeight:'700', fontSize:15 },
  errBox:  { backgroundColor:COLORS.redLight, borderRadius:8, padding:10, marginBottom:12 },
  errTxt:  { color:COLORS.red, fontSize:13 },
  statCard:{ flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', borderWidth:.5, borderColor:COLORS.border },
  roleBtn: { width:'100%', borderRadius:18, padding:22, alignItems:'center' },
  roleBtnTitle: { color:'#fff', fontWeight:'800', fontSize:18 },
  roleBtnSub:   { color:'rgba(255,255,255,0.75)', fontSize:13, marginTop:4 },
});
