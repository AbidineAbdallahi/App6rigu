import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, I18nManager, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { useFavorites } from '../../hooks/useFavorites';
import api from '../../services/api';
import { COLORS } from '../../constants';

function AddFavoriteModal({ visible, onClose, onSave, loading, t }) {
  const ICONS = t.p_fav_icons || ['🏠','🏢','🏫','🏥','🕌','📍','⭐'];
  const [icon, setIcon]   = useState('🏠');
  const [name, setName]   = useState('');
  const [label, setLabel] = useState('');

  const reset = () => { setIcon('🏠'); setName(''); setLabel(''); };

  const save = () => {
    if (!name.trim() || !label.trim()) {
      Alert.alert('', 'Veuillez remplir le nom et l\'adresse');
      return;
    }
    // Pour simplifier : on utilise des coords de Nouakchott par défaut
    // En production, on pourrait ouvrir le MapPicker ici
    onSave({ icon, name: name.trim(), label: label.trim(), lat: 18.0858, lng: -15.9785 });
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={ms.overlay}>
            <TouchableWithoutFeedback>
              <View style={ms.card}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  <Text style={ms.title}>{t.p_favs_add}</Text>

                  {/* Sélection icône */}
                  <View style={ms.iconRow}>
                    {ICONS.map(ic => (
                      <TouchableOpacity
                        key={ic}
                        style={[ms.iconBtn, icon === ic && ms.iconBtnActive]}
                        onPress={() => setIcon(ic)}
                      >
                        <Text style={{ fontSize: 22 }}>{ic}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput
                    style={ms.inp}
                    placeholder={t.p_fav_name_ph}
                    value={name}
                    onChangeText={setName}
                    placeholderTextColor={COLORS.muted}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[ms.inp, { minHeight: 60, textAlignVertical: 'top' }]}
                    placeholder={t.p_fav_addr_ph}
                    value={label}
                    onChangeText={setLabel}
                    placeholderTextColor={COLORS.muted}
                    multiline
                    returnKeyType="done"
                    blurOnSubmit
                  />

                  <View style={ms.btnRow}>
                    <TouchableOpacity style={ms.btnCancel} onPress={() => { Keyboard.dismiss(); reset(); onClose(); }}>
                      <Text style={{ color: COLORS.muted, fontWeight: '600' }}>{t.p_fav_cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={ms.btnSave} onPress={save} disabled={loading}>
                      {loading
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={{ color: '#fff', fontWeight: '700' }}>{t.p_fav_save}</Text>}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const { user, logout, updateUser } = useAuthStore();
  const { lang, setLang }   = useLangStore();
  const t = translations[lang];
  const isAr = lang === 'ar';
  const rtlText = isAr ? { textAlign: 'right', writingDirection: 'rtl' } : {};

  const { favorites, loading: favLoading, load, add, remove } = useFavorites();
  const [showAddModal, setShowAddModal] = useState(false);
  const [applyCode, setApplyCode]       = useState('');
  const [applying, setApplying]         = useState(false);
  const [referralEnabled, setReferralEnabled] = useState(true);

  useEffect(() => {
    load();
    fetch(`${require('../../constants').API_URL}/settings/public`)
      .then(r => r.json())
      .then(d => { if (d.referralEnabled !== undefined) setReferralEnabled(d.referralEnabled); })
      .catch(() => {});
  }, []);

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Utilise mon code de parrainage Amnir : ${user?.referralCode}\nTélécharge l'app et économise 500 MRU sur ta 1ère commande !`,
        title: 'Mon code Amnir',
      });
    } catch {}
  };

  const handleApplyReferral = async () => {
    const code = applyCode.trim().toUpperCase();
    if (!code) return;
    setApplying(true);
    try {
      const { data } = await api.post('/users/apply-referral', { code });
      if (data.success) {
        updateUser(data.user);
        setApplyCode('');
        Alert.alert('🎁', t.ref_apply_success);
      } else {
        Alert.alert('', data.message || t.ref_apply_err);
      }
    } catch (err) {
      Alert.alert('', err.response?.data?.message || t.ref_apply_err);
    } finally { setApplying(false); }
  };

  const rows = [
    { label: t.p_firstname, value: user?.firstName },
    { label: t.p_lastname,  value: user?.lastName  },
    { label: t.p_phone,     value: user?.phone     },
    { label: t.p_role,      value: t.p_client      },
  ];

  const switchLang = async (newLang) => {
    await setLang(newLang);
    I18nManager.forceRTL(newLang === 'ar');
    Alert.alert(t.p_lang_title, t.p_lang_msg, [{ text: t.p_lang_ok }]);
  };

  const handleSaveFav = async (fav) => {
    const ok = await add(fav);
    if (ok) setShowAddModal(false);
  };

  const confirmDelete = (fav) => {
    Alert.alert(fav.name, `Supprimer "${fav.name}" ?`, [
      { text: t.p_fav_cancel, style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => remove(fav._id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Avatar */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.firstName?.[0]}{user?.lastName?.[0]}</Text>
          </View>
          <Text style={[styles.name, rtlText]}>{user?.firstName} {user?.lastName}</Text>
          <Text style={[styles.phone, rtlText]}>{user?.phone}</Text>
        </View>

        {/* Infos */}
        <View style={styles.card}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={[styles.rowValue, rtlText]}>{r.value || '—'}</Text>
            </View>
          ))}
        </View>

        {/* Adresses favorites */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t.p_favs}</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
              <Text style={styles.addBtnTxt}>{t.p_favs_add}</Text>
            </TouchableOpacity>
          </View>

          {favorites.length === 0 ? (
            <Text style={styles.emptyFavs}>{t.p_favs_empty}</Text>
          ) : (
            favorites.map((f, i) => (
              <View key={f._id} style={[styles.favRow, i < favorites.length - 1 && styles.rowBorder]}>
                <Text style={styles.favIcon}>{f.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.favName}>{f.name}</Text>
                  <Text style={styles.favLabel} numberOfLines={1}>{f.label}</Text>
                </View>
                <TouchableOpacity onPress={() => confirmDelete(f)} style={styles.delBtn}>
                  <Text style={{ color: COLORS.red, fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Parrainage — masqué si désactivé par l'admin */}
        {referralEnabled && <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🎁 {t.ref_section}</Text>
            {!!user?.referralCredits && (
              <View style={styles.creditBadge}>
                <Text style={styles.creditBadgeTxt}>{user.referralCredits} MRU</Text>
              </View>
            )}
          </View>

          <View style={{ padding: 14 }}>
            <Text style={[styles.rowLabel, { marginBottom: 6 }]}>{t.ref_your_code}</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{user?.referralCode || '—'}</Text>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareCode}>
                <Text style={styles.shareBtnTxt}>{t.ref_share}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.refStats}>
              <View style={styles.refStat}>
                <Text style={styles.refStatNum}>{user?.referralCredits || 0}</Text>
                <Text style={styles.refStatLbl}>{t.ref_credits}</Text>
              </View>
              <View style={[styles.refStat, { borderLeftWidth: .5, borderLeftColor: COLORS.border }]}>
                <Text style={styles.refStatNum}>{user?.referralCount || 0}</Text>
                <Text style={styles.refStatLbl}>{t.ref_friends}</Text>
              </View>
            </View>

            <Text style={styles.refHow}>{t.ref_how}</Text>

            {!user?.referredBy && (
              <>
                <Text style={[styles.rowLabel, { marginTop: 12, marginBottom: 6 }]}>{t.ref_apply_title}</Text>
                <View style={styles.applyRow}>
                  <TextInput
                    style={styles.applyInp}
                    value={applyCode}
                    onChangeText={v => setApplyCode(v.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
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

        {/* Langue */}
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

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>{t.p_logout}</Text>
        </TouchableOpacity>
      </ScrollView>

      <AddFavoriteModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveFav}
        loading={favLoading}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: COLORS.bg },
  scroll:            { padding: 20 },
  header:            { alignItems: 'center', marginBottom: 24 },
  avatar:            { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText:        { fontSize: 24, fontWeight: '700', color: COLORS.purple },
  name:              { fontSize: 20, fontWeight: '600', color: COLORS.text },
  phone:             { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  card:              { backgroundColor: '#fff', borderRadius: 14, borderWidth: .5, borderColor: COLORS.border, marginBottom: 16, overflow: 'hidden' },
  row:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  rowBorder:         { borderBottomWidth: .5, borderBottomColor: COLORS.border },
  rowLabel:          { fontSize: 13, color: COLORS.muted },
  rowValue:          { fontSize: 13, fontWeight: '500', color: COLORS.text },
  sectionHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: .5, borderBottomColor: COLORS.border },
  sectionTitle:      { fontSize: 13, fontWeight: '600', color: COLORS.text },
  addBtn:            { backgroundColor: COLORS.purpleLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnTxt:         { fontSize: 12, color: COLORS.purple, fontWeight: '600' },
  emptyFavs:         { fontSize: 13, color: COLORS.muted, textAlign: 'center', padding: 20 },
  favRow:            { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  favIcon:           { fontSize: 22 },
  favName:           { fontSize: 13, fontWeight: '600', color: COLORS.text },
  favLabel:          { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  delBtn:            { padding: 4 },
  langRow:           { flexDirection: 'row', gap: 10, padding: 14, paddingTop: 6 },
  langBtn:           { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center', backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  langBtnActive:     { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  langBtnText:       { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  langBtnTextActive: { color: '#fff' },
  logoutBtn:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: .5, borderColor: '#F09595' },
  logoutText:        { fontSize: 14, fontWeight: '600', color: COLORS.red },
  creditBadge:       { backgroundColor: COLORS.purpleLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  creditBadgeTxt:    { fontSize: 12, fontWeight: '700', color: COLORS.purple },
  codeRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  codeText:          { flex: 1, fontSize: 20, fontWeight: '800', color: COLORS.text, letterSpacing: 2, backgroundColor: COLORS.bg, borderRadius: 10, padding: 10, borderWidth: .5, borderColor: COLORS.border, textAlign: 'center' },
  shareBtn:          { backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  shareBtnTxt:       { color: '#fff', fontWeight: '700', fontSize: 13 },
  refStats:          { flexDirection: 'row', borderRadius: 10, borderWidth: .5, borderColor: COLORS.border, overflow: 'hidden', marginBottom: 12 },
  refStat:           { flex: 1, alignItems: 'center', paddingVertical: 12 },
  refStatNum:        { fontSize: 22, fontWeight: '800', color: COLORS.purple },
  refStatLbl:        { fontSize: 10, color: COLORS.muted, marginTop: 2, textAlign: 'center' },
  refHow:            { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 18 },
  applyRow:          { flexDirection: 'row', gap: 8 },
  applyInp:          { flex: 1, borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 11, fontSize: 14, backgroundColor: COLORS.bg, color: COLORS.text, fontWeight: '600', letterSpacing: 1 },
  applyBtn:          { backgroundColor: COLORS.purple, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  applyBtnTxt:       { color: '#fff', fontWeight: '700', fontSize: 13 },
});

const ms = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  card:        { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  title:       { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  iconRow:     { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  iconBtn:     { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.border },
  iconBtnActive:{ borderColor: COLORS.purple, backgroundColor: COLORS.purpleLight },
  inp:         { borderWidth: .5, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12, color: COLORS.text },
  btnRow:      { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel:   { flex: 1, padding: 13, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  btnSave:     { flex: 2, padding: 13, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.purple },
});
