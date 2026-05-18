import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  AndroidLaunchActivityFlag,
  EventType,
} from '@notifee/react-native';

const CHANNEL_ID = 'new_orders_v2';
const SERVICE_CHANNEL_ID = 'driver_service';

// Démarre le service au premier plan — garde l'app et le socket vivants en arrière-plan
export async function startDriverService() {
  await notifee.createChannel({
    id: SERVICE_CHANNEL_ID,
    name: 'Service livreur',
    importance: AndroidImportance.LOW,
  });
  await notifee.displayNotification({
    id: 'driver_service',
    title: '🛵 Vous êtes en ligne',
    body: 'En attente de nouvelles courses...',
    android: {
      channelId: SERVICE_CHANNEL_ID,
      ongoing: true,
      asForegroundService: true,
      importance: AndroidImportance.LOW,
      showTimestamp: false,
    },
  });
}

// Arrête le service quand le livreur passe hors ligne
export async function stopDriverService() {
  await notifee.stopForegroundService();
}

export async function setupOrderChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Nouvelles courses',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    vibration: true,
    vibrationPattern: [300, 300, 200, 300],
    sound: 'alert',
    bypassDnd: true,
  });
}

// Affiche une notification plein écran même téléphone verrouillé
export async function showOrderFullScreen(order, distance) {
  await setupOrderChannel();

  await notifee.displayNotification({
    id: 'new_order',
    title: order?.orderType === 'course' ? '🚖 Nouvelle course !' : '📦 Nouvelle commande !',
    body: `${order?.pricing?.total ?? '?'} MRU · À ${distance} km`,
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      category: AndroidCategory.CALL,
      // ← c'est ça qui ouvre l'app sur l'écran verrouillé comme un appel
      fullScreenAction: {
        id: 'default',
        launchActivity: 'mr.deliver.app.MainActivity',
        launchActivityFlags: [AndroidLaunchActivityFlag.SINGLE_TOP],
      },
      pressAction: {
        id: 'default',
        launchActivity: 'mr.deliver.app.MainActivity',
      },
      actions: [
        { title: '✅ Accepter', pressAction: { id: 'accept', launchActivity: 'mr.deliver.app.MainActivity' } },
        { title: '✗ Refuser',  pressAction: { id: 'reject' } },
      ],
      sound: 'alert',
      vibrationPattern: [300, 300, 200, 300],
      autoCancel: false,
      ongoing: false,
      showTimestamp: true,
      color: '#534AB7',
    },
    data: {
      type: 'new_order',
      orderId: order?._id?.toString() ?? '',
    },
  });
}

export async function cancelOrderNotification() {
  await notifee.cancelNotification('new_order');
}

// Écoute les actions (accepter/refuser) depuis la notification
// À appeler dans DriverHomeScreen
export function listenOrderNotificationEvents(onAccept, onReject) {
  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      if (detail.pressAction?.id === 'accept') onAccept(detail.notification?.data?.orderId);
      if (detail.pressAction?.id === 'reject')  onReject(detail.notification?.data?.orderId);
    }
  });
}
