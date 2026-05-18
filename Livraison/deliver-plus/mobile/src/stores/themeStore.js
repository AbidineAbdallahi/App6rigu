import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useThemeStore = create((set) => ({
  isDark: false,
  initTheme: async () => {
    const saved = await AsyncStorage.getItem('theme');
    if (saved === 'dark') set({ isDark: true });
  },
  toggleTheme: async () => {
    set(s => {
      const next = !s.isDark;
      AsyncStorage.setItem('theme', next ? 'dark' : 'light');
      return { isDark: next };
    });
  },
}));

export default useThemeStore;
