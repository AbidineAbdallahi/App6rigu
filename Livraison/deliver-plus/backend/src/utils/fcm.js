const admin = require('../config/firebase');

/**
 * Envoie un message FCM data-only au livreur.
 * Data-only = pas de notification visible par Android → le handler JS de fond s'exécute
 * → Notifee affiche la notification plein écran même app complètement fermée.
 */
async function sendFcmToDriver(fcmToken, data = {}) {
  if (!fcmToken || typeof fcmToken !== 'string') return;
  try {
    const result = await admin.messaging().send({
      token: fcmToken,
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        directBootOk: true,
        ttl: 60 * 1000, // 1 minute — commande expire après 20s de toute façon
      },
    });
    console.log('[FCM] ✅ Message envoyé, messageId:', result);
  } catch (e) {
    console.error('[FCM] ❌ Erreur envoi:', e.message, '| code:', e.code);
  }
}

module.exports = { sendFcmToDriver };
