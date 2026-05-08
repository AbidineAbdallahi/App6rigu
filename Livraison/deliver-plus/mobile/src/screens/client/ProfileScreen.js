import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import { COLORS } from '../../constants';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const rows = [
    { label:'Prénom',    value: user?.firstName },
    { label:'Nom',       value: user?.lastName },
    { label:'Email',     value: user?.email },
    { label:'Téléphone', value: user?.phone },
    { label:'Rôle',      value: user?.role === 'driver' ? 'Livreur' : 'Client' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
          </View>
          <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length-1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value || '—'}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex:1, backgroundColor: COLORS.bg },
  scroll:     { padding:20 },
  header:     { alignItems:'center', marginBottom:24 },
  avatar:     { width:72, height:72, borderRadius:36, backgroundColor: COLORS.purpleLight, alignItems:'center', justifyContent:'center', marginBottom:12 },
  avatarText: { fontSize:24, fontWeight:'700', color: COLORS.purple },
  name:       { fontSize:20, fontWeight:'600', color: COLORS.text },
  email:      { fontSize:13, color: COLORS.muted, marginTop:4 },
  card:       { backgroundColor:'#fff', borderRadius:14, borderWidth:.5, borderColor: COLORS.border, marginBottom:16 },
  row:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:14 },
  rowBorder:  { borderBottomWidth:.5, borderBottomColor: COLORS.border },
  rowLabel:   { fontSize:13, color: COLORS.muted },
  rowValue:   { fontSize:13, fontWeight:'500', color: COLORS.text },
  logoutBtn:  { backgroundColor:'#fff', borderRadius:14, padding:14, alignItems:'center', borderWidth:.5, borderColor:'#F09595' },
  logoutText: { fontSize:14, fontWeight:'600', color: COLORS.red },
});
