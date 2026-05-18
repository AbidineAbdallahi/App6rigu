import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const useLangStore = create((set) => ({
  lang: 'fr',
  initialized: false,

  initLang: async () => {
    const saved = await AsyncStorage.getItem('app_lang');
    if (saved) set({ lang: saved });
    set({ initialized: true });
  },

  setLang: async (lang) => {
    await AsyncStorage.setItem('app_lang', lang);
    set({ lang });
  },
}));

export default useLangStore;
