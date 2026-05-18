import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, I18nManager, TextInput, ActivityIndicator, Share, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import useThemeStore from '../../stores/themeStore';
import { translations } from '../../i18n';
import api from '../../services/api';
import { COLORS } from '../../constants';

export default function ProfileScreen() {
  const { user, logout, driverProfile, updateDriver } = useAuthStore();
  const { lang, setLang } = useLangStore();
  const { isDark, toggleTheme } = useThemeStore();
  const [applyCode, setApplyCode]           = useState('');
  const [applying, setApplying]             = useState(false);
  const [referralEnabled, setReferralEnabled] = useState(true);

  useEffect(() => {
    fetch(`${require('../../constants').API_URL}/settings/public`)
      .then(r => r.json())
      .then(d => { if (d.referralEnabled !== undefined) setReferralEnabled(d.referralEnabled); })
      .catch(() => {});
  }, []);
  const t = translations[lang];

  const isAr = lang === 'ar';
  const rtlText = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  const rows = [
    { label: t.p_firstname, value: user?.firstName },
    { label: t.p_lastname,  value: user?.lastName  },
    { label: t.p_email,     value: user?.email     },
    { label: t.p_phone,     value: user?.phone     },
    { label: t.p_role,      value: user?.role === 'driver' ? t.p_driver : t.p_client },
  ];

  const switchLang = async (newLang) => {
    await setLang(newLang);
    I18nManager.forceRTL(newLang === 'ar');
    Alert.alert(t.p_lang_title, t.p_lang_msg, [{ text: t.p_lang_ok }]);
  };

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Rejoins Amder comme livreur avec mon code : ${driverProfile?.referralCode}\nTu reçois 500 MRU sur ton solde dès l'inscription !`,
        title: 'Mon code Amder Livreur',
      });
    } catch {}
  };

  const handleApplyReferral = async () => {
    const code = applyCode.trim().toUpperCase();
    if (!code) return;
    setApplying(true);
    try {
      const { data } = await api.post('/drivers/apply-referral', { code });
      if (data.success) {
        updateDriver(data.driver);
        setApplyCode('');
        Alert.alert('🎁', t.ref_apply_success);
      } else {
        Alert.alert('', data.message || t.ref_apply_err);
      }
    } catch (err) {
      Alert.alert('', err.response?.data?.message || t.ref_apply_err);
    } finally { setApplying(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
          </View>
          <Text style={[styles.name, rtlText]}>{user?.firstName} {user?.lastName}</Text>
          <Text style={[styles.email, rtlText]}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={[styles.rowValue, rtlText]}>{r.value || '—'}</Text>
            </View>
          ))}
        </View>

        {/* Parrainage livreur — masqué si désactivé par l'admin */}
        {referralEnabled && <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎁 {t.ref_section}</Text>
            {!!driverProfile?.solde && (
              <View style={styles.creditBadge}>
                <Text style={styles.creditBadgeTxt}>{driverProfile.solde} MRU</Text>
              </View>
            )}
          </View>

          <View style={{ padding: 14 }}>
            <Text style={[styles.rowLabel, { marginBottom: 6 }]}>{t.ref_your_code}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{driverProfile?.referralCode || '—'}</Text>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareCode}>
                <Text style={styles.shareBtnTxt}>{t.ref_share}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.refStats}>
              <View style={styles.refStat}>
                <Text style={styles.refStatNum}>{driverProfile?.solde || 0}</Text>
                <Text style={styles.refStatLbl}>{t.ref_solde_bonus} MRU</Text>
              </View>
              <View style={[styles.refStat, { borderLeftWidth: .5, borderLeftColor: COLORS.border }]}>
                <Text style={styles.refStatNum}>{driverProfile?.referralCount || 0}</Text>
                <Text style={styles.refStatLbl}>{t.ref_friends}</Text>
              </View>
            </View>

            <Text style={styles.refHow}>{t.ref_how}</Text>

            {!driverProfile?.referredBy && (
              <>
                <Text style={[styles.rowLabel, { marginTop: 12, marginBottom: 6 }]}>{t.ref_apply_title}</Text>
                <View style={styles.applyRow}>
                  <TextInput
                    style={styles.applyInp}
                    value={applyCode}
                    onChangeText={v => setApplyCode(v.replace(/[^A-Za-z0-9]/g,'').toUpperCase())}
                    placeholder={t.ref_apply_ph}
                    placeholderTextColor={COLORS.muted}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                  <TouchableOpacity
                    style={[styles.applyBtn, (!applyCode.trim() || applying) && { opacity: .5 }]}
                    onPress={handleApplyReferral}
                    disabled={!applyCode.trim() || applying}
                  >
                    {applying
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.applyBtnTxt}>{t.ref_apply_btn}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>}

        {/* Language selector */}
        <View style={styles.card}>
          <Text style={[styles.rowLabel, { padding: 14, paddingBottom: 8 }]}>{t.p_lang}</Text>
          <View style={styles.langRow}>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'fr' && styles.langBtnActive]}
              onPress={() => switchLang('fr')}
            >
              <Text style={[styles.langBtnText, lang === 'fr' && styles.langBtnTextActive]}>
                {t.p_lang_fr}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'ar' && styles.langBtnActive]}
              onPress={() => switchLang('ar')}
            >
              <Text style={[styles.langBtnText, lang === 'ar' && styles.langBtnTextActive]}>
                {t.p_lang_ar}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Mode sombre */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{isDark ? '🌙 Mode sombre' : '☀️ Mode clair'}</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#D3D1C7', true: COLORS.purple }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>{t.p_logout}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: COLORS.bg },
  scroll:           { padding: 20 },
  header:           { alignItems: 'center', marginBottom: 24 },
  avatar:           { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:       { fontSize: 24, fontWeight: '700', color: COLORS.purple },
  name:             { fontSize: 20, fontWeight: '600', color: COLORS.text },
  email:            { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  card:             { backgroundColor: '#fff', borderRadius: 14, borderWidth: .5, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  row:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  rowBorder:        { borderBottomWidth: .5, borderBottomColor: COLORS.border },
  rowLabel:         { fontSize: 13, color: COLORS.muted },
  rowValue:         { fontSize: 13, fontWeight: '500', color: COLORS.text },
  langRow:          { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 6 },
  langBtn:          { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  langBtnActive:    { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  langBtnText:      { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  langBtnTextActive:{ color: '#fff' },
  logoutBtn:        { backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: .5, borderColor: '#F09595' },
  logoutText:       { fontSize: 14, fontWeight: '600', color: COLORS.red },
  sectionHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: .5, borderBottomColor: COLORS.border },
  sectionTitle:     { fontSize: 13, fontWeight: '600', color: COLORS.text },
  creditBadge:      { backgroundColor: COLORS.purpleLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  creditBadgeTxt:   { fontSize: 12, fontWeight: '700', color: COLORS.purple },
  codeRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  codeText:         { flex: 1, fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 2, backgroundColor: COLORS.bg, borderRadius: 10, padding: 10, borderWidth: .5, borderColor: COLORS.border, textAlign: 'center' },
  shareBtn:         { backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  shareBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  refStats:         { flexDirection: 'row', borderRadius: 10, borderWidth: .5, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 12 },
  refStat:          { flex: 1, alignItems: 'center', paddingVertical: 12 },
  refStatNum:       { fontSize: 22, fontWeight: '800', color: COLORS.purple },
  refStatLbl:       { fontSize: 10, color: COLORS.muted, marginTop: 2, textAlign: 'center' },
  refHow:           { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
  applyRow:         { flexDirection: 'row', gap: 8 },
  applyInp:         { flex: 1, borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 11, fontSize: 14, backgroundColor: COLORS.bg, color: COLORS.text, fontWeight: '600', letterSpacing: 1 },
  applyBtn:         { backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  applyBtnTxt:      { color: '#fff', fontWeight: '700', fontSize: 13 },
});
