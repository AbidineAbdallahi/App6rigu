import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../constants';

const api = axios.create({ baseURL: API_URL, timeout: 10000 });

const getErrMsg = (err, fallback) => {
  if (err.response?.data?.message) return err.response.data.message;
  if (err.code === 'ECONNABORTED') return `Délai dépassé — serveur inaccessible (${API_URL})`;
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error')
    return `Impossible de joindre le serveur (${API_URL}). Vérifiez le Wi-Fi.`;
  return fallback + ' — ' + (err.message || 'erreur inconnue');
};

const useAuthStore = create((set) => ({
  user:        null,
  token:       null,
  loading:     false,
  error:       null,
  initialized: false,

  init: async () => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      set({ token });
      try {
        const { data } = await api.get(`/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data.user?.role !== 'client') {
          await AsyncStorage.removeItem('token');
          set({ token: null });
        } else {
          set({ user: data.user });
        }
      } catch {
        await AsyncStorage.removeItem('token');
        set({ token: null });
      }
    }
    set({ initialized: true });
  },

  // Connexion par numéro + mot de passe
  loginWithPhone: async (phone, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/login-phone`, { phone, password });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return data;
    } catch (err) {
      set({ error: getErrMsg(err, 'Numéro ou mot de passe incorrect'), loading: false });
      return null;
    }
  },

  // Inscription : envoie OTP après validation des données
  registerClient: async (phone, firstName, lastName, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/register-client`, {
        phone, firstName, lastName, password,
      });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: getErrMsg(err, 'Erreur inscription'), loading: false });
      return null;
    }
  },

  // Vérification OTP (inscription ou autre)
  sendOtp: async (phone, firstName, lastName) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/send-otp`, { phone, firstName, lastName });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: getErrMsg(err, 'Erreur envoi OTP'), loading: false });
      return null;
    }
  },

  loginWithOtp: async (phone, otp, referralCode) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/verify-otp`, {
        phone, otp,
        ...(referralCode ? { referralCode } : {}),
      });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return data;
    } catch (err) {
      set({ error: getErrMsg(err, 'Code incorrect ou expiré'), loading: false });
      return null;
    }
  },

  // Mot de passe oublié : envoie OTP au numéro
  forgotPassword: async (phone) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/forgot-password`, { phone });
      set({ loading: false });
      return data;
    } catch (err) {
      const status = err.response?.status;
      const message = getErrMsg(err, 'Erreur serveur');
      set({ error: message, loading: false });
      return { success: false, notFound: status === 404 };
    }
  },

  // Réinitialisation du mot de passe
  resetPassword: async (phone, otp, newPassword) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/reset-password`, { phone, otp, newPassword });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: getErrMsg(err, 'Code incorrect ou expiré'), loading: false });
      return null;
    }
  },

  updateUser: (patch) => set(s => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
