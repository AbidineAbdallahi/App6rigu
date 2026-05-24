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
        const { data } = await api.get(`/auth/me`, {
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

  login: async (phone, password) => {
    set({ loading: true, error: null, approvalStatus: null });
    try {
      const { data } = await api.post(`/auth/login-phone`, { phone, password });
      await AsyncStorage.setItem('token', data.token);
      set({
        token: data.token, user: data.user, driverProfile: data.driverProfile, loading: false,
        approvalStatus:   data.approvalStatus   || null,
        missingDocuments: data.missingDocuments  || [],
        missingInfoNote:  data.missingInfoNote   || null,
      });
      return data.approvalStatus === 'incomplet' ? 'incomplet' : data.user.role;
    } catch (err) {
      const resp   = err.response?.data;
      const status = err.response?.status;
      let errorCode;
      if (status === 401)       errorCode = 'login_err_invalid';
      else if (status === 403)  errorCode = 'login_err_suspended';
      else                      errorCode = 'login_err_network';
      set({
        error: errorCode,
        approvalStatus: resp?.approvalStatus || null,
        loading: false,
      });
      return null;
    }
  },

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

  loginWithOtp: async (phone, otp) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/verify-otp`, { phone, otp });
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return data.user.role;
    } catch (err) {
      set({ error: getErrMsg(err, 'Code incorrect ou expiré'), loading: false });
      return null;
    }
  },

  register: async (form) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post(`/auth/register`, form);
      await AsyncStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, loading: false });
      return true;
    } catch (err) {
      set({ error: getErrMsg(err, 'Erreur inscription'), loading: false });
      return false;
    }
  },

  updateDriver: (patch) => set(s => ({
    driverProfile: s.driverProfile ? { ...s.driverProfile, ...patch } : s.driverProfile,
  })),

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({ user: null, token: null, driverProfile: null, error: null, approvalStatus: null, missingDocuments: [], missingInfoNote: null });
  },

  clearError: () => set({ error: null, approvalStatus: null, missingDocuments: [], missingInfoNote: null }),
}));

export default useAuthStore;
