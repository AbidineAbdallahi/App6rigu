import { create } from 'zustand';

const useLangStore = create((set) => ({
  lang: localStorage.getItem('admin_lang') || 'fr',
  setLang: (lang) => {
    localStorage.setItem('admin_lang', lang);
    set({ lang });
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  },
}));

// Appliquer la direction au chargement
const savedLang = localStorage.getItem('admin_lang') || 'fr';
document.documentElement.dir = savedLang === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = savedLang;

export default useLangStore;
