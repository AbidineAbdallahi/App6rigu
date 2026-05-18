import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ClientTabs        from './ClientTabs';
import NewOrderScreen    from '../screens/client/NewOrderScreen';
import OrderTrackScreen  from '../screens/client/OrderTrackScreen';
import ChatScreen        from '../screens/client/ChatScreen';
import { COLORS } from '../constants';

const Stack = createNativeStackNavigator();

const headerOpts = (title) => ({
  headerShown: true,
  title,
  headerStyle: { backgroundColor: COLORS.purple },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' },
  headerBackTitle: 'Retour',
});

export default function ClientNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main"       component={ClientTabs} />
      <Stack.Screen name="NewOrder"   component={NewOrderScreen}   options={headerOpts('Nouvelle commande')} />
      <Stack.Screen name="OrderTrack" component={OrderTrackScreen} options={headerOpts('Suivi de commande')} />
      <Stack.Screen name="Chat"       component={ChatScreen}       options={headerOpts('💬 Chat')} />
    </Stack.Navigator>
  );
}
