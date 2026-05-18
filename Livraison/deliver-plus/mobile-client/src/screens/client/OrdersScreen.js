import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SERVICE_ICONS } from '../../constants';

const STATUS_STYLE = {
  en_attente:     { bg: '#FAEEDA', color: '#633806' },
  diffuse:        { bg: '#FEF3CD', color: '#7B5300' },
  accepte:        { bg: '#EEEDFE', color: '#3C3489' },
  en_preparation: { bg: '#E6F1FB', color: '#0C447C' },
  en_route:       { bg: '#EEEDFE', color: '#3C3489' },
  livre:          { bg: '#EAF3DE', color: '#27500A' },
  annule:         { bg: '#FCEBEB', color: '#791F1F' },
};

const ACTIVE_STATUSES = ['en_attente', 'diffuse', 'accepte', 'en_preparation', 'en_route'];

export default function OrdersScreen({ navigation }) {
  const { lang } = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const rtl = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  const STATUS_LABELS = {
    en_attente: t.s_en_attente, diffuse: t.s_diffuse, accepte: t.s_accepte,
    en_preparation: t.s_en_preparation, en_route: t.s_en_route,
    livre: t.s_livre, annule: t.s_annule,
  };

  const [orders, setOrders]         = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/orders?limit=30');
      setOrders(data.orders || []);
    } catch {}
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderOrder = ({ item: o }) => {
    const s = STATUS_STYLE[o.status] || STATUS_STYLE.en_attente;
    const canTrack = ACTIVE_STATUSES.includes(o.status);
    const icon = o.orderType === 'course' ? '🚖' : (SERVICE_ICONS[o.serviceType] || '📦');
    return (
      <TouchableOpacity
        style={styles.item}
        onPress={canTrack ? () => navigation.navigate('OrderTrack', { orderId: o._id }) : undefined}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>{icon}</Text>
            <View>
              <Text style={[styles.itemTitle, rtl]}>
                {t.orders_cmd} #{o._id.slice(-6).toUpperCase()}
              </Text>
              <Text style={[styles.itemSub, rtl]}>
                {new Date(o.createdAt).toLocaleDateString(isAr ? 'ar' : 'fr-FR')}
              </Text>
            </View>
          </View>
          <View style={[styles.badge, { backgroundColor: s.bg }]}>
            <Text style={[styles.badgeText, { color: s.color }]}>{STATUS_LABELS[o.status]}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={styles.itemTotal}>{o.pricing?.total?.toLocaleString()} MRU</Text>
          {canTrack && <Text style={{ fontSize: 12, color: COLORS.purple }}>{t.orders_track}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={[styles.title, rtl]}>{t.orders_title}</Text></View>
      <FlatList
        data={orders}
        keyExtractor={o => o._id}
        renderItem={renderOrder}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            colors={[COLORS.purple]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
            <Text style={{ color: COLORS.muted }}>{t.orders_empty}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  header:    { padding: 20, paddingBottom: 8 },
  title:     { fontSize: 20, fontWeight: '600', color: COLORS.text },
  item:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: .5, borderColor: COLORS.border },
  itemTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemSub:   { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  badge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '500' },
  empty:     { alignItems: 'center', paddingTop: 60 },
});
