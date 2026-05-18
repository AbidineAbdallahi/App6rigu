import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showOrderFullScreen } from './src/services/orderNotification';
import App from './App';

// ── Firebase : message reçu quand app complètement fermée ─────────────────────
// C'est ce handler qui affiche la notification plein écran même app tuée
messaging().setBackgroundMessageHandler(async remoteMessage => {
  const data = remoteMessage.data;
  if (data?.type === 'new_order') {
    await showOrderFullScreen(
      {
        _id: data.orderId,
        orderType: data.orderType || 'course',
        pricing: { total: data.total ? Number(data.total) : null },
      },
      data.distance || '?'
    );
  }
});

// ── Service au premier plan : garde le socket vivant téléphone verrouillé ─────
notifee.registerForegroundService(() => new Promise(() => {}));

// ── Boutons Accepter/Refuser depuis la notification (app en fond ou fermée) ───
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type !== EventType.ACTION_PRESS) return;
  const orderId = detail.notification?.data?.orderId;
  const action  = detail.pressAction?.id;
  if (orderId && (action === 'accept' || action === 'reject')) {
    try {
      await AsyncStorage.setItem(
        'pending_order_action',
        JSON.stringify({ action, orderId })
      );
    } catch {}
  }
  await notifee.cancelNotification('new_order').catch(() => {});
});

registerRootComponent(App);
