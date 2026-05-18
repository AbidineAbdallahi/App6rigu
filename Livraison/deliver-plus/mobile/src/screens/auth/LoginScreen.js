import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS } from '../../constants';

export default function LoginScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;

  const submit = async () => {
    const role = await login(email, password);
    // Navigation gérée par App.js via le changement de state
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoText}>D+</Text></View>
          <Text style={styles.title}>Deliver+</Text>
          <Text style={styles.subtitle}>Connexion à votre compte</Text>
        </View>

        <View style={styles.form}>
          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{t[error] || error}</Text></View>}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              placeholder="votre@email.com" keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              placeholder="••••••••" secureTextEntry />
          </View>

          <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Se connecter</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkBtn}>
            <Text style={styles.linkText}>Pas de compte ? <Text style={{ color: COLORS.purple }}>S'inscrire</Text></Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex:1, backgroundColor: COLORS.bg },
  container: { flex:1, justifyContent:'center', padding:24 },
  header:    { alignItems:'center', marginBottom:40 },
  logo:      { width:60, height:60, borderRadius:16, backgroundColor: COLORS.purple, alignItems:'center', justifyContent:'center', marginBottom:12 },
  logoText:  { color:'#fff', fontSize:22, fontWeight:'700' },
  title:     { fontSize:24, fontWeight:'600', color: COLORS.text },
  subtitle:  { fontSize:14, color: COLORS.muted, marginTop:4 },
  form:      { backgroundColor:'#fff', borderRadius:16, padding:20, borderWidth:.5, borderColor: COLORS.border },
  inputGroup:{ marginBottom:14 },
  label:     { fontSize:12, color: COLORS.muted, marginBottom:5 },
  input:     { borderWidth:.5, borderColor: COLORS.border, borderRadius:10, padding:12, fontSize:14, backgroundColor: COLORS.bg },
  errorBox:  { backgroundColor: COLORS.redLight, borderRadius:8, padding:10, marginBottom:12 },
  errorText: { color: COLORS.red, fontSize:13 },
  btn:       { backgroundColor: COLORS.purple, borderRadius:12, padding:14, alignItems:'center', marginTop:4 },
  btnText:   { color:'#fff', fontWeight:'600', fontSize:15 },
  linkBtn:   { alignItems:'center', marginTop:16 },
  linkText:  { fontSize:13, color: COLORS.muted },
});
