import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../constants';

const useAuthStore = create((set, get) => ({
  user:             null,
  token:            null,
  driverProfile:    null,
  loading:          false,
  error:            null,
  approvalStatus:   null,
  missingDocuments: [],
  missingInfoNote:  null,
  initialized:      false,

  init: async () => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      try {
        const { data } = await axios.get(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const dp = data.driverProfile;
        // Token validé côté serveur → on l'injecte en state seulement maintenant
        set({
          token,
          user:             data.user,
          driverProfile:    dp,
          approvalStatus:   dp?.approvalStatus === 'incomplet' ? 'incomplet' : null,
          missingDocuments: dp?.missingDocuments || [],
          missingInfoNote:  dp?.missingInfoNote  || null,
        });
      } catch {
        await AsyncStorage.removeItem('token');
        // token reste null en state → écran de login
      }
    }
    set({ initialized: true });
  },

  login: async (email, password) => {
    set({ loading: true, error: null, approvalStatus: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
      await AsyncStorage.setItem('token', data.token);
      set({
        token: data.token, user: data.user, driverProfile: data.driverProfile, loading: false,
        approvalStatus:   data.approvalStatus   || null,
        missingDocuments: data.missingDocuments  || [],
        missingInfoNote:  data.missingInfoNote   || null,
      });
      return data.approvalStatus === 'incomplet' ? 'incomplet' : data.user.role;
    } catch (err) {
      const resp = err.response?.data;
      set({
        error: resp?.message || 'Erreur de connexion',
        approvalStatus: resp?.approvalStatus || null,
        loading: false,
      });
      return null;
    }
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
      return data.user.role;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Code incorrect ou expiré', loading: false });
      return null;
    }
  },

  register: async (form) => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.post(`${API_URL}/auth/register`, form);
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.message || 'Erreur inscription', loading: false });
      return false;
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ user: null, token: null, driverProfile: null, error: null, approvalStatus: null, missingDocuments: [], missingInfoNote: null });
  },

  clearError: () => set({ error: null, approvalStatus: null, missingDocuments: [], missingInfoNote: null }),
}));

export default useAuthStore;
