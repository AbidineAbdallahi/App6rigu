import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen    from '../screens/client/HomeScreen';
import OrdersScreen  from '../screens/client/OrdersScreen';
import ProfileScreen from '../screens/client/ProfileScreen';
import useLangStore  from '../stores/langStore';
import { translations } from '../i18n';
import { COLORS }    from '../constants';

const Tab = createBottomTabNavigator();
const icon = (emoji, focused) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;

export default function ClientTabs() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: COLORS.border, height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom },
      tabBarActiveTintColor: COLORS.purple,
      tabBarInactiveTintColor: COLORS.muted,
      tabBarLabelStyle: { fontSize: 11 },
    }}>
      <Tab.Screen name="Accueil"   component={HomeScreen}    options={{ tabBarLabel: t.tab_home,   tabBarIcon: ({ focused }) => icon('🏠', focused) }} />
      <Tab.Screen name="Commandes" component={OrdersScreen}  options={{ tabBarLabel: t.tab_orders, tabBarIcon: ({ focused }) => icon('📋', focused) }} />
      <Tab.Screen name="Profil"    component={ProfileScreen} options={{ tabBarLabel: t.tab_profile,tabBarIcon: ({ focused }) => icon('👤', focused) }} />
    </Tab.Navigator>
  );
}
