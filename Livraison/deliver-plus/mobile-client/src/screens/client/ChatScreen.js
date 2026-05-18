import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import { io } from 'socket.io-client';
import api from '../../services/api';
import useAuthStore from '../../stores/authStore';
import useLangStore from '../../stores/langStore';
import { translations } from '../../i18n';
import { COLORS, SOCKET_URL } from '../../constants';

const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ChatScreen({ route }) {
  const { orderId } = route.params;
  const { token }   = useAuthStore();
  const { lang }    = useLangStore();
  const t  = translations[lang] || translations.fr;
  const isAr = lang === 'ar';

  const [messages, setMessages] = useState([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);

  // Enregistrement vocal
  const [recState, setRecState] = useState('idle'); // idle | recording | sending
  const [recSec, setRecSec]     = useState(0);
  const recRef      = useRef(null);
  const recSecRef   = useRef(0);
  const recTimerRef = useRef(null);

  // Lecture audio
  const [playingId, setPlayingId]       = useState(null);
  const [playProgress, setPlayProgress] = useState({});
  const soundRef = useRef(null);

  const socketRef = useRef(null);
  const listRef   = useRef(null);

  useEffect(() => {
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
      stopPlayback();
    };
  }, [orderId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [loading]);

  // ─── Texte ─────────────────────────────────────────────────────────────────
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

  // ─── Enregistrement ────────────────────────────────────────────────────────
  const startRec = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          t.voice_perm_title || 'Permission refusée',
          t.voice_perm_msg   || 'Autorisez le microphone dans les paramètres.'
        );
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

  // ─── Lecture ───────────────────────────────────────────────────────────────
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

  // ─── Rendu d'un message ────────────────────────────────────────────────────
  const renderMsg = ({ item }) => {
    const isMe     = item.senderRole === 'client';
    const time     = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isPlaying = playingId === item._id;
    const progress  = playProgress[item._id] || 0;
    const dur       = item.audioDuration || 0;

    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && <Text style={styles.senderName}>{item.senderName || t.chat_driver}</Text>}

        {item.messageType === 'audio' ? (
          <TouchableOpacity onPress={() => playAudio(item)} style={styles.audioRow} activeOpacity={0.75}>
            <Text style={[styles.playIcon, isMe && { color: '#fff' }]}>{isPlaying ? '⏸' : '▶'}</Text>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <View style={[styles.progressTrack, isMe && styles.progressTrackMe]}>
                <View style={[styles.progressFill, isMe && styles.progressFillMe, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={[styles.audioDur, isMe && { color: 'rgba(255,255,255,0.7)' }]}>
                {isPlaying ? fmtSec(Math.round(progress * dur)) : fmtSec(dur)}
              </Text>
            </View>
            <Text style={{ fontSize: 16 }}>🎤</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
        )}

        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{time}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.purple} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m._id?.toString() || Math.random().toString()}
          renderItem={renderMsg}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>{t.chat_empty}</Text>
            </View>
          }
        />

        {/* Zone de saisie / enregistrement */}
        {recState !== 'idle' ? (
          <View style={styles.inputRow}>
            {recState === 'sending' ? (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <ActivityIndicator color={COLORS.purple} size="small" />
                <Text style={{ color: COLORS.muted, fontSize: 13 }}>{t.voice_sending || 'Envoi...'}</Text>
              </View>
            ) : (
              <>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.recDot} />
                  <Text style={{ color: COLORS.red, fontWeight: '700', fontSize: 15 }}>{fmtSec(recSec)}</Text>
                  <Text style={{ color: COLORS.muted, fontSize: 12 }}>{t.voice_recording || 'Enregistrement...'}</Text>
                </View>
                <TouchableOpacity onPress={() => stopRec(false)} style={styles.recCancelBtn}>
                  <Text style={{ color: COLORS.muted, fontWeight: '700', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => stopRec(true)} style={styles.recSendBtn}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>✓</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.inputRow, isAr && { flexDirection: 'row-reverse' }]}>
            <TextInput
              style={[styles.input, isAr && { textAlign: 'right' }]}
              value={text}
              onChangeText={setText}
              placeholder={t.chat_placeholder}
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={500}
              onSubmitEditing={send}
              blurOnSubmit={false}
            />
            {text.trim() ? (
              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={send}
                disabled={sending}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.sendIcon}>➤</Text>
                }
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.micBtn} onPress={startRec}>
                <Text style={styles.micIcon}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: COLORS.bg },
  center:           { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:             { padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon:        { fontSize: 48, marginBottom: 12 },
  emptyText:        { fontSize: 14, color: COLORS.muted, textAlign: 'center' },
  // Bulles
  bubble:           { maxWidth: '75%', borderRadius: 16, padding: 10, marginBottom: 8 },
  bubbleMe:         { alignSelf: 'flex-end', backgroundColor: COLORS.purple, borderBottomRightRadius: 4 },
  bubbleThem:       { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: .5, borderColor: COLORS.border },
  senderName:       { fontSize: 10, fontWeight: '700', color: COLORS.purple, marginBottom: 3 },
  bubbleText:       { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  bubbleTextMe:     { color: '#fff' },
  bubbleTime:       { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMe:     { color: 'rgba(255,255,255,0.7)' },
  // Bulle audio
  audioRow:         { flexDirection: 'row', alignItems: 'center', minWidth: 160 },
  playIcon:         { fontSize: 18, color: COLORS.text },
  progressTrack:    { height: 3, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 2, overflow: 'hidden' },
  progressTrackMe:  { backgroundColor: 'rgba(255,255,255,0.3)' },
  progressFill:     { height: '100%', backgroundColor: COLORS.muted, borderRadius: 2 },
  progressFillMe:   { backgroundColor: '#fff' },
  audioDur:         { fontSize: 10, color: COLORS.muted, marginTop: 3 },
  // Saisie
  inputRow:         { flexDirection: 'row', alignItems: 'flex-end', padding: 10, backgroundColor: '#fff', borderTopWidth: .5, borderTopColor: COLORS.border, gap: 8 },
  input:            { flex: 1, minHeight: 40, maxHeight: 100, borderWidth: .5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, color: COLORS.text, backgroundColor: COLORS.bg },
  sendBtn:          { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.purple, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:  { backgroundColor: '#C4C0E4' },
  sendIcon:         { color: '#fff', fontSize: 16 },
  micBtn:           { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.purpleLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.purple },
  micIcon:          { fontSize: 18 },
  // Enregistrement
  recDot:           { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.red },
  recCancelBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  recSendBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
});
