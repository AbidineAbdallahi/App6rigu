import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import messaging from '@react-native-firebase/messaging';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
    priority:        Notifications.AndroidNotificationPriority.MAX,
  }),
});

// Canal haute priorité créé au chargement du module (avant toute demande de permission)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('orders', {
    name:                   'Nouvelles courses',
    importance:             Notifications.AndroidImportance.MAX,
    vibrationPattern:       [300, 300, 200, 300],
    lightColor:             '#3B328F',
    sound:                  'alert.wav',
    enableVibrate:          true,
    showBadge:              true,
    enableLights:           true,
    bypassDnd:              true,  // Passe même en mode Ne pas déranger
  }).catch(() => {});
}

export async function registerForPushNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name:             'default',
        importance:       Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor:       '#3B328F',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('[Push] Permission refusée par l\'utilisateur');
      return;
    }

    // Récupérer le projectId depuis EAS ou app.json extra
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.projectId;

    let tokenData;
    try {
      // Tentative avec projectId si disponible, sinon sans (Expo Go dev)
      tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
    } catch (tokenErr) {
      console.warn('[Push] getExpoPushTokenAsync échoué:', tokenErr.message);
      console.warn('[Push] ⚠️  Pour activer les push en Expo Go, ajoutez votre projectId dans app.json > extra.eas.projectId');
      console.warn('[Push] Obtenez votre projectId sur : https://expo.dev > votre projet > Project ID');
      return;
    }

    if (!tokenData?.data) {
      console.warn('[Push] Token vide reçu');
      return;
    }

    console.log('[Push] ✅ Token Expo:', tokenData.data);
    await api.patch('/users/push-token', { pushToken: tokenData.data });

    // Enregistrer aussi le token FCM Firebase (pour les notifications plein écran app fermée)
    try {
      const m = messaging();
      const authStatus = await m.requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (enabled) {
        const fcmToken = await m.getToken();
        if (fcmToken) {
          await api.patch('/users/fcm-token', { fcmToken });
          console.log('[FCM] ✅ Token FCM sauvegardé');
        }
      }
    } catch (fcmErr) {
      console.warn('[FCM] Token FCM impossible:', fcmErr.message);
    }

    console.log('[Push] ✅ Tokens sauvegardés sur le serveur');
  } catch (e) {
    console.warn('[Push] Enregistrement impossible:', e.message);
  }
}
