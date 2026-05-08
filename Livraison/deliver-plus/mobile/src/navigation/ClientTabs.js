import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import HomeScreen    from '../screens/client/HomeScreen';
import OrdersScreen  from '../screens/client/OrdersScreen';
import ProfileScreen from '../screens/client/ProfileScreen';
import { COLORS } from '../constants';

const Tab = createBottomTabNavigator();

const icon = (emoji, focused) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

export default function ClientTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: COLORS.border, height: 60, paddingBottom: 8 },
      tabBarActiveTintColor: COLORS.purple,
      tabBarInactiveTintColor: COLORS.muted,
      tabBarLabelStyle: { fontSize: 11 },
    }}>
      <Tab.Screen name="Accueil"   component={HomeScreen}    options={{ tabBarIcon: ({ focused }) => icon('🏠', focused) }} />
      <Tab.Screen name="Commandes" component={OrdersScreen}  options={{ tabBarIcon: ({ focused }) => icon('📋', focused) }} />
      <Tab.Screen name="Profil"    component={ProfileScreen} options={{ tabBarIcon: ({ focused }) => icon('👤', focused) }} />
    </Tab.Navigator>
  );
}
