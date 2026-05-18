import { useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  Modal, TouchableOpacity, ActivityIndicator, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import useColors from '../../hooks/useColors';
import { translations } from '../../i18n';
import { COLORS, SERVICE_ICONS, WHATSAPP_RECHARGE } from '../../constants';

export default function DriverEarningsScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { driverProfile, user } = useAuthStore();
  const { lang } = useLangStore();
  const t   = translations[lang];
  const isAr = lang === 'ar';
  const rtl  = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  const [orders,     setOrders]     = useState([]);
  const [stats,      setStats]      = useState({ total: 0, count: 0, rating: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const [historyModal, setHistoryModal] = useState(false);
  const [history,      setHistory]      = useState([]);
  const [loadingHist,  setLoadingHist]  = useState(false);

  const load = async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.get('/orders?status=livre&limit=50'),
        driverProfile?._id
          ? api.get(`/drivers/${driverProfile._id}/stats`).catch(() => ({ data: {} }))
          : Promise.resolve({ data: {} }),
      ]);
      setOrders(ordersRes.data.orders || []);
      const s = statsRes.data.stats;
      if (s) setStats({ total: s.totalEarnings || 0, count: s.totalOrders || 0, rating: s.averageRating || 0 });
    } catch {} finally { setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const openWhatsApp = () => {
    const phone   = user?.phone || '';
    const message = encodeURIComponent(`${t.recharge_whatsapp_msg} ${phone}`);
    const url     = `https://wa.me/${WHATSAPP_RECHARGE}?text=${message}`;
    Linking.canOpenURL(url).then(ok => {
      if (ok) Linking.openURL(url);
      else Alert.alert('', 'WhatsApp non installé sur cet appareil.');
    });
  };

  const openHistory = async () => {
    setHistoryModal(true);
    setLoadingHist(true);
    try {
      const soldeRes = await api.get(`/admin/drivers/${driverProfile._id}/solde`).catch(() => null);
      setHistory(soldeRes?.data?.transactions?.slice(-20).reverse() || []);
    } catch {} finally { setLoadingHist(false); }
  };

  const renderItem = ({ item: o }) => (
    <View style={styles.item}>
      <View style={styles.itemLeft}>
        <View style={styles.itemIconWrap}>
          <Text style={{ fontSize: 18 }}>{SERVICE_ICONS[o.serviceType] || '🚖'}</Text>
        </View>
        <View>
          <Text style={[styles.itemTitle, rtl]}>
            {o.orderType === 'course' ? t.order_ride : t.order_cmd} #{o._id.slice(-6).toUpperCase()}
          </Text>
          <Text style={[styles.itemDate, rtl]}>
            {new Date(o.updatedAt).toLocaleDateString(isAr ? 'ar' : 'fr-FR', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.itemEarning}>+{o.pricing?.driverEarning || o.pricing?.deliveryFee || 0} MRU</Text>
        {o.rating?.score && (
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>{o.rating.score} ★</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── HERO SOLDE ──────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroBubble1} />
        <View style={styles.heroBubble2} />

        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>{t.home_solde}</Text>
            <Text style={styles.heroValue}>{driverProfile?.solde ?? 0} <Text style={styles.heroCurrency}>MRU</Text></Text>
          </View>
          <View style={styles.heroBtns}>
            <TouchableOpacity style={styles.whatsappBtn} onPress={openWhatsApp}>
              <Text style={styles.whatsappBtnTxt}>💬 {t.recharge_btn}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.historyBtn} onPress={openHistory}>
              <Text style={styles.historyBtnTxt}>📋 {t.recharge_history}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Mini stats en ligne */}
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.total.toLocaleString()}</Text>
            <Text style={styles.heroStatLabel}>{t.earn_total}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.count}</Text>
            <Text style={styles.heroStatLabel}>{t.earn_count}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={[styles.heroStatValue, { color: '#FFD770' }]}>
              {stats.rating ? stats.rating.toFixed(1) + ' ★' : '—'}
            </Text>
            <Text style={styles.heroStatLabel}>{t.earn_rating}</Text>
          </View>
        </View>
      </View>

      {/* ── HISTORIQUE LIVRAISONS ───────────────────────── */}
      <FlatList
        data={orders}
        keyExtractor={o => o._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingTop: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.purple]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>📭</Text>
            <Text style={{ color: C.muted, fontSize: 14, fontWeight: '500' }}>{t.earn_empty}</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={[styles.sectionLabel, rtl]}>{t.earn_history}</Text>
        }
      />

      {/* ── MODAL HISTORIQUE TRANSACTIONS ───────────────── */}
      <Modal visible={historyModal} animationType="slide" transparent onRequestClose={() => setHistoryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t.recharge_history}</Text>

            {loadingHist ? (
              <ActivityIndicator color={COLORS.purple} style={{ marginVertical: 24 }} />
            ) : history.length === 0 ? (
              <Text style={{ color: C.muted, textAlign: 'center', marginVertical: 24 }}>{t.recharge_empty}</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item: tx }) => (
                  <View style={styles.txItem}>
                    <View style={[styles.txDot, { backgroundColor: tx.type === 'credit' ? COLORS.green : COLORS.red }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txMotif}>{tx.motif || (tx.type === 'credit' ? t.recharge_credit : t.recharge_debit)}</Text>
                      <Text style={styles.txDate}>
                        {new Date(tx.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={[styles.txAmount, { color: tx.type === 'credit' ? COLORS.green : COLORS.red }]}>
                      {tx.type === 'credit' ? '+' : '−'}{tx.montant} MRU
                    </Text>
                  </View>
                )}
                style={{ maxHeight: 380 }}
              />
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setHistoryModal(false)}>
              <Text style={styles.closeBtnTxt}>{t.modal_close}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F2FA' },

  /* Hero */
  heroCard:    { backgroundColor: COLORS.purple, marginHorizontal: 16, marginTop: 12, marginBottom: 16, borderRadius: 24, padding: 20, overflow: 'hidden' },
  heroBubble1: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30 },
  heroBubble2: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: 30 },
  heroTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  heroValue:   { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  heroCurrency:{ fontSize: 18, fontWeight: '600' },
  heroBtns:    { gap: 8, alignItems: 'flex-end' },
  whatsappBtn:    { backgroundColor: '#25D366', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  whatsappBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },
  historyBtn:     { paddingVertical: 2 },
  historyBtnTxt:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },

  heroStats:       { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12 },
  heroStat:        { flex: 1, alignItems: 'center' },
  heroStatValue:   { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroStatLabel:   { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },

  /* Section */
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  /* List items */
  item:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, shadowColor: COLORS.purple, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  itemLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  itemIconWrap:{ width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center' },
  itemTitle:   { fontSize: 13, fontWeight: '700', color: C.text },
  itemDate:    { fontSize: 11, color: C.muted, marginTop: 2 },
  itemEarning: { fontSize: 15, fontWeight: '800', color: COLORS.green },
  ratingBadge: { backgroundColor: '#FFF3CD', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
  ratingText:  { fontSize: 11, color: '#B45309', fontWeight: '700' },

  /* Empty */
  emptyState: { alignItems: 'center', paddingTop: 48 },

  /* Modal */
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet:   { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 12 },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  modalTitle:   { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 16, textAlign: 'center' },

  txItem:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: C.border },
  txDot:    { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  txMotif:  { fontSize: 13, fontWeight: '600', color: C.text },
  txDate:   { fontSize: 11, color: C.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '800' },

  closeBtn:    { alignItems: 'center', marginTop: 16, padding: 10 },
  closeBtnTxt: { color: C.muted, fontSize: 13, fontWeight: '500' },
});
