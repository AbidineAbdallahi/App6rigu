import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import { COLORS } from '../../constants';

export default function RegisterScreen({ navigation }) {
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', password:'' });
  const { register, loading, error } = useAuthStore();
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding:24, flexGrow:1, justifyContent:'center' }}>
        <View style={{ alignItems:'center', marginBottom:32 }}>
          <View style={styles.logo}><Text style={styles.logoText}>D+</Text></View>
          <Text style={styles.title}>Créer un compte</Text>
        </View>

        <View style={styles.card}>
          {error && <View style={styles.err}><Text style={{ color: COLORS.red, fontSize:13 }}>{error}</Text></View>}

          {[
            { key:'firstName', label:'Prénom',          placeholder:'Khalil',          keyboard:'default' },
            { key:'lastName',  label:'Nom',             placeholder:'Diallo',          keyboard:'default' },
            { key:'email',     label:'Email',           placeholder:'khalil@email.com',keyboard:'email-address' },
            { key:'phone',     label:'Téléphone',       placeholder:'+222 36 00 00 00',keyboard:'phone-pad' },
            { key:'password',  label:'Mot de passe',    placeholder:'••••••••',        secure:true },
          ].map(f => (
            <View key={f.key} style={styles.group}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput style={styles.input} value={form[f.key]} onChangeText={v => set(f.key, v)}
                placeholder={f.placeholder} keyboardType={f.keyboard || 'default'}
                secureTextEntry={f.secure} autoCapitalize={f.keyboard==='email-address'?'none':'words'} />
            </View>
          ))}

          <TouchableOpacity style={styles.btn} onPress={() => register(form)} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>S'inscrire</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ alignItems:'center', marginTop:14 }}>
            <Text style={{ fontSize:13, color: COLORS.muted }}>Déjà un compte ? <Text style={{ color: COLORS.purple }}>Se connecter</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  logo:    { width:54, height:54, borderRadius:14, backgroundColor: COLORS.purple, alignItems:'center', justifyContent:'center', marginBottom:10 },
  logoText:{ color:'#fff', fontSize:20, fontWeight:'700' },
  title:   { fontSize:22, fontWeight:'600', color: COLORS.text },
  card:    { backgroundColor:'#fff', borderRadius:16, padding:20, borderWidth:.5, borderColor: COLORS.border },
  err:     { backgroundColor: COLORS.redLight, borderRadius:8, padding:10, marginBottom:12 },
  group:   { marginBottom:12 },
  label:   { fontSize:12, color: COLORS.muted, marginBottom:4 },
  input:   { borderWidth:.5, borderColor: COLORS.border, borderRadius:10, padding:11, fontSize:14, backgroundColor: COLORS.bg },
  btn:     { backgroundColor: COLORS.purple, borderRadius:12, padding:14, alignItems:'center', marginTop:6 },
  btnText: { color:'#fff', fontWeight:'600', fontSize:15 },
});
