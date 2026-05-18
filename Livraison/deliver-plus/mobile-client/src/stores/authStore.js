import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../constants';

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
        const { data } = await axios.get(`${API_URL}/auth/me`, {
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
      const { data } = await axios.post(`${API_URL}/auth/login-phone`, { phone, password });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Numéro ou mot de passe incorrect', loading: false });
      return null;
    }
  },

  // Inscription : envoie OTP après validation des données
  registerClient: async (phone, firstName, lastName, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/register-client`, {
        phone, firstName, lastName, password,
      });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Erreur lors de l\'inscription', loading: false });
      return null;
    }
  },

  // Vérification OTP (inscription ou autre)
  sendOtp: async (phone, firstName, lastName) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/send-otp`, { phone, firstName, lastName });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Erreur envoi OTP', loading: false });
      return null;
    }
  },

  loginWithOtp: async (phone, otp, referralCode) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-otp`, {
        phone, otp,
        ...(referralCode ? { referralCode } : {}),
      });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Code incorrect ou expiré', loading: false });
      return null;
    }
  },

  // Mot de passe oublié : envoie OTP au numéro
  forgotPassword: async (phone) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/forgot-password`, { phone });
      set({ loading: false });
      return data;
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || 'Erreur serveur';
      set({ error: message, loading: false });
      return { success: false, notFound: status === 404 };
    }
  },

  // Réinitialisation du mot de passe
  resetPassword: async (phone, otp, newPassword) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/reset-password`, { phone, otp, newPassword });
      set({ loading: false });
      return data;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Code incorrect ou expiré', loading: false });
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
