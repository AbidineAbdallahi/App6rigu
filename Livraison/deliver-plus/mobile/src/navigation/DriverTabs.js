import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DriverHomeScreen     from '../screens/driver/DriverHomeScreen';
import DriverMapScreen      from '../screens/driver/DriverMapScreen';
import DriverEarningsScreen from '../screens/driver/DriverEarningsScreen';
import ProfileScreen        from '../screens/client/ProfileScreen';
import useLangStore         from '../stores/langStore';
import { translations }     from '../i18n';
import { COLORS }           from '../constants';

const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={[styles.iconEmoji, { opacity: focused ? 1 : 0.45 }]}>{emoji}</Text>
    </View>
  );
}

export default function DriverTabs() {
  const { lang } = useLangStore();
  const t = translations[lang];
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
          shadowColor: COLORS.purple,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.09,
          shadowRadius: 16,
          elevation: 16,
        },
        tabBarActiveTintColor: COLORS.purple,
        tabBarInactiveTintColor: '#A8A8C0',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tab.Screen name="Accueil"  component={DriverHomeScreen}     options={{ tabBarLabel: t.tab_home,     tabBarIcon: ({ focused }) => <TabIcon emoji="🛵" focused={focused} /> }} />
      <Tab.Screen name="Carte"    component={DriverMapScreen}      options={{ tabBarLabel: t.tab_map,      tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} /> }} />
      <Tab.Screen name="Revenus"  component={DriverEarningsScreen} options={{ tabBarLabel: t.tab_earnings, tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} /> }} />
      <Tab.Screen name="Profil"   component={ProfileScreen}        options={{ tabBarLabel: t.tab_profile,  tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#EEEDFE',
  },
  iconEmoji: {
    fontSize: 20,
  },
});
