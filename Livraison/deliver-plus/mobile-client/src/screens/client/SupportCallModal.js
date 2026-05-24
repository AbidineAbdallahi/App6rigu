import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
const setAudioModeAsync = Audio.setAudioModeAsync.bind(Audio);
let InCallManager = null;
try { InCallManager = require('react-native-incall-manager').default; } catch {}
import { COLORS } from '../../constants';

let RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices;
let webrtcAvailable = false;
let webrtcLoadError = null;
try {
  const w = require('react-native-webrtc');
  RTCPeerConnection     = w.RTCPeerConnection;
  RTCSessionDescription = w.RTCSessionDescription;
  RTCIceCandidate       = w.RTCIceCandidate;
  mediaDevices          = w.mediaDevices;
  if (!RTCPeerConnection || !mediaDevices) throw new Error('Module chargé mais classes manquantes');
  webrtcAvailable       = true;
} catch (e) {
  webrtcLoadError = e?.message || String(e);
  console.error('[WebRTC] Échec chargement:', webrtcLoadError);
}

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const fmtSec = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function SupportCallModal({ visible, callerName, callerType = 'driver', socketRef, onClose }) {
  const [state, setState]       = useState('requesting');
  const [queuePos, setQueuePos] = useState(0);
  const [muted, setMuted]       = useState(false);
  const [speaker, setSpeaker]   = useState(false);
  const [callSec, setCallSec]   = useState(0);
  const [error, setError]       = useState(null);

  const agentSocketIdRef  = useRef(null);
  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const timerRef          = useRef(null);
  const iceCandidateQueue = useRef([]);

  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const op1   = useRef(new Animated.Value(0.4)).current;
  const op2   = useRef(new Animated.Value(0.4)).current;
  const op3   = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulsing = ['requesting', 'queued', 'ringing', 'connecting'].includes(state);
    if (!pulsing) {
      ring1.setValue(1); ring2.setValue(1); ring3.setValue(1);
      op1.setValue(0); op2.setValue(0); op3.setValue(0);
      return;
    }
    const makeAnim = (scale, opacity, delay) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 2.0, duration: 1800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0,   duration: 1800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
        ]),
      ]));
    op1.setValue(0.4); op2.setValue(0.4); op3.setValue(0.4);
    const a1 = makeAnim(ring1, op1, 0);
    const a2 = makeAnim(ring2, op2, 600);
    const a3 = makeAnim(ring3, op3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [state]);

  // Initialiser et envoyer la demande quand visible
  useEffect(() => {
    if (!visible) { cleanup(); return; }
    setState('requesting');
    setQueuePos(0);
    setMuted(false);
    setSpeaker(false);
    setCallSec(0);
    setError(null);
    iceCandidateQueue.current = [];
    agentSocketIdRef.current  = null;
    setTimeout(() => {
      socketRef.current?.emit('support_call_request', {
        callerName: callerName || 'Utilisateur',
        callerType,
      });
    }, 300);
  }, [visible]);

  // Écouter les événements socket support
  useEffect(() => {
    if (!visible || !socketRef?.current) return;
    const socket = socketRef.current;

    const onQueued = ({ position }) => {
      setQueuePos(position);
      setState('queued');
    };
    const onPosition = ({ position }) => setQueuePos(position);

    const onConnecting = ({ agentSocketId }) => {
      agentSocketIdRef.current = agentSocketId;
      setState('ringing');
    };

    const onAccepted = ({ agentSocketId }) => {
      agentSocketIdRef.current = agentSocketId;
      setState('connecting');
      startWebRTC();
    };

    const onAnswer = async ({ sdp }) => {
      try {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
        for (const c of iceCandidateQueue.current) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }
        iceCandidateQueue.current = [];
      } catch {}
    };

    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current?.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else {
        iceCandidateQueue.current.push(candidate);
      }
    };

    const onEnded = () => endCall(false);

    socket.on('support_call_queued',     onQueued);
    socket.on('support_queue_position',  onPosition);
    socket.on('support_call_connecting', onConnecting);
    socket.on('support_call_accepted',   onAccepted);
    socket.on('support_call_ended',      onEnded);
    socket.on('webrtc_answer',           onAnswer);
    socket.on('webrtc_ice',              onIce);

    return () => {
      socket.off('support_call_queued',     onQueued);
      socket.off('support_queue_position',  onPosition);
      socket.off('support_call_connecting', onConnecting);
      socket.off('support_call_accepted',   onAccepted);
      socket.off('support_call_ended',      onEnded);
      socket.off('webrtc_answer',           onAnswer);
      socket.off('webrtc_ice',              onIce);
    };
  }, [visible]);

  const startWebRTC = async () => {
    if (!webrtcAvailable) {
      setError(`WebRTC indisponible${webrtcLoadError ? ': ' + webrtcLoadError : ''}`);
      setTimeout(() => endCall(true), 4000);
      return;
    }
    try {
      await setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socketRef.current?.emit('webrtc_ice', {
            candidate,
            targetSocketId: agentSocketIdRef.current,
          });
        }
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          setError('Connexion audio interrompue. Vérifiez votre réseau.');
          endCall(true);
        }
      };
      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          setError(null);
          setState('active');
          startTimer();
          InCallManager?.start({ media: 'audio' });
          InCallManager?.setProximitySensorEnabled(true);
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc_offer', {
        sdp: offer,
        targetSocketId: agentSocketIdRef.current,
      });
    } catch (err) {
      const msg = err?.message?.includes('Permission')
        ? 'Permission micro refusée. Autorisez le micro dans les paramètres.'
        : 'Impossible d\'établir la connexion vocale.';
      setError(msg);
      setTimeout(() => endCall(true), 2500);
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setCallSec(s => s + 1), 1000);
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    localStreamRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    iceCandidateQueue.current = [];
    try { InCallManager?.stop(); } catch {}
    try {
      setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {}
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    InCallManager?.setSpeakerphoneOn(next);
    setSpeaker(next);
  };

  const endCall = (notify = true) => {
    if (notify) {
      socketRef.current?.emit('support_call_ended', {
        peerSocketId: agentSocketIdRef.current,
      });
    }
    socketRef.current?.emit('support_call_cancel');
    cleanup();
    setState('ended');
    onClose?.();
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  if (!visible) return null;

  const isActive = state === 'active';

  const statusLabel = () => {
    if (state === 'requesting')  return 'Connexion...';
    if (state === 'queued')      return `Position : ${queuePos}`;
    if (state === 'ringing')     return 'Agent trouvé...';
    if (state === 'connecting')  return 'Connexion...';
    if (state === 'active')      return fmtSec(callSec);
    return '';
  };

  const statusSub = () => {
    if (state === 'requesting')  return 'Recherche d\'un agent disponible...';
    if (state === 'queued')      return 'Tous les agents sont occupés.\nVeuillez patienter, vous serez connecté automatiquement.';
    if (state === 'ringing')     return 'Un agent va vous répondre...';
    if (state === 'connecting')  return 'Établissement de la liaison vocale...';
    if (state === 'active')      return 'Appel avec le support';
    return '';
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.bg}>
        <View style={styles.bubble1} />
        <View style={styles.bubble2} />

        <SafeAreaView style={styles.safe}>

          {/* Badge en-tête */}
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>🎧  Centre d'appel · Support</Text>
          </View>

          {/* Avatar avec anneaux pulsants */}
          <View style={styles.avatarSection}>
            <Animated.View style={[styles.ring, styles.ring3, { transform: [{ scale: ring3 }], opacity: op3 }]} />
            <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: ring2 }], opacity: op2 }]} />
            <Animated.View style={[styles.ring, styles.ring1, { transform: [{ scale: ring1 }], opacity: op1 }]} />
            <View style={[styles.avatarOuter, isActive && styles.avatarOuterActive]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarIcon}>🎧</Text>
              </View>
            </View>
            {isActive && <View style={styles.activeDot} />}
          </View>

          {/* Nom + statut */}
          <View style={styles.nameBlock}>
            <Text style={styles.peerName}>Support Amnir</Text>
            <Text style={[styles.statusLabel, isActive && styles.statusLabelActive]}>
              {statusLabel()}
            </Text>
            <Text style={styles.statusSub}>{statusSub()}</Text>
          </View>

          {/* Erreur */}
          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorTxt}>⚠️ {error}</Text>
            </View>
          )}

          {/* File d'attente */}
          {state === 'queued' && (
            <View style={styles.queueCard}>
              <Text style={styles.queueNum}>{queuePos}</Text>
              <Text style={styles.queueTxt}>
                {queuePos <= 1 ? 'personne avant vous' : 'personnes avant vous'}
              </Text>
            </View>
          )}

          {/* Boutons */}
          <View style={styles.btnRow}>
            {isActive ? (
              <>
                <View style={styles.btnBlock}>
                  <TouchableOpacity
                    style={[styles.circleBtn, styles.circleBtnGhost, muted && styles.circleBtnAmber]}
                    onPress={toggleMute}
                  >
                    <Text style={styles.circleBtnIcon}>{muted ? '🔇' : '🎙️'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.circleLabel}>{muted ? 'Muet' : 'Micro'}</Text>
                </View>
                <View style={styles.btnBlock}>
                  <TouchableOpacity
                    style={[styles.circleBtn, styles.circleBtnGhost, speaker && styles.circleBtnBlue]}
                    onPress={toggleSpeaker}
                  >
                    <Text style={styles.circleBtnIcon}>{speaker ? '🔊' : '🔈'}</Text>
                  </TouchableOpacity>
                  <Text style={styles.circleLabel}>{speaker ? 'HP actif' : 'Haut-parleur'}</Text>
                </View>
                <View style={styles.btnBlock}>
                  <TouchableOpacity style={[styles.circleBtn, styles.circleBtnRed]} onPress={() => endCall()}>
                    <Text style={styles.circleBtnIcon}>📵</Text>
                  </TouchableOpacity>
                  <Text style={styles.circleLabel}>Raccrocher</Text>
                </View>
              </>
            ) : (
              <View style={styles.btnBlock}>
                <TouchableOpacity style={[styles.circleBtn, styles.circleBtnRed]} onPress={() => endCall()}>
                  <Text style={styles.circleBtnIcon}>📵</Text>
                </TouchableOpacity>
                <Text style={styles.circleLabel}>
                  {state === 'queued' ? 'Quitter la file' : 'Annuler'}
                </Text>
              </View>
            )}
          </View>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

const AVATAR_SIZE = 120;
const RING_BASE   = AVATAR_SIZE + 28;

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#0E0C2A',
    overflow: 'hidden',
  },
  bubble1: {
    position: 'absolute', width: 340, height: 340, borderRadius: 170,
    backgroundColor: 'rgba(83,74,183,0.25)', top: -100, right: -80,
  },
  bubble2: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(83,74,183,0.15)', bottom: 80, left: -60,
  },
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 32,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeTxt: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: RING_BASE * 2.2,
    height: RING_BASE * 2.2,
  },
  ring: {
    position: 'absolute',
    width: RING_BASE * 2,
    height: RING_BASE * 2,
    borderRadius: RING_BASE,
    backgroundColor: 'rgba(83,74,183,0.4)',
  },
  ring1: {
    width: RING_BASE * 1.6,
    height: RING_BASE * 1.6,
    borderRadius: RING_BASE * 0.8,
    backgroundColor: 'rgba(83,74,183,0.5)',
  },
  ring2: {
    width: RING_BASE * 1.3,
    height: RING_BASE * 1.3,
    borderRadius: RING_BASE * 0.65,
    backgroundColor: 'rgba(83,74,183,0.6)',
  },
  ring3: {
    width: RING_BASE * 2,
    height: RING_BASE * 2,
    borderRadius: RING_BASE,
    backgroundColor: 'rgba(83,74,183,0.3)',
  },
  avatarOuter: {
    width: AVATAR_SIZE + 12,
    height: AVATAR_SIZE + 12,
    borderRadius: (AVATAR_SIZE + 12) / 2,
    backgroundColor: 'rgba(83,74,183,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(83,74,183,0.6)',
  },
  avatarOuterActive: {
    borderColor: '#5ADA9E',
    backgroundColor: 'rgba(90,218,158,0.15)',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: COLORS.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 52 },
  activeDot: {
    position: 'absolute',
    bottom: RING_BASE * 0.25,
    right: RING_BASE * 0.35,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#5ADA9E',
    borderWidth: 3,
    borderColor: '#0E0C2A',
  },
  nameBlock: {
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 24,
  },
  peerName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  statusLabelActive: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5ADA9E',
    letterSpacing: 2,
  },
  statusSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 19,
  },
  queueCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    paddingHorizontal: 40,
    paddingVertical: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  queueNum: {
    fontSize: 56,
    fontWeight: '900',
    color: '#FBBF24',
    lineHeight: 60,
  },
  queueTxt: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 8,
  },
  btnBlock: { alignItems: 'center', gap: 10 },
  circleBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  circleBtnIcon: { fontSize: 30 },
  circleLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  errorCard: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.4)',
  },
  errorTxt: {
    color: '#E74C3C',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  circleBtnBlue:  { backgroundColor: '#185FA5', borderWidth: 0 },
  circleBtnRed:   { backgroundColor: '#E74C3C' },
  circleBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  circleBtnAmber: { backgroundColor: '#E67E22', borderWidth: 0 },
});
