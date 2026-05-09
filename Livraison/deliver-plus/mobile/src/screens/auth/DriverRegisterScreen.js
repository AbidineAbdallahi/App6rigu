import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, COLORS } from '../../constants';

const ZONES = ['Tevragh-Zeina','Ksar','Sebkha','El Mina','Dar Naim','Arafat','Toujounine','Riyad','Teyarett','Autre'];
const VEHICLES = [
  { value:'moto',    label:'🛵 Moto' },
  { value:'voiture', label:'🚗 Voiture' },
  { value:'velo',    label:'🚲 Vélo' },
  { value:'pied',    label:'🚶 À pied' },
];

const DOCS = [
  { key:'photoPersonnelle', label:'Photo personnelle',    icon:'🤳', required: true },
  { key:'photoVehicule',    label:'Photo du véhicule',    icon:'📸', required: true },
  { key:'carteGrise',       label:'Carte grise',          icon:'📄', required: true },
  { key:'carteIdentite',    label:"Carte d'identité",     icon:'🪪', required: true },
  { key:'assurance',        label:'Assurance',            icon:'🛡️', required: true },
];

function StepIndicator({ current, total }) {
  return (
    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', marginBottom:24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flexDirection:'row', alignItems:'center' }}>
          <View style={[s.dot, i < current && s.dotDone, i === current && s.dotActive]}>
            {i < current
              ? <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>✓</Text>
              : <Text style={{ color: i === current ? '#fff' : COLORS.muted, fontSize:11, fontWeight:'700' }}>{i+1}</Text>}
          </View>
          {i < total - 1 && (
            <View style={[s.line, i < current && s.lineDone]} />
          )}
        </View>
      ))}
    </View>
  );
}

export default function DriverRegisterScreen({ onBack }) {
  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm]     = useState({
    firstName:'', lastName:'', email:'', phone:'', password:'', confirmPassword:'',
    zone:'', vehicleType:'moto',
  });
  const [photos, setPhotos] = useState({
    photoPersonnelle: null, photoVehicule: null,
    carteGrise: null, carteIdentite: null, assurance: null,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Picker image ──────────────────────────────────────────────────────────
  const pickImage = (docKey) => {
    Alert.alert(
      DOCS.find(d => d.key === docKey)?.label || 'Document',
      'Choisir depuis...',
      [
        {
          text: '📷 Appareil photo',
          onPress: async () => {
            try {
              const cam = await ImagePicker.requestCameraPermissionsAsync();
              if (!cam.granted) { Alert.alert('Permission refusée', 'Autorisez l\'accès à l\'appareil photo dans les paramètres.'); return; }
              const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
              if (!result.canceled) setPhotos(p => ({ ...p, [docKey]: result.assets[0] }));
            } catch (e) { Alert.alert('Erreur', e.message); }
          },
        },
        {
          text: '🖼️ Galerie',
          onPress: async () => {
            try {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) { Alert.alert('Permission refusée', 'Autorisez l\'accès à la galerie dans les paramètres.'); return; }
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
              if (!result.canceled) setPhotos(p => ({ ...p, [docKey]: result.assets[0] }));
            } catch (e) { Alert.alert('Erreur', e.message); }
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  // ── Validations par étape ─────────────────────────────────────────────────
  const validateStep0 = () => {
    if (!form.firstName.trim() || !form.lastName.trim())
      return 'Prénom et nom obligatoires.';
    if (!form.phone.trim())
      return 'Numéro de téléphone obligatoire.';
    if (!form.password || form.password.length < 6)
      return 'Mot de passe : 6 caractères minimum.';
    if (form.password !== form.confirmPassword)
      return 'Les mots de passe ne correspondent pas.';
    return null;
  };

  const validateStep1 = () => {
    if (!form.zone) return 'Veuillez sélectionner une zone.';
    if (!form.vehicleType) return 'Veuillez sélectionner un type de véhicule.';
    return null;
  };

  const validateStep2 = () => {
    const missing = DOCS.filter(d => d.required && !photos[d.key]).map(d => d.label);
    if (missing.length) return `Documents manquants : ${missing.join(', ')}.`;
    return null;
  };

  const goNext = () => {
    let err = null;
    if (step === 0) err = validateStep0();
    if (step === 1) err = validateStep1();
    if (step === 2) err = validateStep2();
    if (err) { Alert.alert('Vérification', err); return; }
    setStep(s => s + 1);
  };

  // ── Soumettre l'inscription ───────────────────────────────────────────────
  const submit = async () => {
    const err = validateStep2();
    if (err) { Alert.alert('Vérification', err); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName',   form.firstName.trim());
      fd.append('lastName',    form.lastName.trim());
      fd.append('phone',       form.phone.trim());
      fd.append('password',    form.password);
      fd.append('zone',        form.zone);
      fd.append('vehicleType', form.vehicleType);
      if (form.email.trim()) fd.append('email', form.email.trim().toLowerCase());

      Object.entries(photos).forEach(([key, asset]) => {
        if (asset?.uri) {
          fd.append(key, {
            uri:  asset.uri,
            type: asset.mimeType || 'image/jpeg',
            name: `${key}.jpg`,
          });
        }
      });

      // fetch (pas axios) — React Native gère le boundary multipart automatiquement
      const res = await fetch(`${API_URL}/auth/register-driver`, {
        method: 'POST',
        body: fd,
      });

      let data = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        Alert.alert('Erreur inscription', data?.message || `Erreur serveur (${res.status})`);
        return;
      }
      setStep(3);
    } catch (e) {
      Alert.alert('Erreur réseau', `Impossible de joindre le serveur.\n${e?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          {step < 3 && (
            <TouchableOpacity onPress={step === 0 ? onBack : () => setStep(s => s - 1)} style={s.back}>
              <Text style={s.backTxt}>← Retour</Text>
            </TouchableOpacity>
          )}
          <Text style={s.title}>Inscription Livreur</Text>
          <Text style={s.subtitle}>
            {step === 0 ? 'Informations personnelles'
            : step === 1 ? 'Zone & Véhicule'
            : step === 2 ? 'Documents requis'
            : 'Inscription envoyée !'}
          </Text>
        </View>

        {step < 3 && <StepIndicator current={step} total={3} />}

        {/* ── ÉTAPE 0 : Infos personnelles ── */}
        {step === 0 && (
          <View style={s.card}>
            <Label>Prénom *</Label>
            <TextInput style={s.inp} value={form.firstName} onChangeText={v => set('firstName', v)}
              placeholder="Mohamed" autoCapitalize="words" />

            <Label>Nom *</Label>
            <TextInput style={s.inp} value={form.lastName} onChangeText={v => set('lastName', v)}
              placeholder="Ould Ahmed" autoCapitalize="words" />

            <Label>Téléphone *</Label>
            <TextInput style={s.inp} value={form.phone} onChangeText={v => set('phone', v)}
              placeholder="+222 36 00 00 00" keyboardType="phone-pad" />

            <Label>Email <Text style={{ color: COLORS.muted, fontSize:11 }}>(optionnel)</Text></Label>
            <TextInput style={s.inp} value={form.email} onChangeText={v => set('email', v)}
              placeholder="livreur@email.com" keyboardType="email-address" autoCapitalize="none" />

            <Label>Mot de passe *</Label>
            <TextInput style={s.inp} value={form.password} onChangeText={v => set('password', v)}
              placeholder="6 caractères minimum" secureTextEntry />

            <Label>Confirmer le mot de passe *</Label>
            <TextInput style={s.inp} value={form.confirmPassword} onChangeText={v => set('confirmPassword', v)}
              placeholder="Répéter le mot de passe" secureTextEntry />

            <TouchableOpacity style={s.btn} onPress={goNext}>
              <Text style={s.btnTxt}>Continuer →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 1 : Zone & Véhicule ── */}
        {step === 1 && (
          <View style={s.card}>
            <Label>Zone de livraison *</Label>
            <View style={s.grid}>
              {ZONES.map(z => (
                <TouchableOpacity key={z}
                  style={[s.chip, form.zone === z && s.chipActive]}
                  onPress={() => set('zone', z)}>
                  <Text style={[s.chipTxt, form.zone === z && s.chipTxtActive]}>{z}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label style={{ marginTop:20 }}>Type de véhicule *</Label>
            {VEHICLES.map(v => (
              <TouchableOpacity key={v.value}
                style={[s.vehicleRow, form.vehicleType === v.value && s.vehicleRowActive]}
                onPress={() => set('vehicleType', v.value)}>
                <Text style={{ fontSize:22 }}>{v.label.split(' ')[0]}</Text>
                <Text style={[s.vehicleLabel, form.vehicleType === v.value && { color: COLORS.purple, fontWeight:'700' }]}>
                  {v.label.split(' ').slice(1).join(' ')}
                </Text>
                {form.vehicleType === v.value && <Text style={{ color: COLORS.purple, marginLeft:'auto' }}>✓</Text>}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.btn} onPress={goNext}>
              <Text style={s.btnTxt}>Continuer →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 2 : Documents ── */}
        {step === 2 && (
          <View style={s.card}>
            <Text style={s.docNote}>
              📋 Tous les documents sont obligatoires pour valider votre dossier.
            </Text>

            {DOCS.map(doc => (
              <View key={doc.key} style={s.docRow}>
                <View style={s.docInfo}>
                  <Text style={s.docIcon}>{doc.icon}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={s.docLabel}>{doc.label}</Text>
                    <Text style={s.docStatus}>
                      {photos[doc.key] ? '✅ Ajouté' : '⚠️ Requis'}
                    </Text>
                  </View>
                </View>

                {photos[doc.key] ? (
                  <View style={s.docPreviewWrap}>
                    <Image source={{ uri: photos[doc.key].uri }} style={s.docPreview} />
                    <TouchableOpacity onPress={() => pickImage(doc.key)} style={s.changeBtn}>
                      <Text style={s.changeTxt}>Changer</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={s.uploadBtn} onPress={() => pickImage(doc.key)}>
                    <Text style={s.uploadTxt}>📁 Ajouter</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={[s.btn, loading && { opacity:0.6 }]} onPress={submit} disabled={loading}>
              {loading
                ? <><ActivityIndicator color="#fff" style={{ marginRight:8 }} /><Text style={s.btnTxt}>Envoi en cours...</Text></>
                : <Text style={s.btnTxt}>✅ Envoyer le dossier</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 3 : Succès ── */}
        {step === 3 && (
          <View style={[s.card, { alignItems:'center', paddingVertical:40 }]}>
            <Text style={{ fontSize:64, marginBottom:16 }}>🎉</Text>
            <Text style={s.successTitle}>Dossier envoyé !</Text>
            <Text style={s.successText}>
              Votre demande d'inscription a été transmise à l'administrateur.
              Vous serez notifié par téléphone une fois votre compte validé.
            </Text>
            <View style={s.infoBox}>
              <Text style={s.infoTxt}>⏱️ Délai de traitement : 24 à 48 heures</Text>
            </View>
            <TouchableOpacity style={[s.btn, { width:'100%', marginTop:24 }]} onPress={onBack}>
              <Text style={s.btnTxt}>← Retour à la connexion</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ children, style }) {
  return <Text style={[{ fontSize:12, color: COLORS.muted, marginBottom:5, marginTop:2 }, style]}>{children}</Text>;
}

const s = StyleSheet.create({
  safe:        { flex:1, backgroundColor: COLORS.bg },
  scroll:      { flexGrow:1, padding:20, paddingTop:12 },
  header:      { marginBottom:20 },
  back:        { marginBottom:10 },
  backTxt:     { fontSize:14, color: COLORS.purple },
  title:       { fontSize:22, fontWeight:'700', color: COLORS.text },
  subtitle:    { fontSize:13, color: COLORS.muted, marginTop:4 },
  card:        { backgroundColor:'#fff', borderRadius:16, padding:18, borderWidth:.5, borderColor: COLORS.border },
  inp:         { borderWidth:.5, borderColor: COLORS.border, borderRadius:10, padding:12, fontSize:14,
                 backgroundColor: COLORS.bg, marginBottom:12, color: COLORS.text },
  btn:         { backgroundColor: COLORS.purple, borderRadius:12, padding:14, alignItems:'center',
                 flexDirection:'row', justifyContent:'center', marginTop:8 },
  btnTxt:      { color:'#fff', fontWeight:'700', fontSize:15 },

  // Step indicator
  dot:         { width:28, height:28, borderRadius:14, backgroundColor:'#E0DEEF', alignItems:'center', justifyContent:'center' },
  dotActive:   { backgroundColor: COLORS.purple },
  dotDone:     { backgroundColor: COLORS.green },
  line:        { width:32, height:2, backgroundColor:'#E0DEEF', marginHorizontal:4 },
  lineDone:    { backgroundColor: COLORS.green },

  // Zone chips
  grid:        { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:4 },
  chip:        { borderWidth:.5, borderColor: COLORS.border, borderRadius:20, paddingHorizontal:12, paddingVertical:7, backgroundColor: COLORS.bg },
  chipActive:  { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  chipTxt:     { fontSize:12, color: COLORS.text },
  chipTxtActive: { color:'#fff', fontWeight:'600' },

  // Vehicle
  vehicleRow:     { flexDirection:'row', alignItems:'center', gap:12, padding:14, borderRadius:12,
                    borderWidth:.5, borderColor: COLORS.border, marginBottom:8, backgroundColor: COLORS.bg },
  vehicleRowActive: { borderColor: COLORS.purple, backgroundColor: COLORS.purpleLight },
  vehicleLabel:   { fontSize:14, color: COLORS.text },

  // Documents
  docNote:     { fontSize:12, color: COLORS.amber, backgroundColor:'#FFF8EC', borderRadius:8,
                 padding:10, marginBottom:14, lineHeight:18 },
  docRow:      { borderWidth:.5, borderColor: COLORS.border, borderRadius:12, padding:12, marginBottom:10 },
  docInfo:     { flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 },
  docIcon:     { fontSize:26 },
  docLabel:    { fontSize:13, fontWeight:'600', color: COLORS.text },
  docStatus:   { fontSize:11, color: COLORS.muted, marginTop:2 },
  docPreviewWrap: { alignItems:'center', gap:6 },
  docPreview:  { width:'100%', height:120, borderRadius:8, resizeMode:'cover' },
  changeBtn:   { borderWidth:1, borderColor: COLORS.purple, borderRadius:8, paddingHorizontal:14, paddingVertical:6 },
  changeTxt:   { color: COLORS.purple, fontSize:12, fontWeight:'600' },
  uploadBtn:   { borderWidth:1.5, borderColor: COLORS.purple, borderRadius:10, padding:12, alignItems:'center', borderStyle:'dashed' },
  uploadTxt:   { color: COLORS.purple, fontWeight:'600', fontSize:13 },

  // Succès
  successTitle: { fontSize:22, fontWeight:'700', color: COLORS.text, marginBottom:12, textAlign:'center' },
  successText:  { fontSize:14, color: COLORS.muted, textAlign:'center', lineHeight:22, marginBottom:16 },
  infoBox:      { backgroundColor: COLORS.purpleLight, borderRadius:10, padding:14, width:'100%' },
  infoTxt:      { fontSize:13, color: COLORS.purple, textAlign:'center', fontWeight:'600' },
});
