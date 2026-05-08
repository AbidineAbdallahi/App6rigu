import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import DriverHomeScreen    from '../screens/driver/DriverHomeScreen';
import DriverMapScreen     from '../screens/driver/DriverMapScreen';
import DriverEarningsScreen from '../screens/driver/DriverEarningsScreen';
import ProfileScreen       from '../screens/client/ProfileScreen';
import { COLORS } from '../constants';

const Tab = createBottomTabNavigator();
const icon = (e, focused) => <Text style={{ fontSize:20, opacity: focused?1:0.5 }}>{e}</Text>;

export default function DriverTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false,
      tabBarStyle: { backgroundColor:'#fff', borderTopColor: COLORS.border, height:60, paddingBottom:8 },
      tabBarActiveTintColor: COLORS.purple,
      tabBarLabelStyle: { fontSize:11 },
    }}>
      <Tab.Screen name="Accueil"   component={DriverHomeScreen}    options={{ tabBarIcon:({focused})=>icon('🛵',focused) }} />
      <Tab.Screen name="Carte"     component={DriverMapScreen}     options={{ tabBarIcon:({focused})=>icon('🗺️',focused) }} />
      <Tab.Screen name="Revenus"   component={DriverEarningsScreen} options={{ tabBarIcon:({focused})=>icon('💰',focused) }} />
      <Tab.Screen name="Profil"    component={ProfileScreen}       options={{ tabBarIcon:({focused})=>icon('👤',focused) }} />
    </Tab.Navigator>
  );
}
