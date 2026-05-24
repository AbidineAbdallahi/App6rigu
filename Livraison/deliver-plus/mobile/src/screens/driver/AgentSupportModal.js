import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
const setAudioModeAsync = Audio.setAudioModeAsync.bind(Audio);
import { COLORS } from '../../constants';

let RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices;
let webrtcAvailable = false;
try {
  const w = require('react-native-webrtc');
  RTCPeerConnection     = w.RTCPeerConnection;
  RTCSessionDescription = w.RTCSessionDescription;
  RTCIceCandidate       = w.RTCIceCandidate;
  mediaDevices          = w.mediaDevices;
  webrtcAvailable       = true;
} catch {}

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

// AgentSupportModal — à intégrer dans l'interface agent/admin.
// Utilisation :
//   <AgentSupportModal socketRef={socketRef} agentName="Ahmed" />
//
// L'agent doit émettre 'agent_available' pour commencer à recevoir des appels.
// Ce composant gère automatiquement la réception et la fin des appels.
export default function AgentSupportModal({ socketRef, agentName = 'Agent' }) {
  const [visible, setVisible]     = useState(false);
  const [state, setState]         = useState('ringing');
  const [callerName, setCallerName] = useState('');
  const [callerType, setCallerType] = useState('');
  const [muted, setMuted]         = useState(false);
  const [callSec, setCallSec]     = useState(0);

  const callerSocketIdRef = useRef(null);
  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const timerRef          = useRef(null);
  const iceCandidateQueue = useRef([]);

  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const op1   = useRef(new Animated.Value(0.5)).current;
  const op2   = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (state !== 'ringing') {
      ring1.setValue(1); ring2.setValue(1);
      op1.setValue(0); op2.setValue(0);
      return;
    }
    op1.setValue(0.5); op2.setValue(0.4);
    const a1 = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(ring1, { toValue: 2.0, duration: 1800, useNativeDriver: true }),
        Animated.timing(op1,   { toValue: 0,   duration: 1800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ring1, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(op1,   { toValue: 0.5, duration: 0, useNativeDriver: true }),
      ]),
    ]));
    const a2 = Animated.loop(Animated.sequence([
      Animated.delay(600),
      Animated.parallel([
        Animated.timing(ring2, { toValue: 2.0, duration: 1800, useNativeDriver: true }),
        Animated.timing(op2,   { toValue: 0,   duration: 1800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(ring2, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(op2,   { toValue: 0.4, duration: 0, useNativeDriver: true }),
      ]),
    ]));
    a1.start(); a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, [state]);

  // Écouter les événements socket support (côté agent)
  useEffect(() => {
    if (!socketRef?.current) return;
    const socket = socketRef.current;

    const onIncoming = ({ callerSocketId, callerName: name, callerType: type }) => {
      callerSocketIdRef.current = callerSocketId;
      setCallerName(name || 'Utilisateur');
      setCallerType(type || 'client');
      setMuted(false);
      setCallSec(0);
      iceCandidateQueue.current = [];
      setState('ringing');
      setVisible(true);
    };

    const onOffer = async ({ sdp, fromSocketId }) => {
      callerSocketIdRef.current = fromSocketId;
      setState('connecting');
      await handleOffer(sdp, fromSocketId);
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

    socket.on('support_call_incoming', onIncoming);
    socket.on('webrtc_offer',          onOffer);
    socket.on('webrtc_ice',            onIce);
    socket.on('support_call_ended',    onEnded);

    return () => {
      socket.off('support_call_incoming', onIncoming);
      socket.off('webrtc_offer',          onOffer);
      socket.off('webrtc_ice',            onIce);
      socket.off('support_call_ended',    onEnded);
    };
  }, [socketRef?.current]);

  const handleOffer = async (sdp, fromSocketId) => {
    if (!webrtcAvailable) {
      setState('active');
      startTimer();
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
            targetSocketId: fromSocketId,
          });
        }
      };
      pc.ontrack = () => {
        setState('active');
        startTimer();
      };
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      for (const c of iceCandidateQueue.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      iceCandidateQueue.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('webrtc_answer', { sdp: answer, targetSocketId: fromSocketId });
    } catch {
      endCall(true);
    }
  };

  const acceptCall = () => {
    socketRef.current?.emit('support_call_accepted', {
      callerSocketId: callerSocketIdRef.current,
    });
  };

  const rejectCall = () => {
    socketRef.current?.emit('support_call_ended', {
      peerSocketId: callerSocketIdRef.current,
    });
    // Redevenir disponible
    socketRef.current?.emit('agent_available', { agentName });
    cleanup();
    setVisible(false);
  };

  const endCall = (notify = true) => {
    if (notify && callerSocketIdRef.current) {
      socketRef.current?.emit('support_call_ended', {
        peerSocketId: callerSocketIdRef.current,
      });
    }
    cleanup();
    setState('ringing');
    setVisible(false);
    // L'agent redevient disponible automatiquement (backend gère via support_call_ended)
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
    try {
      setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {}
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  if (!visible) return null;

  const isActive   = state === 'active';
  const isRinging  = state === 'ringing';
  const isConnecting = state === 'connecting';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.bg}>
        <View style={styles.bubble1} />
        <SafeAreaView style={styles.safe}>

          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>🎧  Appel entrant · Support</Text>
          </View>

          <View style={styles.avatarSection}>
            <Animated.View style={[styles.ring, styles.ringOuter, { transform: [{ scale: ring2 }], opacity: op2 }]} />
            <Animated.View style={[styles.ring, styles.ringInner, { transform: [{ scale: ring1 }], opacity: op1 }]} />
            <View style={[styles.avatarOuter, isActive && styles.avatarOuterActive]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarIcon}>
                  {callerType === 'driver' ? '🛵' : '👤'}
                </Text>
              </View>
            </View>
            {isActive && <View style={styles.activeDot} />}
          </View>

          <View style={styles.nameBlock}>
            <Text style={styles.peerName}>{callerName}</Text>
            <Text style={styles.callerTypeBadge}>
              {callerType === 'driver' ? 'Livreur' : 'Client'}
            </Text>
            <Text style={[styles.statusLabel, isActive && styles.statusLabelActive]}>
              {isRinging    ? 'Appel entrant'         : ''}
              {isConnecting ? 'Connexion...'           : ''}
              {isActive     ? fmtSec(callSec)          : ''}
            </Text>
            <Text style={styles.statusSub}>
              {isRinging    ? 'Voulez-vous répondre ?' : ''}
              {isConnecting ? 'Établissement...'       : ''}
              {isActive     ? 'Appel vocal en cours'   : ''}
            </Text>
          </View>

          <View style={styles.btnRow}>
            {isRinging ? (
              <>
                <View style={styles.btnBlock}>
                  <TouchableOpacity style={[styles.circleBtn, styles.circleBtnRed]} onPress={rejectCall}>
                    <Text style={styles.circleBtnIcon}>📵</Text>
                  </TouchableOpacity>
                  <Text style={styles.circleLabel}>Refuser</Text>
                </View>
                <View style={styles.btnBlock}>
                  <TouchableOpacity style={[styles.circleBtn, styles.circleBtnGreen]} onPress={acceptCall}>
                    <Text style={styles.circleBtnIcon}>📞</Text>
                  </TouchableOpacity>
                  <Text style={styles.circleLabel}>Répondre</Text>
                </View>
              </>
            ) : isActive ? (
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
                <Text style={styles.circleLabel}>Annuler</Text>
              </View>
            )}
          </View>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

const AVATAR_SIZE = 110;
const RING_BASE   = AVATAR_SIZE + 28;

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0A0A1E', overflow: 'hidden' },
  bubble1: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(39,174,96,0.12)', top: -60, right: -60,
  },
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 32,
  },
  badge: {
    backgroundColor: 'rgba(39,174,96,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(39,174,96,0.25)',
  },
  badgeTxt: { color: '#5ADA9E', fontSize: 13, fontWeight: '600' },
  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
    width: RING_BASE * 2.2,
    height: RING_BASE * 2.2,
  },
  ring: {
    position: 'absolute',
    borderRadius: RING_BASE,
  },
  ringOuter: {
    width: RING_BASE * 2, height: RING_BASE * 2,
    backgroundColor: 'rgba(39,174,96,0.25)',
  },
  ringInner: {
    width: RING_BASE * 1.5, height: RING_BASE * 1.5,
    borderRadius: RING_BASE * 0.75,
    backgroundColor: 'rgba(39,174,96,0.35)',
  },
  avatarOuter: {
    width: AVATAR_SIZE + 12,
    height: AVATAR_SIZE + 12,
    borderRadius: (AVATAR_SIZE + 12) / 2,
    backgroundColor: 'rgba(39,174,96,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(39,174,96,0.5)',
  },
  avatarOuterActive: {
    borderColor: '#5ADA9E',
    backgroundColor: 'rgba(90,218,158,0.15)',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#1A3A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 48 },
  activeDot: {
    position: 'absolute',
    bottom: RING_BASE * 0.25,
    right: RING_BASE * 0.35,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#5ADA9E',
    borderWidth: 3,
    borderColor: '#0A0A1E',
  },
  nameBlock: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  peerName: { fontSize: 28, fontWeight: '800', color: '#fff' },
  callerTypeBadge: {
    fontSize: 12,
    color: '#5ADA9E',
    fontWeight: '700',
    backgroundColor: 'rgba(90,218,158,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statusLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
  },
  statusLabelActive: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5ADA9E',
    letterSpacing: 2,
  },
  statusSub: { fontSize: 13, color: 'rgba(255,255,255,0.3)' },
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
  circleLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' },
  circleBtnGreen: { backgroundColor: '#27AE60' },
  circleBtnRed:   { backgroundColor: '#E74C3C' },
  circleBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  circleBtnAmber: { backgroundColor: '#E67E22', borderWidth: 0 },
});
