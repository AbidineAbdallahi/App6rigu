import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import { COLORS, SERVICE_ICONS } from '../../constants';

export default function DriverEarningsScreen() {
  const { driverProfile } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ total: 0, count: 0, rating: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.get('/orders?status=livre&limit=50'),
        driverProfile?._id ? api.get(`/drivers/${driverProfile._id}/stats`).catch(() => ({ data: {} })) : Promise.resolve({ data: {} }),
      ]);
      setOrders(ordersRes.data.orders || []);
      const s = statsRes.data.stats;
      if (s) setStats({ total: s.totalEarnings || 0, count: s.totalOrders || 0, rating: s.averageRating || 0 });
    } catch {} finally { setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  const renderItem = ({ item: o }) => (
    <View style={styles.item}>
      <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
        <Text style={{ fontSize:20 }}>{SERVICE_ICONS[o.serviceType]}</Text>
        <View>
          <Text style={styles.itemTitle}>Cmd #{o._id.slice(-6).toUpperCase()}</Text>
          <Text style={styles.itemDate}>{new Date(o.updatedAt).toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</Text>
        </View>
      </View>
      <View style={{ alignItems:'flex-end' }}>
        <Text style={styles.itemEarning}>+{o.pricing?.deliveryFee || 0} MRU</Text>
        {o.rating?.score && <Text style={{ fontSize:11, color:'#854F0B' }}>{o.rating.score} ★</Text>}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.title}>Mes revenus</Text></View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total MRU</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.count}</Text>
          <Text style={styles.statLabel}>Livraisons</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color:'#854F0B' }]}>{stats.rating ? stats.rating.toFixed(1) : '—'}</Text>
          <Text style={styles.statLabel}>Note ★</Text>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={o => o._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding:16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[COLORS.purple]}/>}
        ListEmptyComponent={<View style={{ alignItems:'center', paddingTop:40 }}><Text style={{ color: COLORS.muted }}>Aucune livraison effectuée</Text></View>}
        ListHeaderComponent={<Text style={styles.sectionLabel}>Historique des livraisons</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex:1, backgroundColor: COLORS.bg },
  header:     { padding:20, paddingBottom:8 },
  title:      { fontSize:20, fontWeight:'600', color: COLORS.text },
  statsRow:   { flexDirection:'row', gap:10, padding:16, paddingTop:8, paddingBottom:8 },
  statCard:   { flex:1, backgroundColor:'#fff', borderRadius:12, padding:12, alignItems:'center', borderWidth:.5, borderColor: COLORS.border },
  statValue:  { fontSize:20, fontWeight:'700', color: COLORS.text },
  statLabel:  { fontSize:11, color: COLORS.muted, marginTop:2 },
  sectionLabel:{ fontSize:14, fontWeight:'500', color: COLORS.muted, marginBottom:10 },
  item:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#fff', borderRadius:12, padding:14, marginBottom:8, borderWidth:.5, borderColor: COLORS.border },
  itemTitle:  { fontSize:13, fontWeight:'600', color: COLORS.text },
  itemDate:   { fontSize:11, color: COLORS.muted, marginTop:2 },
  itemEarning:{ fontSize:14, fontWeight:'700', color: COLORS.green },
});
