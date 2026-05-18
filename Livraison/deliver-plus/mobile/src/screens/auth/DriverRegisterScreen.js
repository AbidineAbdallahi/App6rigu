import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { API_URL, COLORS } from '../../constants';

// Validation numéro mauritanien
const isValidPhone = (phone) => {
  const digits = phone.replace(/[\s\-\.]/g, '').replace(/^\+?222/, '');
  return /^[234]\d{7}$/.test(digits);
};

const ZONES = ['Tevragh-Zeina','Ksar','Sebkha','El Mina','Dar Naim','Arafat','Toujounine','Riyad','Teyarett','Autre'];

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
  const { lang } = useLangStore();
  const t = translations[lang] || translations.fr;

  const VEHICLES = [
    { value:'moto',    label:'🛵 ' + t.cd_moto },
    { value:'voiture', label:'🚗 ' + t.cd_voiture },
    { value:'velo',    label:'🚲 ' + t.cd_velo },
    { value:'pied',    label:'🚶 ' + t.cd_pied },
  ];

  const DOCS = [
    { key:'photoPersonnelle', label: t.reg_doc_photo,    icon:'🤳', required: true },
    { key:'photoVehicule',    label: t.reg_doc_vehicle,  icon:'📸', required: true },
    { key:'carteGrise',       label: t.reg_doc_grise,    icon:'📄', required: true },
    { key:'carteIdentite',    label: t.reg_doc_id,       icon:'🪪', required: true },
    { key:'assurance',        label: t.reg_doc_insurance,icon:'🛡️', required: true },
  ];

  // phoneVerified = true après vérification OTP du numéro
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifiedPhone, setVerifiedPhone] = useState('');
  const [otpPhone, setOtpPhone]           = useState('');
  const [otpCode, setOtpCode]             = useState('');
  const [otpDebug, setOtpDebug]           = useState('');
  const [otpStep, setOtpStep]             = useState('phone'); // 'phone' | 'code'
  const [otpLoading, setOtpLoading]       = useState(false);
  const [otpError, setOtpError]           = useState('');
  const [timeLeft, setTimeLeft]           = useState(120);
  const timerRef = useRef(null);

  useEffect(() => {
    if (otpStep !== 'code') return;
    setTimeLeft(120);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [otpStep]);

  const sendOtpForRegistration = async () => {
    if (!otpPhone.trim()) return;
    if (!isValidPhone(otpPhone.trim())) {
      setOtpError(t.val_phone_err);
      return;
    }
    setOtpLoading(true); setOtpError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/send-otp`, { phone: otpPhone.trim() });
      if (data.success) {
        if (data.debug_otp) setOtpDebug(data.debug_otp);
        setOtpCode('');
        setOtpStep('code');
      }
    } catch (err) {
      setOtpError(err.response?.data?.message || t.reg_err_server);
    } finally { setOtpLoading(false); }
  };

  const verifyOtpForRegistration = async () => {
    if (otpCode.length < 6) return;
    // Le code sera vérifié côté backend lors du submit final
    // On stocke juste le numéro vérifié
    setPhoneVerified(true);
    setVerifiedPhone(otpPhone.trim());
    set('phone', otpPhone.trim());
  };

  const timerColor = timeLeft === 0 ? COLORS.red : timeLeft <= 15 ? COLORS.amber : COLORS.green;

  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm]     = useState({
    firstName:'', lastName:'', email:'', phone:'', password:'', confirmPassword:'',
    zone:'', vehicleType:'moto', driverType:'livraison', referralCode:'',
  });
  const [photos, setPhotos] = useState({
    photoPersonnelle: null, photoVehicule: null,
    carteGrise: null, carteIdentite: null, assurance: null,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const pickImage = (docKey) => {
    Alert.alert(
      DOCS.find(d => d.key === docKey)?.label || 'Document',
      t.reg_pick_source,
      [
        {
          text: t.reg_camera,
          onPress: async () => {
            try {
              const cam = await ImagePicker.requestCameraPermissionsAsync();
              if (!cam.granted) { Alert.alert(t.reg_perm_denied, t.reg_perm_cam); return; }
              const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
              if (!result.canceled) setPhotos(p => ({ ...p, [docKey]: result.assets[0] }));
            } catch (e) { Alert.alert(t.reg_err, e.message); }
          },
        },
        {
          text: t.reg_gallery,
          onPress: async () => {
            try {
              const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) { Alert.alert(t.reg_perm_denied, t.reg_perm_gallery); return; }
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
              if (!result.canceled) setPhotos(p => ({ ...p, [docKey]: result.assets[0] }));
            } catch (e) { Alert.alert(t.reg_err, e.message); }
          },
        },
        { text: t.cancel, style: 'cancel' },
      ]
    );
  };

  const validateStep0 = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return t.reg_val_name;
    if (!form.phone.trim()) return t.reg_val_phone;
    if (!form.password || form.password.length < 6) return t.reg_val_pwd_len;
    if (form.password !== form.confirmPassword) return t.reg_val_pwd_match;
    return null;
  };

  const validateStep1 = () => {
    if (!form.zone) return t.reg_val_zone;
    if (!form.vehicleType) return t.reg_val_vehicle;
    if (!form.driverType) return t.reg_val_vehicle;
    return null;
  };

  const validateStep2 = () => {
    const missing = DOCS.filter(d => d.required && !photos[d.key]).map(d => d.label);
    if (missing.length) return `${t.reg_val_docs} ${missing.join(', ')}.`;
    return null;
  };

  const goNext = () => {
    let err = null;
    if (step === 0) err = validateStep0();
    if (step === 1) err = validateStep1();
    if (step === 2) err = validateStep2();
    if (err) { Alert.alert(t.reg_verify, err); return; }
    setStep(s => s + 1);
  };

  const submit = async () => {
    const err = validateStep2();
    if (err) { Alert.alert(t.reg_verify, err); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('firstName',   form.firstName.trim());
      fd.append('lastName',    form.lastName.trim());
      fd.append('phone',       verifiedPhone || form.phone.trim());
      fd.append('password',    form.password);
      fd.append('zone',        form.zone);
      fd.append('vehicleType', form.vehicleType);
      fd.append('driverType',  form.driverType);
      fd.append('otp',         otpCode.trim());
      if (form.email.trim()) fd.append('email', form.email.trim().toLowerCase());
      if (form.referralCode.trim()) fd.append('referralCode', form.referralCode.trim());

      Object.entries(photos).forEach(([key, asset]) => {
        if (asset?.uri) {
          fd.append(key, {
            uri:  asset.uri,
            type: asset.mimeType || 'image/jpeg',
            name: `${key}.jpg`,
          });
        }
      });

      const res = await fetch(`${API_URL}/auth/register-driver`, {
        method: 'POST',
        body: fd,
      });

      let data = {};
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        Alert.alert(t.reg_err_register, data?.message || `Erreur serveur (${res.status})`);
        return;
      }
      setStep(3);
    } catch (e) {
      Alert.alert(t.reg_err_network, `${t.reg_err_server}\n${e?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  const stepSubtitle = [t.reg_step0_sub, t.reg_step1_sub, t.reg_step2_sub, t.reg_step3_sub][step];

  // ── Étape pré-inscription : vérification OTP du numéro ──
  if (!phoneVerified) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity onPress={otpStep === 'code' ? () => setOtpStep('phone') : onBack} style={s.back}>
              <Text style={s.backTxt}>{t.reg_back}</Text>
            </TouchableOpacity>
            <Text style={s.title}>{t.reg_title}</Text>
            <Text style={s.subtitle}>
              {otpStep === 'phone' ? t.reg_otp_step_title : `${t.forgot_sub_otp} ${otpPhone}`}
            </Text>
          </View>

          {/* Indicateur étape OTP */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            <View style={[s.dot, otpStep === 'phone' && s.dotActive]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>📱</Text>
            </View>
            <View style={[s.line]} />
            <View style={[s.dot, otpStep === 'code' && s.dotActive, { opacity: otpStep === 'phone' ? 0.4 : 1 }]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
            </View>
          </View>

          <View style={s.card}>
            {!!otpError && (
              <View style={{ backgroundColor: COLORS.redLight, borderRadius: 8, padding: 10, marginBottom: 14 }}>
                <Text style={{ color: COLORS.red, fontSize: 13 }}>{otpError}</Text>
              </View>
            )}

            {otpStep === 'phone' && (
              <>
                <Label>{t.reg_phone}</Label>
                <TextInput style={s.inp}
                  value={otpPhone}
                  onChangeText={v => setOtpPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="ex: 36123456" keyboardType="number-pad" maxLength={8} autoFocus />
                <TouchableOpacity style={[s.btn, !otpPhone.trim() && { opacity: 0.5 }]}
                  onPress={sendOtpForRegistration} disabled={otpLoading || !otpPhone.trim()}>
                  {otpLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnTxt}>{t.reg_otp_send_btn}</Text>}
                </TouchableOpacity>
              </>
            )}

            {otpStep === 'code' && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <TextInput
                    style={{ flex: 1, borderWidth: 2, borderColor: COLORS.purple, borderRadius: 12, padding: 16, fontSize: 26, textAlign: 'center', backgroundColor: COLORS.bg, letterSpacing: 10, fontWeight: '700', color: COLORS.text }}
                    value={otpCode}
                    onChangeText={v => setOtpCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="• • • • • •" keyboardType="number-pad" maxLength={6} autoFocus
                  />
                  <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: timerColor, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: timerColor }}>{timeLeft === 0 ? '✕' : timeLeft}</Text>
                    {timeLeft > 0 && <Text style={{ fontSize: 8, color: COLORS.muted }}>{t.forgot_sec}</Text>}
                  </View>
                </View>

                {!!otpDebug && (
                  <View style={{ backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, color: COLORS.muted, textAlign: 'center' }}>
                      {t.reg_otp_test} {otpDebug}
                    </Text>
                  </View>
                )}

                {timeLeft === 0 ? (
                  <TouchableOpacity style={[s.btn, { borderWidth: 1.5, borderColor: COLORS.purple, backgroundColor: 'transparent' }]}
                    onPress={sendOtpForRegistration} disabled={otpLoading}>
                    {otpLoading
                      ? <ActivityIndicator color={COLORS.purple} />
                      : <Text style={{ color: COLORS.purple, fontWeight: '700', fontSize: 15 }}>{t.reg_otp_resend}</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s.btn, otpCode.length < 6 && { opacity: 0.5 }]}
                    onPress={verifyOtpForRegistration} disabled={otpCode.length < 6}>
                    <Text style={s.btnTxt}>
                      {otpCode.length === 6 ? t.reg_otp_verify_btn : `${6 - otpCode.length} ${t.reg_otp_digits}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.header}>
          {step < 3 && (
            <TouchableOpacity onPress={step === 0 ? () => setPhoneVerified(false) : () => setStep(s => s - 1)} style={s.back}>
              <Text style={s.backTxt}>{t.reg_back}</Text>
            </TouchableOpacity>
          )}
          <Text style={s.title}>{t.reg_title}</Text>
          <Text style={s.subtitle}>{stepSubtitle}</Text>
        </View>

        {step < 3 && <StepIndicator current={step} total={3} />}

        {/* Numéro vérifié - badge */}
        <View style={{ backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 16 }}>✅</Text>
          <Text style={{ fontSize: 13, color: '#2E7D32', fontWeight: '600' }}>
            {t.reg_verified_num} : {verifiedPhone}
          </Text>
        </View>

        {/* ── ÉTAPE 0 : Infos personnelles ── */}
        {step === 0 && (
          <View style={s.card}>
            <Label>{t.reg_firstname}</Label>
            <TextInput style={s.inp} value={form.firstName} onChangeText={v => set('firstName', v)}
              placeholder={t.reg_ph_firstname} autoCapitalize="words" />

            <Label>{t.reg_lastname}</Label>
            <TextInput style={s.inp} value={form.lastName} onChangeText={v => set('lastName', v)}
              placeholder={t.reg_ph_lastname} autoCapitalize="words" />

            <Label>{t.reg_email} <Text style={{ color: COLORS.muted, fontSize:11 }}>{t.reg_email_optional}</Text></Label>
            <TextInput style={s.inp} value={form.email} onChangeText={v => set('email', v)}
              placeholder={t.reg_ph_email} keyboardType="email-address" autoCapitalize="none" />

            <Label>{t.reg_password}</Label>
            <TextInput style={s.inp} value={form.password} onChangeText={v => set('password', v)}
              placeholder={t.reg_ph_password} secureTextEntry />

            <Label>{t.reg_confirm_pwd}</Label>
            <TextInput style={s.inp} value={form.confirmPassword} onChangeText={v => set('confirmPassword', v)}
              placeholder={t.reg_ph_confirm} secureTextEntry />

            <Label>{t.reg_referral_lbl} <Text style={{ color: COLORS.muted, fontSize:11 }}>{t.reg_referral_hint}</Text></Label>
            <TextInput style={s.inp} value={form.referralCode}
              onChangeText={v => set('referralCode', v.replace(/[^A-Za-z0-9]/g,'').toUpperCase())}
              placeholder={t.reg_referral_ph} autoCapitalize="characters" maxLength={10} />

            <TouchableOpacity style={s.btn} onPress={goNext}>
              <Text style={s.btnTxt}>{t.reg_continue}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 1 : Zone & Véhicule ── */}
        {step === 1 && (
          <View style={s.card}>
            <Label>{t.reg_zone}</Label>
            <View style={s.grid}>
              {ZONES.map(z => (
                <TouchableOpacity key={z}
                  style={[s.chip, form.zone === z && s.chipActive]}
                  onPress={() => set('zone', z)}>
                  <Text style={[s.chipTxt, form.zone === z && s.chipTxtActive]}>{z}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label style={{ marginTop:20 }}>{t.reg_service_type}</Label>
            <View style={{ flexDirection:'row', gap:10, marginBottom:4 }}>
              {[
                { value:'livraison', label:t.reg_livraison_lbl, icon:'📦', desc:t.reg_livraison_desc },
                { value:'course',    label:t.reg_course_lbl,    icon:'🚖', desc:t.reg_course_desc },
              ].map(dt => (
                <TouchableOpacity key={dt.value}
                  style={[{
                    flex:1, borderWidth:1.5, borderRadius:12, padding:14, alignItems:'center',
                    borderColor: form.driverType === dt.value ? COLORS.purple : 'rgba(0,0,0,0.09)',
                    backgroundColor: form.driverType === dt.value ? COLORS.purpleLight : '#fff',
                  }]}
                  onPress={() => set('driverType', dt.value)}>
                  <Text style={{ fontSize:28, marginBottom:4 }}>{dt.icon}</Text>
                  <Text style={{ fontSize:13, fontWeight:'700', color: form.driverType === dt.value ? COLORS.purple : '#1a1a18' }}>{dt.label}</Text>
                  <Text style={{ fontSize:11, color:'#6b6b67', textAlign:'center', marginTop:2 }}>{dt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Label style={{ marginTop:20 }}>{t.reg_vehicle_type}</Label>
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
              <Text style={s.btnTxt}>{t.reg_continue}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 2 : Documents ── */}
        {step === 2 && (
          <View style={s.card}>
            <Text style={s.docNote}>{t.reg_docs_note}</Text>

            {DOCS.map(doc => (
              <View key={doc.key} style={s.docRow}>
                <View style={s.docInfo}>
                  <Text style={s.docIcon}>{doc.icon}</Text>
                  <View style={{ flex:1 }}>
                    <Text style={s.docLabel}>{doc.label}</Text>
                    <Text style={s.docStatus}>
                      {photos[doc.key] ? t.reg_doc_added : t.reg_doc_required}
                    </Text>
                  </View>
                </View>

                {photos[doc.key] ? (
                  <View style={s.docPreviewWrap}>
                    <Image source={{ uri: photos[doc.key].uri }} style={s.docPreview} />
                    <TouchableOpacity onPress={() => pickImage(doc.key)} style={s.changeBtn}>
                      <Text style={s.changeTxt}>{t.reg_doc_change}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={s.uploadBtn} onPress={() => pickImage(doc.key)}>
                    <Text style={s.uploadTxt}>{t.reg_doc_add}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={[s.btn, loading && { opacity:0.6 }]} onPress={submit} disabled={loading}>
              {loading
                ? <><ActivityIndicator color="#fff" style={{ marginRight:8 }} /><Text style={s.btnTxt}>{t.reg_submitting}</Text></>
                : <Text style={s.btnTxt}>{t.reg_submit}</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── ÉTAPE 3 : Succès ── */}
        {step === 3 && (
          <View style={[s.card, { alignItems:'center', paddingVertical:40 }]}>
            <Text style={{ fontSize:64, marginBottom:16 }}>🎉</Text>
            <Text style={s.successTitle}>{t.reg_success_title}</Text>
            <Text style={s.successText}>{t.reg_success_text}</Text>
            <View style={s.infoBox}>
              <Text style={s.infoTxt}>{t.reg_success_delay}</Text>
            </View>
            <TouchableOpacity style={[s.btn, { width:'100%', marginTop:24 }]} onPress={onBack}>
              <Text style={s.btnTxt}>{t.reg_back_login}</Text>
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
