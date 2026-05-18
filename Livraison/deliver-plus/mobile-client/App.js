import { useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import useAuthStore from './src/stores/authStore';
import useLangStore from './src/stores/langStore';
import PhoneOtpLoginScreen from './src/screens/auth/PhoneOtpLoginScreen';
import ClientNavigator from './src/navigation/ClientNavigator';
import { registerForPushNotifications } from './src/services/notifications';
import { COLORS } from './src/constants';

function SplashScreen() {
  const r  = 24;
  const lw = 13;
  const lh = 77;
  const ang = 20;
  const size = 110;
  return (
    <View style={{ flex: 1, backgroundColor: '#3B328F', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: r,
        backgroundColor: '#3B328F', overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
      }}>
        <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', left:16, top:11, transform:[{rotate:`${ang}deg`}] }}/>
        <View style={{ position:'absolute', width:lw, height:lh, borderRadius:lw/2, backgroundColor:'white', right:16, top:11, transform:[{rotate:`${-ang}deg`}] }}/>
        <View style={{ position:'absolute', top:58, flexDirection:'row', alignItems:'center', left:19 }}>
          <View style={{ width:44, height:10, backgroundColor:'#F59E0B', borderRadius:3 }}/>
          <View style={{ width:0, height:0, borderTopWidth:7, borderBottomWidth:7, borderLeftWidth:10, borderTopColor:'transparent', borderBottomColor:'transparent', borderLeftColor:'#F59E0B' }}/>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 18 }}>Amder</Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 6 }}>Livraison & Transport</Text>
    </View>
  );
}

export default function App() {
  const { token, initialized, init } = useAuthStore();
  const notifListenerRef = useRef(null);

  useEffect(() => { init(); useLangStore.getState().initLang(); }, []);

  // Enregistrer le push token dès que l'utilisateur est connecté
  useEffect(() => {
    if (token) {
      registerForPushNotifications();
      // Écouter les taps sur notifications (app en arrière-plan)
      notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(() => {});
    }
    return () => { notifListenerRef.current?.remove?.(); };
  }, [token]);

  if (!initialized) {
    return (
      <SafeAreaProvider>
        <SplashScreen />
      </SafeAreaProvider>
    );
  }

  if (!token) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PhoneOtpLoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <ClientNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
