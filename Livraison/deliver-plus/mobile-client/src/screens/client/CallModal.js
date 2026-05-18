import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
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
  ],
};

const fmtSec = (s) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

export default function CallModal({
  visible, mode = 'caller', peerName, myName, orderId, driverId,
  driverPhone, callerSocketId, socketRef, onEnd,
}) {
  const [state, setState]     = useState(() => mode === 'caller' ? 'calling' : 'ringing');
  const [muted, setMuted]     = useState(false);
  const [callSec, setCallSec] = useState(0);

  const pcRef             = useRef(null);
  const localStreamRef    = useRef(null);
  const remoteStreamRef   = useRef(null);
  const peerSocketRef     = useRef(callerSocketId);
  const timerRef          = useRef(null);
  const iceCandidateQueue = useRef([]);

  // Animations
  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ringOpacity1 = useRef(new Animated.Value(0.5)).current;
  const ringOpacity2 = useRef(new Animated.Value(0.4)).current;
  const ringOpacity3 = useRef(new Animated.Value(0.2)).current;
  const statusFade   = useRef(new Animated.Value(1)).current;

  useEffect(() => { peerSocketRef.current = callerSocketId; }, [callerSocketId]);

  // Pulsating rings
  useEffect(() => {
    const isPulsing = state === 'ringing' || state === 'calling' || state === 'connecting';
    if (!isPulsing) {
      ring1.setValue(1); ring2.setValue(1); ring3.setValue(1);
      ringOpacity1.setValue(0); ringOpacity2.setValue(0); ringOpacity3.setValue(0);
      return;
    }
    const makeRingAnim = (scale, opacity, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale,   { toValue: 2.0, duration: 1800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0,   duration: 1800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
    ringOpacity1.setValue(0.4); ringOpacity2.setValue(0.4); ringOpacity3.setValue(0.4);
    const a1 = makeRingAnim(ring1, ringOpacity1, 0);
    const a2 = makeRingAnim(ring2, ringOpacity2, 600);
    const a3 = makeRingAnim(ring3, ringOpacity3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [state]);

  // Status fade animation
  useEffect(() => {
    Animated.sequence([
      Animated.timing(statusFade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(statusFade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [state]);

  useEffect(() => {
    if (!visible) { cleanup(); return; }
    setState(mode === 'caller' ? 'calling' : 'ringing');
    setMuted(false);
    setCallSec(0);
    iceCandidateQueue.current = [];

    if (mode === 'caller') {
      if (!webrtcAvailable) {
        const phone = driverPhone ? `tel:+${driverPhone.replace(/\D/g, '')}` : null;
        if (phone) Linking.openURL(phone).catch(() => {});
        onEnd?.();
        return;
      }
      const name = myName || 'Client';
      socketRef.current?.emit('call_invite', { orderId, driverId, callerName: name });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !socketRef?.current) return;
    const socket = socketRef.current;

    if (mode === 'caller') {
      const onAccepted = async ({ answererSocketId }) => {
        peerSocketRef.current = answererSocketId;
        setState('connecting');
        await startWebRTC();
      };
      const onRejected = () => { endCall(false); };
      const onAnswer   = async ({ sdp }) => {
        try { await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp)); } catch {}
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
      socket.on('call_accepted', onAccepted);
      socket.on('call_rejected', onRejected);
      socket.on('webrtc_answer', onAnswer);
      socket.on('webrtc_ice',    onIce);
      socket.on('call_ended',    onEnded);
      return () => {
        socket.off('call_accepted', onAccepted);
        socket.off('call_rejected', onRejected);
        socket.off('webrtc_answer', onAnswer);
        socket.off('webrtc_ice',    onIce);
        socket.off('call_ended',    onEnded);
      };
    }

    if (mode === 'callee') {
      const onOffer = async ({ sdp, fromSocketId }) => {
        peerSocketRef.current = fromSocketId;
        setState('connecting');
        await handleOffer(sdp);
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
      socket.on('webrtc_offer', onOffer);
      socket.on('webrtc_ice',   onIce);
      socket.on('call_ended',   onEnded);
      return () => {
        socket.off('webrtc_offer', onOffer);
        socket.off('webrtc_ice',   onIce);
        socket.off('call_ended',   onEnded);
      };
    }
  }, [visible, mode]);

  const activateCallAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch {}
  };

  const deactivateCallAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch {}
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
    remoteStreamRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    iceCandidateQueue.current = [];
    setCallSec(0);
    deactivateCallAudio();
  };

  const handleOffer = async (sdp) => {
    try {
      await activateCallAudio();
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socketRef.current?.emit('webrtc_ice', { candidate, targetSocketId: peerSocketRef.current });
      };
      pc.ontrack = (event) => {
        if (event.streams?.[0]) remoteStreamRef.current = event.streams[0];
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
      socketRef.current?.emit('webrtc_answer', { sdp: answer, targetSocketId: peerSocketRef.current });
    } catch (e) {
      Alert.alert('Erreur appel', e.message);
      endCall(false);
    }
  };

  const startWebRTC = async () => {
    try {
      await activateCallAudio();
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) socketRef.current?.emit('webrtc_ice', { candidate, targetSocketId: peerSocketRef.current });
      };
      pc.ontrack = (event) => {
        if (event.streams?.[0]) remoteStreamRef.current = event.streams[0];
        setState('active');
        startTimer();
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('webrtc_offer', { sdp: offer, targetSocketId: peerSocketRef.current });
      for (const c of iceCandidateQueue.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
      iceCandidateQueue.current = [];
    } catch (e) {
      Alert.alert('Erreur appel', e.message);
      endCall(false);
    }
  };

  const acceptCall = async () => {
    if (!webrtcAvailable) {
      const phone = driverPhone ? `+${driverPhone.replace(/\D/g, '')}` : null;
      if (phone) Linking.openURL(`tel:${phone}`);
      onEnd?.();
      return;
    }
    setState('connecting');
    socketRef.current?.emit('call_accepted', { callerSocketId: peerSocketRef.current, orderId });
  };

  const rejectCall = () => {
    if (peerSocketRef.current) {
      socketRef.current?.emit('call_rejected', { callerSocketId: peerSocketRef.current });
    }
    endCall(false);
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  };

  const endCall = (notifyPeer = true) => {
    if (notifyPeer && peerSocketRef.current) {
      socketRef.current?.emit('call_ended', { targetSocketId: peerSocketRef.current });
    }
    cleanup();
    setState('ended');
    onEnd?.();
  };

  if (!visible) return null;

  const initials   = peerName?.[0]?.toUpperCase() || '🛵';
  // Strict par mode : callee voit Refuser/Accepter, caller voit Annuler
  const isIncoming = mode === 'callee' && (state === 'ringing' || state === 'calling');
  const isOutgoing = mode === 'caller' && (state === 'calling' || state === 'ringing' || state === 'connecting');
  const isActive   = state === 'active';

  const statusLabel = () => {
    if (state === 'ringing')    return 'Appel entrant';
    if (state === 'calling')    return 'Appel en cours...';
    if (state === 'connecting') return 'Connexion...';
    if (state === 'active')     return fmtSec(callSec);
    return '';
  };

  const statusSub = () => {
    if (state === 'ringing')    return 'Votre livreur vous appelle';
    if (state === 'calling')    return 'En attente de réponse...';
    if (state === 'connecting') return 'Établissement de la liaison...';
    if (state === 'active')     return 'Appel vocal en cours';
    return '';
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.bg}>
        <View style={styles.bubble1} />
        <View style={styles.bubble2} />
        <View style={styles.bubble3} />

        <SafeAreaView style={styles.safe}>

          {/* Order badge */}
          {orderId && (
            <View style={styles.orderBadge}>
              <Text style={styles.orderBadgeTxt}>📦 Commande #{String(orderId).slice(-6).toUpperCase()}</Text>
            </View>
          )}

          {/* Avatar + pulsating rings */}
          <View style={styles.avatarSection}>
            <Animated.View style={[styles.ring, { transform: [{ scale: ring3 }], opacity: ringOpacity3 }]} />
            <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: ring2 }], opacity: ringOpacity2 }]} />
            <Animated.View style={[styles.ring, styles.ring1, { transform: [{ scale: ring1 }], opacity: ringOpacity1 }]} />

            <View style={[styles.avatarOuter, isActive && styles.avatarOuterActive]}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>{initials}</Text>
              </View>
            </View>

            {isActive && <View style={styles.activeDot} />}
          </View>

          {/* Name + status */}
          <View style={styles.nameBlock}>
            <Text style={styles.peerName}>{peerName || 'Livreur'}</Text>
            <Animated.View style={{ opacity: statusFade }}>
              <Text style={[styles.statusLabel, isActive && styles.statusLabelActive]}>
                {statusLabel()}
              </Text>
            </Animated.View>
            <Text style={styles.statusSub}>{statusSub()}</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.btnRow}>

            {/* Appel entrant — Refuser + Accepter (callee uniquement) */}
            {isIncoming && (
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
                  <Text style={styles.circleLabel}>Accepter</Text>
                </View>
              </>
            )}

            {/* Outgoing / connecting: Annuler */}
            {isOutgoing && (
              <View style={styles.btnBlock}>
                <TouchableOpacity style={[styles.circleBtn, styles.circleBtnRed]} onPress={() => endCall()}>
                  <Text style={styles.circleBtnIcon}>📵</Text>
                </TouchableOpacity>
                <Text style={styles.circleLabel}>Annuler</Text>
              </View>
            )}

            {/* Active: Mute + Raccrocher */}
            {isActive && (
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
  bubble3: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)', top: '40%', left: '60%',
  },

  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 32,
  },

  orderBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  orderBadgeTxt: {
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
  avatarTxt: {
    fontSize: 46,
    fontWeight: '800',
    color: '#fff',
  },
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
  },
  peerName: {
    fontSize: 30,
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
    fontWeight: '400',
  },

  btnRow: {
    flexDirection: 'row',
    gap: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 8,
  },
  btnBlock: {
    alignItems: 'center',
    gap: 10,
  },
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
  circleBtnIcon: {
    fontSize: 30,
  },
  circleLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  circleBtnGreen: { backgroundColor: '#27AE60' },
  circleBtnRed:   { backgroundColor: '#E74C3C' },
  circleBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  circleBtnAmber: { backgroundColor: '#E67E22', borderWidth: 0 },
});
