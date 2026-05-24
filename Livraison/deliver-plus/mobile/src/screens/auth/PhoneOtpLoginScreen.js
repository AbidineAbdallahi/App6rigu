import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import { COLORS } from '../../constants';

export default function PhoneOtpLoginScreen({ onBack }) {
  const { sendOtp, loginWithOtp, loading, error, clearError } = useAuthStore();

  const [step, setStep]           = useState(1);
  const [phone, setPhone]         = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [otp, setOtp]             = useState('');
  const [debugOtp, setDebugOtp]   = useState('');
  const [timeLeft, setTimeLeft]   = useState(20);
  const [expired, setExpired]     = useState(false);
  const timerRef = useRef(null);

  useEffect(() => { clearError(); }, []);

  useEffect(() => {
    if (step !== 2) return;
    setTimeLeft(20);
    setExpired(false);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setExpired(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    const result = await sendOtp(phone.trim(), firstName.trim() || 'Client', lastName.trim() || 'Amnir');
    if (result?.success) {
      if (result.debug_otp) setDebugOtp(result.debug_otp);
      setStep(2);
    }
  };

  const handleVerifyOtp = async () => {
    if (expired || otp.length < 6 || loading) return;
    await loginWithOtp(phone.trim(), otp.trim());
    // store updates → App re-renders automatically
  };

  // Auto-validation dès que les 6 chiffres sont saisis
  useEffect(() => {
    if (otp.length === 6 && !expired && !loading) {
      handleVerifyOtp();
    }
  }, [otp]);

  const handleResend = async () => {
    clearInterval(timerRef.current);
    setOtp('');
    setDebugOtp('');
    const result = await sendOtp(phone.trim(), firstName.trim() || 'Client', lastName.trim() || 'Amnir');
    if (result?.success) {
      if (result.debug_otp) setDebugOtp(result.debug_otp);
      setStep(2);
    }
  };

  const timerColor = expired ? COLORS.red : timeLeft <= 5 ? COLORS.amber : COLORS.green;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backTxt}>← Retour</Text>
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <View style={styles.logo}><Text style={{ fontSize: 30 }}>📱</Text></View>
            <Text style={styles.title}>Connexion Client</Text>
            <Text style={styles.subtitle}>
              {step === 1
                ? 'Entrez votre numéro pour recevoir un code'
                : `Code envoyé au ${phone}`}
            </Text>
          </View>

          <View style={styles.card}>
            {!!error && (
              <View style={styles.errBox}><Text style={styles.errTxt}>{error}</Text></View>
            )}

            {step === 1 ? (
              <>
                <Text style={styles.lbl}>Numéro de téléphone *</Text>
                <TextInput
                  style={styles.inp}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+222 36 00 00 00"
                  keyboardType="phone-pad"
                  autoFocus
                />
                <Text style={styles.lbl}>
                  Prénom <Text style={{ color: COLORS.muted, fontSize: 11 }}>(nouveau compte)</Text>
                </Text>
                <TextInput
                  style={styles.inp}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Mohamed"
                />
                <Text style={styles.lbl}>
                  Nom <Text style={{ color: COLORS.muted, fontSize: 11 }}>(nouveau compte)</Text>
                </Text>
                <TextInput
                  style={styles.inp}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Ould Ahmed"
                />
                <TouchableOpacity
                  style={[styles.btn, !phone.trim() && styles.btnDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading || !phone.trim()}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnTxt}>Envoyer le code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.otpRow}>
                  <TextInput
                    style={styles.otpInp}
                    value={otp}
                    onChangeText={v => setOtp(v.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="• • • • • •"
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                  />
                  <View style={[styles.countdown, { borderColor: timerColor }]}>
                    <Text style={[styles.countdownNum, { color: timerColor }]}>
                      {expired ? '✕' : timeLeft}
                    </Text>
                    {!expired && <Text style={styles.countdownSec}>sec</Text>}
                  </View>
                </View>

                {!!debugOtp && (
                  <View style={styles.debugBox}>
                    <Text style={styles.debugTxt}>🔧 Code de test : {debugOtp}</Text>
                  </View>
                )}

                {/* Indication auto-validation */}
                {!expired && otp.length < 6 && (
                  <Text style={styles.hintTxt}>
                    Saisissez les {6 - otp.length} chiffre{6 - otp.length > 1 ? 's' : ''} restant{6 - otp.length > 1 ? 's' : ''}
                  </Text>
                )}

                {expired ? (
                  <TouchableOpacity style={styles.btnOutline} onPress={handleResend} disabled={loading}>
                    {loading
                      ? <ActivityIndicator color={COLORS.purple} />
                      : <Text style={styles.btnOutlineTxt}>Renvoyer le code</Text>}
                  </TouchableOpacity>
                ) : loading ? (
                  <View style={[styles.btn, { backgroundColor: COLORS.green }]}>
                    <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.btnTxt}>Connexion en cours...</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.btn, otp.length < 6 && styles.btnDisabled]}
                    onPress={handleVerifyOtp}
                    disabled={otp.length < 6}
                  >
                    <Text style={styles.btnTxt}>
                      {otp.length === 6 ? '✓ Valider le code' : `Saisir ${6 - otp.length} chiffre(s) de plus`}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => { clearInterval(timerRef.current); setStep(1); setOtp(''); setDebugOtp(''); clearError(); }}
                  style={{ alignItems: 'center', marginTop: 16 }}
                >
                  <Text style={{ fontSize: 13, color: COLORS.muted }}>Modifier le numéro</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { flexGrow: 1, padding: 24, paddingTop: 16 },
  backBtn:      { marginBottom: 20 },
  backTxt:      { fontSize: 14, color: COLORS.purple },
  logoWrap:     { alignItems: 'center', marginBottom: 28 },
  logo:         { width: 68, height: 68, borderRadius: 18, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:        { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle:     { fontSize: 13, color: COLORS.muted, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: .5, borderColor: COLORS.border },
  errBox:       { backgroundColor: COLORS.redLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  errTxt:       { color: COLORS.red, fontSize: 13 },
  lbl:          { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  inp:          { borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: COLORS.bg, marginBottom: 14 },
  btn:          { backgroundColor: COLORS.purple, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4 },
  hintTxt:      { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginBottom: 10 },
  btnDisabled:  { backgroundColor: '#C4C0E4' },
  btnTxt:       { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline:   { borderWidth: 1.5, borderColor: COLORS.purple, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  btnOutlineTxt:{ color: COLORS.purple, fontWeight: '700', fontSize: 15 },
  otpRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  otpInp:       { flex: 1, borderWidth: 2, borderColor: COLORS.purple, borderRadius: 12, padding: 16, fontSize: 26, textAlign: 'center', backgroundColor: COLORS.bg, letterSpacing: 10, fontWeight: '700' },
  countdown:    { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  countdownSec: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  debugBox:     { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, marginBottom: 14 },
  debugTxt:     { fontSize: 12, color: COLORS.muted, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
