import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Modal,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Alert, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { io } from 'socket.io-client';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SOCKET_URL } from '../../constants';

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function DriverChatModal({ visible, orderId, onClose }) {
  const { token }  = useAuthStore();
  const { lang }   = useLangStore();
  const t          = translations[lang] || translations.fr;
  const isAr       = lang === 'ar';
  const insets     = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);

  const [recState, setRecState] = useState('idle');
  const [recSec, setRecSec]     = useState(0);
  const recRef      = useRef(null);
  const recSecRef   = useRef(0);
  const recTimerRef = useRef(null);
  const recPulse    = useRef(new Animated.Value(1)).current;

  const [playingId, setPlayingId]       = useState(null);
  const [playProgress, setPlayProgress] = useState({});
  const soundRef = useRef(null);

  const socketRef = useRef(null);
  const listRef   = useRef(null);

  // Animation de pulsation pour l'enregistrement
  useEffect(() => {
    if (recState === 'recording') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(recPulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(recPulse, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      recPulse.setValue(1);
    }
  }, [recState]);

  useEffect(() => {
    if (!visible || !orderId) return;
    setLoading(true);
    api.get(`/messages/${orderId}`)
      .then(r => setMessages(r.data.messages || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;
    socket.emit('join_order_chat', orderId);
    socket.on('chat_message', (msg) => {
      setMessages(prev => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      stopPlayback();
    };
  }, [visible, orderId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [loading]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText('');
    try {
      await api.post(`/messages/${orderId}`, { text: trimmed });
    } catch {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const startRec = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(t.voice_perm_title || 'Permission refusée', t.voice_perm_msg || 'Autorisez le microphone dans les paramètres.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recRef.current    = rec;
      recSecRef.current = 0;
      setRecSec(0);
      setRecState('recording');
      recTimerRef.current = setInterval(() => {
        recSecRef.current += 1;
        setRecSec(s => s + 1);
      }, 1000);
    } catch (e) {
      Alert.alert('Erreur', e.message);
    }
  };

  const stopRec = async (sendIt = true) => {
    clearInterval(recTimerRef.current);
    const duration = recSecRef.current;
    if (!recRef.current) { setRecState('idle'); setRecSec(0); return; }
    const uri = recRef.current.getURI();
    try { await recRef.current.stopAndUnloadAsync(); } catch {}
    recRef.current = null;
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch {}
    if (sendIt && uri && duration > 0) {
      setRecState('sending');
      try {
        const form = new FormData();
        form.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' });
        form.append('duration', String(duration));
        await api.post(`/messages/${orderId}/audio`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } catch {}
    }
    setRecState('idle');
    setRecSec(0);
    recSecRef.current = 0;
  };

  const stopPlayback = async () => {
    try { await soundRef.current?.stopAsync(); await soundRef.current?.unloadAsync(); } catch {}
    soundRef.current = null;
    setPlayingId(null);
  };

  const playAudio = async (msg) => {
    if (playingId === msg._id) { await stopPlayback(); return; }
    await stopPlayback();
    const url = msg.audioUrl?.startsWith('http') ? msg.audioUrl : `${SOCKET_URL}${msg.audioUrl}`;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          const prog = status.durationMillis > 0 ? status.positionMillis / status.durationMillis : 0;
          setPlayProgress(p => ({ ...p, [msg._id]: prog }));
          if (status.didJustFinish) { soundRef.current = null; setPlayingId(null); }
        }
      );
      soundRef.current = sound;
      setPlayingId(msg._id);
    } catch {}
  };

  const renderMsg = ({ item }) => {
    const isMe      = item.senderRole === 'driver';
    const time      = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPlaying = playingId === item._id;
    const progress  = playProgress[item._id] || 0;
    const dur       = item.audioDuration || 0;

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe && (
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>{(item.senderName || 'C')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ maxWidth: '75%' }}>
          {!isMe && <Text style={styles.senderName}>{item.senderName || t.chat_client}</Text>}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            {item.messageType === 'audio' ? (
              <TouchableOpacity onPress={() => playAudio(item)} style={styles.audioRow} activeOpacity={0.75}>
                <View style={[styles.playBtn, isMe ? styles.playBtnMe : styles.playBtnThem]}>
                  <Text style={{ fontSize: 13, color: isMe ? COLORS.purple : '#fff' }}>
                    {isPlaying ? '⏸' : '▶'}
                  </Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <View style={[styles.waveTrack, isMe && styles.waveTrackMe]}>
                    <View style={[styles.waveFill, isMe && styles.waveFillMe, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                  <Text style={[styles.audioDur, isMe && { color: 'rgba(255,255,255,0.65)' }]}>
                    {isPlaying ? fmtSec(Math.round(progress * dur)) : fmtSec(dur)}
                  </Text>
                </View>
                <Text style={{ fontSize: 14 }}>🎤</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.bubbleTxt, isMe && styles.bubbleTxtMe]}>{item.text}</Text>
            )}
          </View>
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>{time}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── HEADER ─────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerAvatar}>
              <Text style={{ fontSize: 18 }}>💬</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>{t.chat_title || 'Chat'}</Text>
              <Text style={styles.headerSub}>Commande #{orderId?.slice(-6).toUpperCase()}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnTxt}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.purple} size="large" />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m._id?.toString() || Math.random().toString()}
              renderItem={renderMsg}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>💬</Text>
                  <Text style={styles.emptyTitle}>{t.chat_empty}</Text>
                  <Text style={styles.emptySub}>Les messages apparaîtront ici</Text>
                </View>
              }
            />
          )}

          {/* ── BARRE DE SAISIE ──────────────────────────── */}
          {recState !== 'idle' ? (
            <View style={[styles.inputBar, { paddingBottom: insets.bottom || 8 }]}>
              {recState === 'sending' ? (
                <View style={styles.sendingRow}>
                  <ActivityIndicator color={COLORS.purple} size="small" />
                  <Text style={styles.sendingTxt}>{t.voice_sending || 'Envoi du message vocal…'}</Text>
                </View>
              ) : (
                <View style={styles.recordingRow}>
                  <Animated.View style={[styles.recDotWrap, { transform: [{ scale: recPulse }] }]}>
                    <View style={styles.recDot} />
                  </Animated.View>
                  <Text style={styles.recTimer}>{fmtSec(recSec)}</Text>
                  <Text style={styles.recLabel}>{t.voice_recording || 'Enregistrement…'}</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => stopRec(false)} style={styles.recCancelBtn}>
                    <Text style={{ color: COLORS.muted, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => stopRec(true)} style={styles.recSendBtn}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.inputBar, isAr && { flexDirection: 'row-reverse' }, { paddingBottom: insets.bottom || 8 }]}>
              <TextInput
                style={[styles.input, isAr && { textAlign: 'right' }]}
                value={text}
                onChangeText={setText}
                placeholder={t.chat_placeholder || 'Écrire un message…'}
                placeholderTextColor="#A8A8C0"
                multiline
                maxLength={500}
              />
              {text.trim() ? (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.sendBtn, sending && { opacity: 0.5 }]}
                  onPress={send}
                  disabled={sending}
                >
                  {sending
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.sendIcon}>➤</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.actionBtn, styles.micBtn]} onPress={startRec}>
                  <Text style={{ fontSize: 18 }}>🎤</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F2FA' },

  /* Header */
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEEDFE' },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 16, fontWeight: '800', color: '#1A1A2E' },
  headerSub:    { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  closeBtn:     { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F2FA', alignItems: 'center', justifyContent: 'center' },
  closeBtnTxt:  { fontSize: 13, color: COLORS.muted, fontWeight: '700' },

  /* Messages */
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon:  { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  emptySub:   { fontSize: 13, color: COLORS.muted },

  msgRow:     { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 8 },
  msgRowMe:   { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  avatar:    { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt: { fontSize: 13, fontWeight: '700', color: COLORS.purple },

  senderName: { fontSize: 10, fontWeight: '700', color: COLORS.purple, marginBottom: 3, marginLeft: 2 },

  bubble:     { borderRadius: 18, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  bubbleMe:   { backgroundColor: COLORS.purple, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleTxt:   { fontSize: 14, color: '#1A1A2E', lineHeight: 20 },
  bubbleTxtMe: { color: '#fff' },

  bubbleTime:     { fontSize: 10, marginTop: 3 },
  bubbleTimeMe:   { color: COLORS.muted, textAlign: 'right', marginRight: 2 },
  bubbleTimeThem: { color: COLORS.muted, marginLeft: 2 },

  /* Audio bubble */
  audioRow:      { flexDirection: 'row', alignItems: 'center', minWidth: 170 },
  playBtn:       { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  playBtnMe:     { backgroundColor: 'rgba(255,255,255,0.9)' },
  playBtnThem:   { backgroundColor: COLORS.purple },
  waveTrack:     { height: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 4 },
  waveTrackMe:   { backgroundColor: 'rgba(255,255,255,0.3)' },
  waveFill:      { height: '100%', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 2 },
  waveFillMe:    { backgroundColor: 'rgba(255,255,255,0.9)' },
  audioDur:      { fontSize: 10, color: COLORS.muted },

  /* Input bar */
  inputBar:     { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#EEEDFE', gap: 8 },
  input:        { flex: 1, minHeight: 42, maxHeight: 110, borderWidth: 1.5, borderColor: '#EEEDFE', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9, fontSize: 14, color: '#1A1A2E', backgroundColor: '#F8F7FF', lineHeight: 20 },
  actionBtn:    { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtn:      { backgroundColor: COLORS.purple },
  sendIcon:     { color: '#fff', fontSize: 16 },
  micBtn:       { backgroundColor: COLORS.purpleLight, borderWidth: 1.5, borderColor: COLORS.purple + '50' },

  /* Recording */
  sendingRow:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 10 },
  sendingTxt:   { color: COLORS.muted, fontSize: 13, fontWeight: '500' },
  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  recDotWrap:   { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  recDot:       { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.red },
  recTimer:     { fontSize: 16, fontWeight: '800', color: COLORS.red, minWidth: 44 },
  recLabel:     { fontSize: 12, color: COLORS.muted },
  recCancelBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F2FA', borderWidth: 1, borderColor: '#EEEDFE', alignItems: 'center', justifyContent: 'center' },
  recSendBtn:   { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
});
