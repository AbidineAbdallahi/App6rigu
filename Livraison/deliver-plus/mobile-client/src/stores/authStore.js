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

  loginWithOtp: async (phone, otp) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-otp`, { phone, otp });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.message || 'Code incorrect ou expiré', loading: false });
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
