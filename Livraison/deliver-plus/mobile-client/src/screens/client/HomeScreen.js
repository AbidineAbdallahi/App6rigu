import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { io } from 'socket.io-client';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import api from '../../services/api';
import { COLORS, SERVICE_ICONS, SERVICE_COLORS, SOCKET_URL } from '../../constants';
import SupportCallModal from './SupportCallModal';

const ACTIVE_STATUSES = ['en_attente', 'diffuse', 'accepte', 'en_preparation', 'en_route'];

export default function HomeScreen({ navigation }) {
  const { user, token } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const rtl = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  const [activeOrder, setActiveOrder]             = useState(null);
  const [supportCallVisible, setSupportCallVisible] = useState(false);
  const [agentsOnline, setAgentsOnline]           = useState(0);

  const socketRef = useRef(null);

  useFocusEffect(useCallback(() => {
    api.get('/orders?limit=10').then(r => {
      const orders = r.data.orders || [];
      setActiveOrder(orders.find(o => ACTIVE_STATUSES.includes(o.status)) || null);
    }).catch(() => {});
  }, []));

  // Socket pour le compteur d'agents support
  useEffect(() => {
    const tok = token || useAuthStore.getState().token;
    const socket = io(SOCKET_URL, {
      auth: { token: tok },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on('support_agents_count', ({ available }) => {
      setAgentsOnline(available || 0);
    });
    return () => socket.disconnect();
  }, []);

  const DELIVERY_SERVICES = [
    { key: 'nourriture', label: t.svc_nourriture, desc: t.svc_nourriture_desc },
    { key: 'courses',    label: t.svc_courses,    desc: t.svc_courses_desc    },
    { key: 'colis',      label: t.svc_colis,      desc: t.svc_colis_desc      },
    { key: 'pharmacie',  label: t.svc_pharmacie,  desc: t.svc_pharmacie_desc  },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, rtl]}>{t.home_hello} {user?.firstName}</Text>
            <Text style={[styles.subgreeting, rtl]}>{t.home_sub}</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={{ color: COLORS.purple, fontWeight: '700', fontSize: 15 }}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </Text>
          </View>
        </View>

        {activeOrder && (
          <TouchableOpacity
            style={styles.activeBanner}
            onPress={() => navigation.navigate('OrderTrack', { orderId: activeOrder._id })}
          >
            <View>
              <Text style={styles.activeBannerTitle}>{t.home_active}</Text>
              <Text style={styles.activeBannerSub}>
                {SERVICE_ICONS[activeOrder.serviceType] || '🚗'} {t.home_active_sub}
              </Text>
            </View>
            <Text style={{ color: '#CECBF6', fontSize: 22 }}>{isAr ? '‹' : '›'}</Text>
          </TouchableOpacity>
        )}

        {/* Course */}
        <Text style={[styles.sectionTitle, rtl]}>{t.home_ride_section}</Text>
        <TouchableOpacity
          style={styles.courseCard}
          onPress={() => navigation.navigate('NewOrder', { orderType: 'course' })}
        >
          <View style={styles.courseLeft}>
            <Text style={styles.courseIcon}>🚖</Text>
            <View>
              <Text style={[styles.courseLabel, rtl]}>{t.home_ride_label}</Text>
              <Text style={[styles.courseDesc, rtl]}>{t.home_ride_desc}</Text>
            </View>
          </View>
          <Text style={{ color: COLORS.purple, fontSize: 20 }}>{isAr ? '‹' : '›'}</Text>
        </TouchableOpacity>

        {/* Livraison */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }, rtl]}>{t.home_delivery_section}</Text>
        <View style={styles.grid}>
          {DELIVERY_SERVICES.map(s => {
            const c = SERVICE_COLORS[s.key];
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.serviceCard, { backgroundColor: c.bg }]}
                onPress={() => navigation.navigate('NewOrder', { orderType: 'livraison', serviceType: s.key })}
              >
                <Text style={styles.serviceIcon}>{SERVICE_ICONS[s.key]}</Text>
                <Text style={[styles.serviceLabel, { color: c.text }, rtl]}>{s.label}</Text>
                <Text style={[styles.serviceDesc2, { color: c.text, opacity: .7 }, rtl]}>{s.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contacter le support */}
        <TouchableOpacity
          style={styles.supportCard}
          onPress={() => setSupportCallVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.supportIconWrap}>
            <Text style={{ fontSize: 22 }}>🎧</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.supportTitle}>Contacter le support</Text>
            <Text style={styles.supportSub}>Parler à un agent en direct</Text>
          </View>
          <View style={[styles.liveBadge, {
            backgroundColor: agentsOnline > 0 ? 'rgba(39,174,96,0.10)' : 'rgba(230,126,34,0.10)',
          }]}>
            <View style={[styles.liveDot, {
              backgroundColor: agentsOnline > 0 ? '#27AE60' : '#E67E22',
            }]} />
            <Text style={[styles.liveText, {
              color: agentsOnline > 0 ? '#27AE60' : '#E67E22',
            }]}>
              {agentsOnline > 0 ? 'Live' : 'Occupé'}
            </Text>
          </View>
        </TouchableOpacity>

      </ScrollView>

      <SupportCallModal
        visible={supportCallVisible}
        callerName={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Client'}
        callerType="client"
        socketRef={socketRef}
        onClose={() => setSupportCallVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: COLORS.bg },
  scroll:            { padding: 20 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting:          { fontSize: 22, fontWeight: '600', color: COLORS.text },
  subgreeting:       { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  avatar:            { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center' },
  activeBanner:      { backgroundColor: COLORS.purple, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  activeBannerTitle: { color: '#fff', fontWeight: '600', fontSize: 15 },
  activeBannerSub:   { color: '#CECBF6', fontSize: 13, marginTop: 3 },
  sectionTitle:      { fontSize: 13, fontWeight: '600', color: COLORS.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .5 },
  courseCard:        { backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: .5, borderColor: COLORS.border, marginBottom: 20 },
  courseLeft:        { flexDirection: 'row', alignItems: 'center', gap: 14 },
  courseIcon:        { fontSize: 32 },
  courseLabel:       { fontSize: 15, fontWeight: '600', color: COLORS.text },
  courseDesc:        { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  grid:              { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  serviceCard:       { width: '47%', borderRadius: 14, padding: 16 },
  serviceIcon:       { fontSize: 28, marginBottom: 8 },
  serviceLabel:      { fontSize: 14, fontWeight: '600' },
  serviceDesc2:      { fontSize: 12, marginTop: 2 },

  supportCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: .5,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  supportIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.purpleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  supportSub:   { fontSize: 12, color: COLORS.muted },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  liveDot:  { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 12, fontWeight: '700' },
});
