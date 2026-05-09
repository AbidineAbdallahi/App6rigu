import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, COLORS } from './src/constants';
import useAuthStore from './src/stores/authStore';
import DriverTabs from './src/navigation/DriverTabs';
import DriverRegisterScreen from './src/screens/auth/DriverRegisterScreen';

// ─── Logo Amder ───────────────────────────────────────────────────────────────
function AmderLogo({ size = 90 }) {
  const r  = Math.round(size * 0.22);
  const lw = Math.round(size * 0.115);
  const lh = Math.round(size * 0.70);
  const ang = 20;
  return (
    <View style={{ width:size, height:size, borderRadius:r, backgroundColor:'#3B328F', overflow:'hidden', alignItems:'center', justifyContent:'center' }}>
      <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', left:size*0.14, top:size*0.1, transform:[{rotate:`${ang}deg`}] }}/>
      <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', right:size*0.14, top:size*0.1, transform:[{rotate:`${-ang}deg`}] }}/>
      <View style={{ position:'absolute', top:size*0.53, flexDirection:'row', alignItems:'center', left:size*0.17 }}>
        <View style={{ width:size*0.40, height:size*0.09, backgroundColor:'#F59E0B', borderRadius:3 }}/>
        <View style={{ width:0, height:0, borderTopWidth:size*0.065, borderBottomWidth:size*0.065, borderLeftWidth:size*0.09, borderTopColor:'transparent', borderBottomColor:'transparent', borderLeftColor:'#F59E0B' }}/>
      </View>
    </View>
  );
}

// ─── Écran dossier en attente ─────────────────────────────────────────────────
function PendingScreen({ onBack }) {
  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <AmderLogo size={80} />
        <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
          <Text style={{ fontSize:48, marginBottom:16 }}>⏳</Text>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', textAlign:'center', marginBottom:10 }}>
            Dossier en cours de vérification
          </Text>
          <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:28 }}>
            Votre dossier a bien été reçu. Notre équipe va vérifier vos documents et informations.{'\n\n'}
            Vous recevrez une notification dès que votre compte sera activé.
          </Text>
          <View style={{ backgroundColor:'#FFF8E7', borderRadius:14, padding:16, borderWidth:1, borderColor:'#F59E0B', width:'100%', marginBottom:24 }}>
            <Text style={{ fontSize:13, color:'#92400E', fontWeight:'600', marginBottom:4 }}>Documents soumis :</Text>
            {['Photo personnelle','Photo véhicule','Carte grise','Carte d\'identité','Assurance'].map(d => (
              <Text key={d} style={{ fontSize:13, color:'#92400E', marginTop:4 }}>· {d}</Text>
            ))}
          </View>
          <TouchableOpacity onPress={onBack}
            style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>← Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Écran compléter le dossier ──────────────────────────────────────────────
const DOCS_META = [
  { key:'photoPersonnelle', label:'Photo personnelle',  icon:'🤳' },
  { key:'photoVehicule',    label:'Photo du véhicule',  icon:'📸' },
  { key:'carteGrise',       label:'Carte grise',        icon:'📄' },
  { key:'carteIdentite',    label:"Carte d'identité",   icon:'🪪' },
  { key:'assurance',        label:'Assurance',          icon:'🛡️' },
];

function CompleteDocsScreen({ missingDocuments = [], missingInfoNote, onDone, onLogout }) {
  const { token } = useAuthStore();
  const [photos, setPhotos]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const pickImage = (key) => {
    Alert.alert(DOCS_META.find(d => d.key === key)?.label || 'Document', 'Choisir depuis...', [
      {
        text: '📷 Appareil photo',
        onPress: async () => {
          try {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (!cam.granted) { Alert.alert('Permission refusée', 'Autorisez l\'accès à l\'appareil photo dans les paramètres.'); return; }
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
            if (!r.canceled) setPhotos(p => ({ ...p, [key]: r.assets[0] }));
          } catch (e) { Alert.alert('Erreur', e.message); }
        },
      },
      {
        text: '🖼️ Galerie',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission refusée', 'Autorisez l\'accès à la galerie dans les paramètres.'); return; }
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
            if (!r.canceled) setPhotos(p => ({ ...p, [key]: r.assets[0] }));
          } catch (e) { Alert.alert('Erreur', e.message); }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const submit = async () => {
    const allUploaded = missingDocuments.every(k => photos[k]);
    if (!allUploaded) {
      Alert.alert('Documents manquants', 'Veuillez ajouter tous les documents demandés.');
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      missingDocuments.forEach(key => {
        const asset = photos[key];
        if (asset?.uri) {
          fd.append(key, { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: `${key}.jpg` });
        }
      });

      const res = await fetch(`${API_URL}/auth/complete-dossier`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { Alert.alert('Erreur', data?.message || `Erreur serveur (${res.status})`); return; }
      setSubmitted(true);
    } catch {
      Alert.alert('Erreur réseau', 'Impossible de joindre le serveur.');
    } finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <SafeAreaView style={st.safe}>
        <ScrollView contentContainerStyle={st.center}>
          <AmderLogo size={80} />
          <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
            <Text style={{ fontSize:48, marginBottom:16 }}>✅</Text>
            <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', textAlign:'center', marginBottom:10 }}>Dossier mis à jour !</Text>
            <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:24 }}>
              Vos documents ont été envoyés à l'administrateur. Vous serez notifié dès validation.
            </Text>
            <TouchableOpacity onPress={onLogout}
              style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
              <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>← Retour à la connexion</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const requestedDocs = DOCS_META.filter(d => missingDocuments.includes(d.key));

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={[st.center, { paddingTop:16 }]}>
        <AmderLogo size={70} />
        <View style={{ marginTop:20, width:'100%', padding:24 }}>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', marginBottom:8 }}>Compléter votre dossier</Text>

          <View style={{ backgroundColor:'#E6F1FB', borderRadius:12, padding:14, marginBottom:20, borderWidth:1, borderColor:'#9BC4EC' }}>
            <Text style={{ fontSize:13, color:'#185FA5', fontWeight:'700', marginBottom:4 }}>Documents demandés par l'administrateur :</Text>
            {requestedDocs.map(d => (
              <Text key={d.key} style={{ fontSize:13, color:'#185FA5', marginTop:3 }}>{d.icon} {d.label}</Text>
            ))}
            {missingInfoNote ? (
              <Text style={{ fontSize:12, color:'#185FA5', marginTop:8, fontStyle:'italic' }}>"{missingInfoNote}"</Text>
            ) : null}
          </View>

          {requestedDocs.map(doc => (
            <View key={doc.key} style={{ borderWidth:.5, borderColor:'rgba(0,0,0,0.09)', borderRadius:12, padding:12, marginBottom:10, backgroundColor:'#fff' }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 }}>
                <Text style={{ fontSize:24 }}>{doc.icon}</Text>
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:13, fontWeight:'600', color:'#1a1a18' }}>{doc.label}</Text>
                  <Text style={{ fontSize:11, color: photos[doc.key] ? '#3B6D11' : '#A32D2D', marginTop:2 }}>
                    {photos[doc.key] ? '✅ Ajouté' : '⚠️ Requis'}
                  </Text>
                </View>
              </View>
              {photos[doc.key] ? (
                <View style={{ alignItems:'center', gap:6 }}>
                  <Image source={{ uri: photos[doc.key].uri }} style={{ width:'100%', height:100, borderRadius:8, resizeMode:'cover' }} />
                  <TouchableOpacity onPress={() => pickImage(doc.key)}
                    style={{ borderWidth:1, borderColor:COLORS.purple, borderRadius:8, paddingHorizontal:14, paddingVertical:6 }}>
                    <Text style={{ color:COLORS.purple, fontSize:12, fontWeight:'600' }}>Changer</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => pickImage(doc.key)}
                  style={{ borderWidth:1.5, borderColor:COLORS.purple, borderRadius:10, padding:12, alignItems:'center', borderStyle:'dashed' }}>
                  <Text style={{ color:COLORS.purple, fontWeight:'600', fontSize:13 }}>📁 Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={[st.btn, { marginTop:12 }, loading && { opacity:.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>✅ Envoyer les documents</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={{ marginTop:14, alignItems:'center' }}>
            <Text style={{ fontSize:13, color:COLORS.muted }}>Se déconnecter</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Écran dossier refusé ─────────────────────────────────────────────────────
function RejectedScreen({ message, onBack }) {
  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <AmderLogo size={80} />
        <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
          <Text style={{ fontSize:48, marginBottom:16 }}>❌</Text>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#A32D2D', textAlign:'center', marginBottom:10 }}>
            Dossier refusé
          </Text>
          <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:20 }}>
            {message || 'Votre dossier a été refusé par l\'administrateur.'}
          </Text>
          <View style={{ backgroundColor:'#FDF0F0', borderRadius:14, padding:16, borderWidth:1, borderColor:'#F5C0C0', width:'100%', marginBottom:24 }}>
            <Text style={{ fontSize:13, color:'#A32D2D', lineHeight:20 }}>
              Pour toute question, contactez notre support ou soumettez un nouveau dossier avec des documents valides.
            </Text>
          </View>
          <TouchableOpacity onPress={onBack}
            style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>← Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Connexion Livreur ────────────────────────────────────────────────────────
function DriverLoginScreen({ onRegister }) {
  const { login, loading, error, approvalStatus, missingDocuments, missingInfoNote, clearError, logout } = useAuthStore();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    const role = await login(email.trim().toLowerCase(), password);
    if (role && role !== 'driver' && role !== 'incomplet') useAuthStore.getState().logout();
  };

  if (approvalStatus === 'en_attente') {
    return <PendingScreen onBack={clearError} />;
  }

  if (approvalStatus === 'rejete') {
    return <RejectedScreen message={error} onBack={clearError} />;
  }

  if (approvalStatus === 'incomplet') {
    return (
      <CompleteDocsScreen
        missingDocuments={missingDocuments}
        missingInfoNote={missingInfoNote}
        onDone={clearError}
        onLogout={logout}
      />
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <AmderLogo size={100} />
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

        {/* Lien vers l'inscription */}
        <TouchableOpacity onPress={onRegister} style={st.registerLink}>
          <Text style={st.registerTxt}>
            Pas encore livreur ?{' '}
            <Text style={{ color: COLORS.purple, fontWeight:'700' }}>Créer mon compte</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { token, initialized, init, approvalStatus, missingDocuments, missingInfoNote, logout } = useAuthStore();
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => { init(); }, []);

  if (!initialized) {
    return (
      <SafeAreaProvider>
        <View style={{ flex:1, backgroundColor:'#3B328F', alignItems:'center', justifyContent:'center' }}>
          <AmderLogo size={90} />
          <Text style={{ color:'#fff', fontSize:22, fontWeight:'800', marginTop:18 }}>Amder</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!token) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        {showRegister
          ? <DriverRegisterScreen onBack={() => setShowRegister(false)} />
          : <DriverLoginScreen onRegister={() => setShowRegister(true)} />
        }
      </SafeAreaProvider>
    );
  }

  // Livreur connecté mais dossier incomplet → écran de complétion (pas DriverTabs)
  if (approvalStatus === 'incomplet') {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <CompleteDocsScreen
          missingDocuments={missingDocuments}
          missingInfoNote={missingInfoNote}
          onDone={() => logout()}
          onLogout={() => logout()}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <DriverTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  safe:   { flex:1, backgroundColor: COLORS.bg },
  center: { flexGrow:1, justifyContent:'center', padding:24 },
  title:  { fontSize:28, fontWeight:'900', color: COLORS.text, textAlign:'center', marginTop:16, marginBottom:4 },
  sub:    { fontSize:13, color: COLORS.muted, textAlign:'center', marginBottom:28 },
  card:   { backgroundColor:'#fff', borderRadius:16, padding:20, borderWidth:.5, borderColor: COLORS.border },
  lbl:    { fontSize:12, color: COLORS.muted, marginBottom:5 },
  inp:    { borderWidth:.5, borderColor: COLORS.border, borderRadius:10, padding:12, fontSize:14, backgroundColor: COLORS.bg, marginBottom:14, color: COLORS.text },
  btn:    { backgroundColor: COLORS.purple, borderRadius:12, padding:14, alignItems:'center' },
  btnTxt: { color:'#fff', fontWeight:'700', fontSize:15 },
  errBox:       { backgroundColor: COLORS.redLight, borderRadius:8, padding:10, marginBottom:12 },
  errTxt:       { color: COLORS.red, fontSize:13 },
  registerLink: { marginTop:20, alignItems:'center' },
  registerTxt:  { fontSize:14, color: COLORS.muted },
});
