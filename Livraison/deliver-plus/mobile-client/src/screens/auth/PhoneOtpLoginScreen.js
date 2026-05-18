import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS } from '../../constants';

// Durée de validité OTP en secondes
const OTP_DURATION = 120;

// Validation numéro mauritanien : 8 chiffres, commence par 2, 3 ou 4
const isValidPhone = (phone) => {
  const digits = phone.replace(/[\s\-\.]/g, '').replace(/^\+?222/, '');
  return /^[234]\d{7}$/.test(digits);
};
const PHONE_ERR = 'Numéro invalide. Doit contenir 8 chiffres et commencer par 2, 3 ou 4.';

function OtpInput({ value, onChange, expired, loading, onValidate, onResend, debugOtp, t, isAr }) {
  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(OTP_DURATION);

  useEffect(() => {
    setTimeLeft(OTP_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const isExpired = timeLeft === 0;
  const timerColor = isExpired ? COLORS.red : timeLeft <= 15 ? COLORS.amber : COLORS.green;

  return (
    <>
      <View style={st.otpRow}>
        <TextInput
          style={st.otpInp}
          value={value}
          onChangeText={v => onChange(v.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="• • • • • •"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          editable={!isExpired && !loading}
        />
        <View style={[st.countdown, { borderColor: timerColor }]}>
          <Text style={[st.countdownNum, { color: timerColor }]}>
            {isExpired ? '✕' : timeLeft}
          </Text>
          {!isExpired && <Text style={st.countdownSec}>{t.auth_otp_sec}</Text>}
        </View>
      </View>

      {!!debugOtp && (
        <View style={st.debugBox}>
          <Text style={st.debugTxt}>{t.auth_otp_test} {debugOtp}</Text>
        </View>
      )}

      {isExpired ? (
        <TouchableOpacity style={st.btnOutline} onPress={onResend} disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.purple} />
            : <Text style={st.btnOutlineTxt}>{t.auth_otp_resend}</Text>}
        </TouchableOpacity>
      ) : loading ? (
        <View style={[st.btn, { backgroundColor: COLORS.green }]}>
          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
          <Text style={st.btnTxt}>{t.auth_connecting}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[st.btn, value.length < 6 && st.btnDisabled]}
          onPress={onValidate}
          disabled={value.length < 6}
        >
          <Text style={st.btnTxt}>
            {value.length === 6 ? t.auth_otp_validate : `${6 - value.length} ${t.auth_otp_digits_left}`}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

export default function PhoneOtpLoginScreen() {
  const { loginWithPhone, registerClient, loginWithOtp, forgotPassword, resetPassword, loading, error, clearError } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const t = translations[lang] || translations.fr;
  const isAr = lang === 'ar';
  const rtl = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  // Écrans : 'welcome' | 'login' | 'register' | 'register-otp' | 'forgot' | 'forgot-otp' | 'forgot-new' | 'forgot-done'
  const [screen, setScreen] = useState('welcome');

  // Champs communs
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [otp, setOtp]           = useState('');
  const [debugOtp, setDebugOtp] = useState('');

  // Champs inscription
  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Champs reset
  const [newPwd, setNewPwd]           = useState('');
  const [confirmNewPwd, setConfirmNewPwd] = useState('');

  useEffect(() => { clearError(); }, []);

  // ── Connexion ──────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!phone.trim() || !password) return;
    if (!isValidPhone(phone.trim())) {
      Alert.alert(t.val_phone_invalid, t.val_phone_err);
      return;
    }
    await loginWithPhone(phone.trim(), password);
  };

  // ── Inscription : envoyer OTP ──────────────────────────────────────────────
  const handleRegisterSend = async () => {
    if (!phone.trim() || !firstName.trim() || !lastName.trim() || !password) return;
    if (!isValidPhone(phone.trim())) {
      Alert.alert(t.val_phone_invalid, t.val_phone_err);
      return;
    }
    if (password.length < 6) {
      Alert.alert(t.val_verify, t.val_pwd_min);
      return;
    }
    if (password !== confirmPwd) {
      Alert.alert(t.val_verify, t.val_pwd_mismatch);
      return;
    }
    const result = await registerClient(phone.trim(), firstName.trim(), lastName.trim(), password);
    if (result?.success) {
      if (result.debug_otp) setDebugOtp(result.debug_otp);
      setOtp('');
      setScreen('register-otp');
    }
  };

  // ── Inscription : valider OTP ──────────────────────────────────────────────
  const handleRegisterVerify = async () => {
    if (otp.length < 6 || loading) return;
    const result = await loginWithOtp(phone.trim(), otp.trim(), referralCode.trim() || undefined);
    if (result?.creditsEarned > 0) {
      Alert.alert(t.ref_activated, `${t.ref_credits_msg_pre} ${result.creditsEarned} ${t.ref_credits_msg_post}`);
    }
  };

  useEffect(() => {
    if (screen === 'register-otp' && otp.length === 6 && !loading) handleRegisterVerify();
  }, [otp, screen]);

  // ── Mot de passe oublié : envoyer OTP ────────────────────────────────────
  const handleForgotSend = async () => {
    if (!phone.trim()) return;
    if (!isValidPhone(phone.trim())) {
      Alert.alert(t.val_phone_invalid, t.val_phone_err);
      return;
    }
    const result = await forgotPassword(phone.trim());
    if (result?.success) {
      if (result.debug_otp) setDebugOtp(result.debug_otp);
      setOtp('');
      setScreen('forgot-otp');
    } else if (result?.notFound) {
      setScreen('forgot-not-found');
    }
  };

  // ── Mot de passe oublié : valider OTP ────────────────────────────────────
  const handleForgotVerify = async () => {
    if (otp.length < 6 || loading) return;
    setScreen('forgot-new');
  };

  useEffect(() => {
    if (screen === 'forgot-otp' && otp.length === 6 && !loading) handleForgotVerify();
  }, [otp, screen]);

  // ── Réinitialisation mot de passe ────────────────────────────────────────
  const handleReset = async () => {
    if (!newPwd || newPwd.length < 6) {
      Alert.alert(t.val_verify, t.val_pwd_min);
      return;
    }
    if (newPwd !== confirmNewPwd) {
      Alert.alert(t.val_verify, t.val_pwd_mismatch);
      return;
    }
    const result = await resetPassword(phone.trim(), otp.trim(), newPwd);
    if (result?.success) setScreen('forgot-done');
  };

  const goBack = () => {
    clearError();
    setOtp(''); setDebugOtp(''); setPassword(''); setNewPwd(''); setConfirmNewPwd('');
    if (screen === 'login' || screen === 'register') setScreen('welcome');
    else if (screen === 'register-otp') setScreen('register');
    else if (screen === 'forgot' || screen === 'forgot-not-found') setScreen('welcome');
    else if (screen === 'forgot-otp') setScreen('forgot');
    else if (screen === 'forgot-new') setScreen('forgot-otp');
    else if (screen === 'forgot-done') setScreen('login');
  };

  const resendRegisterOtp = async () => {
    setOtp(''); setDebugOtp('');
    const result = await registerClient(phone.trim(), firstName.trim(), lastName.trim(), password);
    if (result?.debug_otp) setDebugOtp(result.debug_otp);
  };

  const resendForgotOtp = async () => {
    setOtp(''); setDebugOtp('');
    const result = await forgotPassword(phone.trim());
    if (result?.debug_otp) setDebugOtp(result.debug_otp);
  };

  return (
    <SafeAreaView style={st.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">

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

          {/* Logo */}
          <View style={st.logoWrap}>
            <View style={st.logo}><Text style={{ fontSize: 32 }}>📦</Text></View>
            <Text style={st.appName}>Amder</Text>
          </View>

          {/* Bouton retour (sauf welcome) */}
          {screen !== 'welcome' && screen !== 'forgot-done' && (
            <TouchableOpacity onPress={goBack} style={{ marginBottom: 8 }}>
              <Text style={[{ fontSize: 14, color: COLORS.purple }, rtl]}>{t.auth_back}</Text>
            </TouchableOpacity>
          )}

          {/* Erreur globale */}
          {!!error && (
            <View style={st.errBox}><Text style={[st.errTxt, rtl]}>{error}</Text></View>
          )}

          {/* ══════════════ ÉCRAN BIENVENUE ══════════════ */}
          {screen === 'welcome' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_welcome_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_welcome_sub}</Text>
              <View style={{ height: 32 }} />
              <TouchableOpacity style={st.btn} onPress={() => { clearError(); setScreen('login'); }}>
                <Text style={st.btnTxt}>{t.auth_btn_login}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnOutline, { marginTop: 12 }]}
                onPress={() => { clearError(); setScreen('register'); }}>
                <Text style={st.btnOutlineTxt}>{t.auth_btn_register}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ CONNEXION ══════════════ */}
          {screen === 'login' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_login_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_login_sub}</Text>
              <View style={{ height: 16 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_phone}</Text>
              <TextInput
                style={[st.inp, isAr && { textAlign: 'right' }]}
                value={phone}
                onChangeText={v => setPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="ex: 36123456"
                keyboardType="number-pad" maxLength={8} autoFocus
              />

              <Text style={[st.lbl, rtl]}>{t.auth_password}</Text>
              <View style={st.pwdRow}>
                <TextInput
                  style={[st.inp, { flex: 1, marginBottom: 0 }, isAr && { textAlign: 'right' }]}
                  value={password} onChangeText={setPassword}
                  placeholder="••••••••" secureTextEntry={!showPwd}
                />
                <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={st.eyeBtn}>
                  <Text style={{ fontSize: 18 }}>{showPwd ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 14 }} />

              <TouchableOpacity
                style={[st.btn, (!phone.trim() || !password) && st.btnDisabled]}
                onPress={handleLogin}
                disabled={loading || !phone.trim() || !password}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.auth_login_btn}</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { clearError(); setPhone(''); setScreen('forgot'); }}
                style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: COLORS.purple, fontSize: 13 }}>{t.auth_forgot_pwd}</Text>
              </TouchableOpacity>

              <View style={st.divider} />
              <TouchableOpacity onPress={() => { clearError(); setScreen('register'); }}
                style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: COLORS.muted }}>
                  {t.auth_no_account}{' '}
                  <Text style={{ color: COLORS.purple, fontWeight: '700' }}>{t.auth_register_link}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ INSCRIPTION ══════════════ */}
          {screen === 'register' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_register_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_register_sub}</Text>
              <View style={{ height: 16 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_firstname}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={firstName} onChangeText={setFirstName}
                placeholder={t.auth_ph_firstname} autoCapitalize="words" />

              <Text style={[st.lbl, rtl]}>{t.auth_lastname}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={lastName} onChangeText={setLastName}
                placeholder={t.auth_ph_lastname} autoCapitalize="words" />

              <Text style={[st.lbl, rtl]}>{t.auth_phone}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={phone}
                onChangeText={v => setPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="ex: 36123456" keyboardType="number-pad" maxLength={8} />

              <Text style={[st.lbl, rtl]}>{t.auth_password}</Text>
              <View style={st.pwdRow}>
                <TextInput
                  style={[st.inp, { flex: 1, marginBottom: 0 }, isAr && { textAlign: 'right' }]}
                  value={password} onChangeText={setPassword}
                  placeholder={t.auth_new_pwd_ph} secureTextEntry={!showPwd}
                />
                <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={st.eyeBtn}>
                  <Text style={{ fontSize: 18 }}>{showPwd ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 14 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_confirm_pwd}</Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={confirmPwd} onChangeText={setConfirmPwd}
                placeholder={t.auth_confirm_ph} secureTextEntry />

              <Text style={[st.lbl, rtl]}>
                {t.auth_referral_lbl}{' '}
                <Text style={{ color: COLORS.muted, fontSize: 11 }}>{t.auth_ref_optional}</Text>
              </Text>
              <TextInput style={[st.inp, isAr && { textAlign: 'right' }]}
                value={referralCode}
                onChangeText={v => setReferralCode(v.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                placeholder={t.auth_referral_ph} autoCapitalize="characters" maxLength={10} />

              <TouchableOpacity
                style={[st.btn, (!phone.trim() || !firstName.trim() || !lastName.trim() || !password) && st.btnDisabled]}
                onPress={handleRegisterSend}
                disabled={loading || !phone.trim() || !firstName.trim() || !lastName.trim() || !password}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.auth_register_btn}</Text>}
              </TouchableOpacity>

              <View style={st.divider} />
              <TouchableOpacity onPress={() => { clearError(); setScreen('login'); }}
                style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: COLORS.muted }}>
                  {t.auth_already_account}{' '}
                  <Text style={{ color: COLORS.purple, fontWeight: '700' }}>{t.auth_login_link}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ OTP INSCRIPTION ══════════════ */}
          {screen === 'register-otp' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_otp_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_otp_subtitle} {phone}</Text>
              <View style={{ height: 16 }} />
              <OtpInput
                value={otp} onChange={setOtp}
                loading={loading}
                onValidate={handleRegisterVerify}
                onResend={resendRegisterOtp}
                debugOtp={debugOtp}
                t={t} isAr={isAr}
              />
            </View>
          )}

          {/* ══════════════ MOT DE PASSE OUBLIÉ ══════════════ */}
          {screen === 'forgot' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_forgot_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_forgot_sub}</Text>
              <View style={{ height: 16 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_phone}</Text>
              <TextInput
                style={[st.inp, isAr && { textAlign: 'right' }]}
                value={phone}
                onChangeText={v => setPhone(v.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="ex: 36123456"
                keyboardType="number-pad" maxLength={8} autoFocus
              />

              <TouchableOpacity
                style={[st.btn, !phone.trim() && st.btnDisabled]}
                onPress={handleForgotSend}
                disabled={loading || !phone.trim()}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.auth_forgot_btn}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ NUMÉRO INTROUVABLE ══════════════ */}
          {screen === 'forgot-not-found' && (
            <View style={[st.card, { alignItems: 'center', paddingVertical: 32 }]}>
              <Text style={{ fontSize: 52, marginBottom: 16 }}>🔍</Text>
              <Text style={[st.cardTitle, { textAlign: 'center', marginBottom: 8 }]}>
                {t.auth_not_found_title}
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
                {t.auth_not_found_pre}{' '}
                <Text style={{ fontWeight: '700', color: COLORS.text }}>{phone}</Text>
                {'\n'}{t.auth_not_found_post}{'\n\n'}
                {t.auth_not_found_register}
              </Text>
              <TouchableOpacity
                style={[st.btn, { width: '100%' }]}
                onPress={() => { clearError(); setScreen('register'); }}
              >
                <Text style={st.btnTxt}>{t.auth_not_found_create}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 14 }}
                onPress={() => { clearError(); setPhone(''); setScreen('forgot'); }}
              >
                <Text style={{ fontSize: 13, color: COLORS.muted }}>
                  {t.auth_not_found_try}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ OTP RESET ══════════════ */}
          {screen === 'forgot-otp' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_otp_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_otp_subtitle} {phone}</Text>
              <View style={{ height: 16 }} />
              <OtpInput
                value={otp} onChange={setOtp}
                loading={loading}
                onValidate={handleForgotVerify}
                onResend={resendForgotOtp}
                debugOtp={debugOtp}
                t={t} isAr={isAr}
              />
            </View>
          )}

          {/* ══════════════ NOUVEAU MOT DE PASSE ══════════════ */}
          {screen === 'forgot-new' && (
            <View style={st.card}>
              <Text style={[st.cardTitle, rtl]}>{t.auth_new_pwd_title}</Text>
              <Text style={[st.cardSub, rtl]}>{t.auth_new_pwd_sub}</Text>
              <View style={{ height: 16 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_new_pwd}</Text>
              <View style={st.pwdRow}>
                <TextInput
                  style={[st.inp, { flex: 1, marginBottom: 0 }, isAr && { textAlign: 'right' }]}
                  value={newPwd} onChangeText={setNewPwd}
                  placeholder={t.auth_new_pwd_ph} secureTextEntry={!showPwd}
                  autoFocus
                />
                <TouchableOpacity onPress={() => setShowPwd(v => !v)} style={st.eyeBtn}>
                  <Text style={{ fontSize: 18 }}>{showPwd ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 14 }} />

              <Text style={[st.lbl, rtl]}>{t.auth_confirm_new_pwd}</Text>
              <TextInput
                style={[st.inp, isAr && { textAlign: 'right' }]}
                value={confirmNewPwd} onChangeText={setConfirmNewPwd}
                placeholder={t.auth_confirm_ph} secureTextEntry
              />

              <TouchableOpacity
                style={[st.btn, (!newPwd || !confirmNewPwd) && st.btnDisabled]}
                onPress={handleReset}
                disabled={loading || !newPwd || !confirmNewPwd}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{t.auth_reset_btn}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* ══════════════ RESET RÉUSSI ══════════════ */}
          {screen === 'forgot-done' && (
            <View style={[st.card, { alignItems: 'center', paddingVertical: 36 }]}>
              <Text style={{ fontSize: 56, marginBottom: 16 }}>✅</Text>
              <Text style={[st.cardTitle, { textAlign: 'center' }]}>{t.auth_reset_ok_title}</Text>
              <Text style={[st.cardSub, { textAlign: 'center', marginBottom: 24 }]}>{t.auth_reset_ok_sub}</Text>
              <TouchableOpacity style={[st.btn, { width: '100%' }]}
                onPress={() => { clearError(); setPassword(''); setScreen('login'); }}>
                <Text style={st.btnTxt}>{t.auth_login_now}</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { flexGrow: 1, padding: 24, paddingTop: 40 },
  langRow:      { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 },
  langBtn:      { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#EEEDFE' },
  langBtnActive:{ backgroundColor: COLORS.purple },
  langTxt:      { fontSize: 13, color: COLORS.purple, fontWeight: '500' },
  langTxtActive:{ color: '#fff', fontWeight: '700' },
  logoWrap:     { alignItems: 'center', marginBottom: 24 },
  logo:         { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  appName:      { fontSize: 26, fontWeight: '900', color: COLORS.text },
  errBox:       { backgroundColor: COLORS.redLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  errTxt:       { color: COLORS.red, fontSize: 13 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: .5, borderColor: COLORS.border },
  cardTitle:    { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  cardSub:      { fontSize: 13, color: COLORS.muted, lineHeight: 18 },
  lbl:          { fontSize: 12, color: COLORS.muted, marginBottom: 6 },
  inp:          { borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: COLORS.bg, marginBottom: 14, color: COLORS.text },
  pwdRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyeBtn:       { padding: 10 },
  btn:          { backgroundColor: COLORS.purple, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 4 },
  btnDisabled:  { backgroundColor: '#C4C0E4' },
  btnTxt:       { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline:   { borderWidth: 1.5, borderColor: COLORS.purple, borderRadius: 12, padding: 14, alignItems: 'center' },
  btnOutlineTxt:{ color: COLORS.purple, fontWeight: '700', fontSize: 15 },
  divider:      { height: 1, backgroundColor: COLORS.border, marginVertical: 16 },
  // OTP
  otpRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  otpInp:       { flex: 1, borderWidth: 2, borderColor: COLORS.purple, borderRadius: 12, padding: 16, fontSize: 26, textAlign: 'center', backgroundColor: COLORS.bg, letterSpacing: 10, fontWeight: '700', color: COLORS.text },
  countdown:    { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  countdownNum: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  countdownSec: { fontSize: 8, color: COLORS.muted, marginTop: 1 },
  debugBox:     { backgroundColor: '#F0F0F0', borderRadius: 8, padding: 10, marginBottom: 14 },
  debugTxt:     { fontSize: 12, color: COLORS.muted, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
});
