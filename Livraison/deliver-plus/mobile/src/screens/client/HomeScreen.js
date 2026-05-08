import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import api from '../../services/api';
import { COLORS, SERVICE_ICONS, SERVICE_COLORS } from '../../constants';

const SERVICES = [
  { key:'nourriture', label:'Nourriture',   desc:'Restaurants & fast-food' },
  { key:'courses',    label:'Courses',      desc:'Supermarché & épicerie' },
  { key:'colis',      label:'Colis express',desc:'Livraison de colis' },
  { key:'pharmacie',  label:'Pharmacie',    desc:'Médicaments & santé' },
];

export default function HomeScreen({ navigation }) {
  const { user } = useAuthStore();
  const [activeOrder, setActiveOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/orders?status=en_route&limit=1').then(r => {
      const orders = r.data.orders || [];
      setActiveOrder(orders[0] || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const startOrder = (service) => {
    navigation.navigate('NewOrder', { serviceType: service });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour, {user?.firstName} 👋</Text>
            <Text style={styles.subgreeting}>Que livrons-nous aujourd'hui ?</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={{ color: COLORS.purple, fontWeight:'600' }}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </Text>
          </View>
        </View>

        {/* Active order banner */}
        {!loading && activeOrder && (
          <TouchableOpacity style={styles.activeBanner} onPress={() => navigation.navigate('OrderTrack', { orderId: activeOrder._id })}>
            <View>
              <Text style={styles.activeBannerTitle}>Commande en cours</Text>
              <Text style={styles.activeBannerSub}>{SERVICE_ICONS[activeOrder.serviceType]} En route vers vous</Text>
            </View>
            <Text style={{ color:'#CECBF6', fontSize:20 }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Services grid */}
        <Text style={styles.sectionTitle}>Nos services</Text>
        <View style={styles.grid}>
          {SERVICES.map(s => {
            const c = SERVICE_COLORS[s.key];
            return (
              <TouchableOpacity key={s.key} style={[styles.serviceCard, { backgroundColor: c.bg }]} onPress={() => startOrder(s.key)}>
                <Text style={styles.serviceIcon}>{SERVICE_ICONS[s.key]}</Text>
                <Text style={[styles.serviceLabel, { color: c.text }]}>{s.label}</Text>
                <Text style={[styles.serviceDesc, { color: c.text, opacity:.7 }]}>{s.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>Comment ça marche</Text>
        <View style={styles.card}>
          {[
            { step:'1', label:'Choisissez un service', desc:'Nourriture, courses, colis ou pharmacie' },
            { step:'2', label:'Passez votre commande', desc:'Sélectionnez vos articles et adresse' },
            { step:'3', label:'Suivi en temps réel',   desc:'Suivez votre livreur sur la carte' },
          ].map(item => (
            <View key={item.step} style={styles.howRow}>
              <View style={styles.stepNum}><Text style={{ color: COLORS.purple, fontWeight:'700', fontSize:13 }}>{item.step}</Text></View>
              <View style={{ flex:1 }}>
                <Text style={styles.stepLabel}>{item.label}</Text>
                <Text style={styles.stepDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex:1, backgroundColor: COLORS.bg },
  scroll:     { padding:20 },
  header:     { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  greeting:   { fontSize:22, fontWeight:'600', color: COLORS.text },
  subgreeting:{ fontSize:14, color: COLORS.muted, marginTop:2 },
  avatar:     { width:42, height:42, borderRadius:21, backgroundColor: COLORS.purpleLight, alignItems:'center', justifyContent:'center' },
  activeBanner:{ backgroundColor: COLORS.purple, borderRadius:14, padding:16, flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  activeBannerTitle:{ color:'#fff', fontWeight:'600', fontSize:15 },
  activeBannerSub:  { color:'#CECBF6', fontSize:13, marginTop:3 },
  sectionTitle:{ fontSize:16, fontWeight:'600', color: COLORS.text, marginBottom:12 },
  grid:       { flexDirection:'row', flexWrap:'wrap', gap:12, marginBottom:24 },
  serviceCard:{ width:'47%', borderRadius:14, padding:16 },
  serviceIcon:{ fontSize:28, marginBottom:8 },
  serviceLabel:{ fontSize:14, fontWeight:'600' },
  serviceDesc: { fontSize:12, marginTop:2 },
  card:       { backgroundColor:'#fff', borderRadius:14, padding:16, borderWidth:.5, borderColor: COLORS.border, marginBottom:24 },
  howRow:     { flexDirection:'row', alignItems:'flex-start', gap:12, marginBottom:14 },
  stepNum:    { width:28, height:28, borderRadius:14, backgroundColor: COLORS.purpleLight, alignItems:'center', justifyContent:'center' },
  stepLabel:  { fontSize:13, fontWeight:'600', color: COLORS.text },
  stepDesc:   { fontSize:12, color: COLORS.muted, marginTop:2 },
});
