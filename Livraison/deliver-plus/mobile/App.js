import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Image, Alert, Platform, Linking } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, COLORS } from './src/constants';
import useAuthStore from './src/stores/authStore';
import useLangStore from './src/stores/langStore';
import { translations } from './src/i18n';
import { registerForPushNotifications } from './src/services/notifications';
import notifee from '@notifee/react-native';
import DriverTabs from './src/navigation/DriverTabs';
import DriverRegisterScreen from './src/screens/auth/DriverRegisterScreen';

// Validation numéro mauritanien : 8 chiffres, commence par 2, 3 ou 4
const isValidPhone = (phone) => {
  const digits = phone.replace(/[\s\-\.]/g, '').replace(/^\+?222/, '');
  return /^[234]\d{7}$/.test(digits);
};
const PHONE_ERR = 'Numéro invalide. Doit contenir 8 chiffres et commencer par 2, 3 ou 4.';

// ─── Logo Amnir ───────────────────────────────────────────────────────────────
function AmnirLogo({ size = 90 }) {
  return (
    <Image
      source={require('./assets/icon.png')}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
    />
  );
}

// ─── Écran dossier en attente ─────────────────────────────────────────────────
function PendingScreen({ onBack }) {
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;
  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <AmnirLogo size={80} />
        <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
          <Text style={{ fontSize:48, marginBottom:16 }}>⏳</Text>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', textAlign:'center', marginBottom:10 }}>
            {t.pending_title}
          </Text>
          <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:28 }}>
            {t.pending_msg}
          </Text>
          <View style={{ backgroundColor:'#FFF8E7', borderRadius:14, padding:16, borderWidth:1, borderColor:'#F59E0B', width:'100%', marginBottom:24 }}>
            <Text style={{ fontSize:13, color:'#92400E', fontWeight:'600', marginBottom:4 }}>{t.pending_docs_title}</Text>
            {[t.reg_doc_photo, t.reg_doc_vehicle, t.reg_doc_grise, t.reg_doc_id, t.reg_doc_insurance].map(d => (
              <Text key={d} style={{ fontSize:13, color:'#92400E', marginTop:4 }}>· {d}</Text>
            ))}
          </View>
          <TouchableOpacity onPress={onBack}
            style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>{t.pending_back}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Écran compléter le dossier ──────────────────────────────────────────────
const DOCS_KEYS = [
  { key:'photoPersonnelle', tKey:'reg_doc_photo',   icon:'🤳' },
  { key:'photoVehicule',    tKey:'reg_doc_vehicle', icon:'📸' },
  { key:'carteGrise',       tKey:'reg_doc_grise',   icon:'📄' },
  { key:'carteIdentite',    tKey:'reg_doc_id',      icon:'🪪' },
  { key:'assurance',        tKey:'reg_doc_insurance', icon:'🛡️' },
];

function CompleteDocsScreen({ missingDocuments = [], missingInfoNote, onDone, onLogout }) {
  const { token } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;
  const [photos, setPhotos]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const DOCS_META = DOCS_KEYS.map(d => ({ ...d, label: t[d.tKey] || d.tKey }));

  const pickImage = (key) => {
    Alert.alert(DOCS_META.find(d => d.key === key)?.label || 'Document', t.pick_source, [
      {
        text: t.pick_camera,
        onPress: async () => {
          try {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (!cam.granted) { Alert.alert(t.reg_perm_denied, t.perm_denied_cam); return; }
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
            if (!r.canceled) setPhotos(p => ({ ...p, [key]: r.assets[0] }));
          } catch (e) { Alert.alert(t.error, e.message); }
        },
      },
      {
        text: t.pick_gallery,
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert(t.reg_perm_denied, t.perm_denied_gallery); return; }
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
            if (!r.canceled) setPhotos(p => ({ ...p, [key]: r.assets[0] }));
          } catch (e) { Alert.alert(t.error, e.message); }
        },
      },
      { text: t.pick_cancel, style: 'cancel' },
    ]);
  };

  const submit = async () => {
    const allUploaded = missingDocuments.every(k => photos[k]);
    if (!allUploaded) {
      Alert.alert(t.complete_missing_alert, t.complete_missing_msg);
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
      if (!res.ok) { Alert.alert(t.error, data?.message || `${t.complete_server_err} (${res.status})`); return; }
      setSubmitted(true);
    } catch {
      Alert.alert(t.complete_net_err, t.complete_server_err);
    } finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <SafeAreaView style={st.safe}>
        <ScrollView contentContainerStyle={st.center}>
          <AmnirLogo size={80} />
          <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
            <Text style={{ fontSize:48, marginBottom:16 }}>✅</Text>
            <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', textAlign:'center', marginBottom:10 }}>{t.complete_done_title}</Text>
            <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:24 }}>
              {t.complete_done_msg}
            </Text>
            <TouchableOpacity onPress={onLogout}
              style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
              <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>{t.complete_back}</Text>
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
        <AmnirLogo size={70} />
        <View style={{ marginTop:20, width:'100%', padding:24 }}>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#1a1a18', marginBottom:8 }}>{t.complete_title}</Text>

          <View style={{ backgroundColor:'#E6F1FB', borderRadius:12, padding:14, marginBottom:20, borderWidth:1, borderColor:'#9BC4EC' }}>
            <Text style={{ fontSize:13, color:'#185FA5', fontWeight:'700', marginBottom:4 }}>{t.complete_docs_title}</Text>
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
                    {photos[doc.key] ? t.complete_added : t.complete_required}
                  </Text>
                </View>
              </View>
              {photos[doc.key] ? (
                <View style={{ alignItems:'center', gap:6 }}>
                  <Image source={{ uri: photos[doc.key].uri }} style={{ width:'100%', height:100, borderRadius:8, resizeMode:'cover' }} />
                  <TouchableOpacity onPress={() => pickImage(doc.key)}
                    style={{ borderWidth:1, borderColor:COLORS.purple, borderRadius:8, paddingHorizontal:14, paddingVertical:6 }}>
                    <Text style={{ color:COLORS.purple, fontSize:12, fontWeight:'600' }}>{t.complete_change}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => pickImage(doc.key)}
                  style={{ borderWidth:1.5, borderColor:COLORS.purple, borderRadius:10, padding:12, alignItems:'center', borderStyle:'dashed' }}>
                  <Text style={{ color:COLORS.purple, fontWeight:'600', fontSize:13 }}>{t.complete_add}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={[st.btn, { marginTop:12 }, loading && { opacity:.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.complete_send_btn}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={{ marginTop:14, alignItems:'center' }}>
            <Text style={{ fontSize:13, color:COLORS.muted }}>{t.complete_logout}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Écran dossier refusé ─────────────────────────────────────────────────────
function RejectedScreen({ message, onBack }) {
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;
  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.center}>
        <AmnirLogo size={80} />
        <View style={{ marginTop:28, alignItems:'center', padding:24 }}>
          <Text style={{ fontSize:48, marginBottom:16 }}>❌</Text>
          <Text style={{ fontSize:20, fontWeight:'800', color:'#A32D2D', textAlign:'center', marginBottom:10 }}>
            {t.rejected_title}
          </Text>
          <Text style={{ fontSize:14, color:'#6b6b67', textAlign:'center', lineHeight:22, marginBottom:20 }}>
            {message || t.rejected_default_msg}
          </Text>
          <View style={{ backgroundColor:'#FDF0F0', borderRadius:14, padding:16, borderWidth:1, borderColor:'#F5C0C0', width:'100%', marginBottom:24 }}>
            <Text style={{ fontSize:13, color:'#A32D2D', lineHeight:20 }}>
              {t.rejected_info}
            </Text>
          </View>
          <TouchableOpacity onPress={onBack}
            style={{ backgroundColor:'#F7F6F2', borderRadius:12, padding:14, width:'100%', alignItems:'center', borderWidth:.5, borderColor:'#D3D1C7' }}>
            <Text style={{ fontSize:14, fontWeight:'600', color:'#6b6b67' }}>{t.rejected_back}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Écran mot de passe oublié (livreur) ─────────────────────────────────────
function ForgotPasswordScreen({ onBack }) {
  const { forgotPassword, resetPassword, loading, error, clearError } = useAuthStore();
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;
  const isAr = lang === 'ar';
  const rtl = isAr ? { textAlign: 'right' } : {};

  // step: 'phone' | 'otp' | 'new-pwd' | 'done' | 'not-found'
  const [step, setStep]           = useState('phone');
  const [phone, setPhone]         = useState('');
  const [otp, setOtp]             = useState('');
  const [debugOtp, setDebugOtp]   = useState('');
  const [newPwd, setNewPwd]       = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [timeLeft, setTimeLeft]   = useState(120);
  const timerRef = useRef(null);

  useEffect(() => {
    if (step !== 'otp') return;
    setTimeLeft(120);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  const sendOtp = async () => {
    if (!phone.trim()) return;
    if (!isValidPhone(phone.trim())) {
      Alert.alert(t.val_phone_invalid, t.val_phone_err);
      return;
    }
    const result = await forgotPassword(phone.trim());
    if (result?.success) {
      if (result.debug_otp) setDebugOtp(result.debug_otp);
      setOtp('');
      setStep('otp');
    } else if (result?.notFound) {
      setStep('not-found');
    }
  };

  const verifyOtp = () => {
    if (otp.length < 6) return;
    setStep('new-pwd');
  };

  const doReset = async () => {
    if (!newPwd || newPwd.length < 6) {
      Alert.alert(t.val_verify, t.val_pwd_min);
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert(t.val_verify, t.val_pwd_mismatch);
      return;
    }
    const result = await resetPassword(phone.trim(), otp.trim(), newPwd);
    if (result?.success) setStep('done');
  };

  const timerColor = timeLeft === 0 ? COLORS.red : timeLeft <= 15 ? COLORS.amber : COLORS.green;

  if (step === 'done') {
    return (
      <SafeAreaView style={st.safe}>
        <ScrollView contentContainerStyle={st.center}>
          <AmnirLogo size={80} />
          <View style={{ marginTop: 28, alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>✅</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a1a18', textAlign: 'center', marginBottom: 10 }}>
              {t.forgot_done_title}
            </Text>
            <Text style={{ fontSize: 14, color: '#6b6b67', textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {t.forgot_done_msg}
            </Text>
            <TouchableOpacity onPress={() => { clearError(); onBack(); }}
              style={[st.btn, { width: '100%' }]}>
              <Text style={st.btnTxt}>{t.forgot_back_login}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'not-found') {
    return (
      <SafeAreaView style={st.safe}>
        <ScrollView contentContainerStyle={st.center}>
          <AmnirLogo size={80} />
          <View style={{ marginTop: 28, alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>🔍</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a1a18', textAlign: 'center', marginBottom: 10 }}>
              {t.forgot_not_found_title}
            </Text>
            <Text style={{ fontSize: 14, color: '#6b6b67', textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
              {t.forgot_sub_otp} <Text style={{ fontWeight: '700', color: '#1a1a18' }}>{phone}</Text>{'\n'}
              {t.forgot_not_found_msg}
            </Text>
            <TouchableOpacity onPress={() => { clearError(); onBack(); }}
              style={[st.btn, { width: '100%', marginBottom: 12 }]}>
              <Text style={st.btnTxt}>{t.forgot_create_account}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { clearError(); setPhone(''); setStep('phone'); }}
              style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: COLORS.muted }}>{t.forgot_try_other}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={[st.center, { paddingTop: 16 }]}>
        <AmnirLogo size={70} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 16, marginBottom: 4 }}>
          {t.forgot_title}
        </Text>
        <Text style={{ fontSize: 13, color: COLORS.muted, marginBottom: 24, textAlign: 'center' }}>
          {step === 'phone' ? t.forgot_sub_phone
           : step === 'otp'  ? `${t.forgot_sub_otp} ${phone}`
           : t.forgot_sub_pwd}
        </Text>

        <View style={[st.card, { width: '100%' }]}>
          {!!error && <View style={st.errBox}><Text style={st.errTxt}>{error}</Text></View>}

          {step === 'phone' && (
            <>
              <Text style={[st.lbl, rtl]}>{t.forgot_phone_lbl}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={phone}
                onChangeText={v => setPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="ex: 36123456" keyboardType="number-pad" maxLength={8} autoFocus />
              <TouchableOpacity style={[st.btn, !phone.trim() && { opacity: 0.5 }]}
                onPress={sendOtp} disabled={loading || !phone.trim()}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.forgot_send_btn}</Text>}
              </TouchableOpacity>
            </>
          )}

          {step === 'otp' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <TextInput
                  style={{ flex: 1, borderWidth: 2, borderColor: COLORS.purple, borderRadius: 12, padding: 16, fontSize: 26, textAlign: 'center', backgroundColor: COLORS.bg, letterSpacing: 10, fontWeight: '700', color: COLORS.text }}
                  value={otp}
                  onChangeText={v => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="• • • • • •" keyboardType="number-pad" maxLength={6} autoFocus
                />
                <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: timerColor, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: timerColor }}>{timeLeft === 0 ? '✕' : timeLeft}</Text>
                  {timeLeft > 0 && <Text style={{ fontSize: 8, color: COLORS.muted }}>{t.forgot_sec}</Text>}
                </View>
              </View>
              {!!debugOtp && (
                <View style={{ backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>{t.forgot_test_code} {debugOtp}</Text>
                </View>
              )}
              {timeLeft === 0 ? (
                <TouchableOpacity style={[st.btn, { borderWidth: 1.5, borderColor: COLORS.purple, backgroundColor: 'transparent' }]}
                  onPress={sendOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color={COLORS.purple} /> : <Text style={{ color: COLORS.purple, fontWeight: '700', fontSize: 15 }}>{t.forgot_resend}</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[st.btn, otp.length < 6 && { opacity: 0.5 }]}
                  onPress={verifyOtp} disabled={otp.length < 6}>
                  <Text style={st.btnTxt}>{otp.length === 6 ? t.forgot_continue_btn : `${6 - otp.length} ${t.forgot_digits_left}`}</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {step === 'new-pwd' && (
            <>
              <Text style={[st.lbl, rtl]}>{t.forgot_new_pwd_lbl}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={newPwd} onChangeText={setNewPwd}
                placeholder={t.forgot_new_pwd_ph} secureTextEntry autoFocus />
              <Text style={[st.lbl, rtl]}>{t.forgot_confirm_lbl}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={confirmPwd} onChangeText={setConfirmPwd}
                placeholder={t.forgot_confirm_ph} secureTextEntry />
              <TouchableOpacity style={[st.btn, (!newPwd || !confirmPwd) && { opacity: 0.5 }]}
                onPress={doReset} disabled={loading || !newPwd || !confirmPwd}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.forgot_reset_btn}</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity onPress={onBack} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: COLORS.muted }}>{t.forgot_back}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Connexion Livreur ────────────────────────────────────────────────────────
function DriverLoginScreen({ onRegister }) {
  const { login, loading, error, approvalStatus, missingDocuments, missingInfoNote, clearError, logout } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const t = translations[lang] || translations.fr;
  const isAr = lang === 'ar';
  const rtl = isAr ? { textAlign: 'right' } : {};

  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async () => {
    if (!isValidPhone(phone.trim())) {
      Alert.alert(t.val_phone_invalid, t.val_phone_err);
      return;
    }
    const role = await login(phone.trim(), password);
    if (role && role !== 'driver' && role !== 'incomplet') useAuthStore.getState().logout();
  };

  if (showForgot) {
    return <ForgotPasswordScreen onBack={() => { clearError(); setShowForgot(false); }} />;
  }

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
        {/* Toggle langue */}
        <View style={st.langRow}>
          {['fr', 'ar'].map(l => (
            <TouchableOpacity key={l} onPress={() => setLang(l)}
              style={[st.langBtn, lang === l && st.langBtnActive]}>
              <Text style={[st.langTxt, lang === l && st.langTxtActive]}>
                {l === 'fr' ? 'Français' : 'عربي'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <AmnirLogo size={100} />
        <Text style={st.title}>Amnir</Text>
        <Text style={st.sub}>{t.login_space}</Text>
        <View style={st.card}>
          {!!error && <View style={st.errBox}><Text style={[st.errTxt, rtl]}>{t[error] || error}</Text></View>}
          <Text style={[st.lbl, rtl]}>{t.login_phone || 'Numéro de téléphone'}</Text>
          <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
            value={phone}
            onChangeText={v => setPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
            keyboardType="number-pad" maxLength={8} placeholder="ex: 36123456" />
          <Text style={[st.lbl, rtl]}>{t.login_password}</Text>
          <View style={[st.inp, { flexDirection: 'row', alignItems: 'center', paddingVertical: 0, paddingHorizontal: 0 }]}>
            <TextInput
              style={[{ flex: 1, fontSize: 14, color: COLORS.text, padding: 12 }, isAr && { textAlign: 'right' }]}
              value={password} onChangeText={setPassword}
              secureTextEntry={!showPwd} placeholder="••••••••"
            />
            <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={{ paddingHorizontal: 12 }}>
              <Ionicons name={showPwd ? 'eye-off' : 'eye'} size={20} color={COLORS.muted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={st.btn} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.login_btn}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { clearError(); setShowForgot(true); }}
            style={{ alignItems: 'center', marginTop: 14 }}>
            <Text style={{ color: COLORS.purple, fontSize: 13 }}>
              {t.login_forgot || 'Mot de passe oublié ?'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={onRegister} style={st.registerLink}>
          <Text style={[st.registerTxt, rtl]}>
            {t.login_not_driver}{' '}
            <Text style={{ color: COLORS.purple, fontWeight:'700' }}>{t.login_create_account}</Text>
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

  useEffect(() => {
    init();
    useLangStore.getState().initLang();
    require('./src/stores/themeStore').default.getState().initTheme();
  }, []);

  useEffect(() => {
    if (token) {
      registerForPushNotifications();
      // Android 14+ : demander USE_FULL_SCREEN_INTENT pour les notifications plein écran (style appel)
      if (Platform.OS === 'android') {
        notifee.requestPermission().catch(() => {});
      }
    }
  }, [token]);

  if (!initialized) {
    return (
      <SafeAreaProvider>
        <View style={{ flex:1, backgroundColor:'#3B328F', alignItems:'center', justifyContent:'center' }}>
          <AmnirLogo size={90} />
          <Text style={{ color:'#fff', fontSize:22, fontWeight:'800', marginTop:18 }}>Amnir</Text>
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
  langRow:      { flexDirection:'row', gap:8, marginBottom:24, alignSelf:'center' },
  langBtn:      { paddingHorizontal:16, paddingVertical:6, borderRadius:20, backgroundColor:'#EEEDFE' },
  langBtnActive:{ backgroundColor: COLORS.purple },
  langTxt:      { fontSize:13, color: COLORS.purple, fontWeight:'500' },
  langTxtActive:{ color:'#fff', fontWeight:'700' },
});
