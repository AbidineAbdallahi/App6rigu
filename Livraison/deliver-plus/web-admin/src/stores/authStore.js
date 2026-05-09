import { create } from 'zustand';
import api from '../services/api';

const useAuthStore = create(set => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      if (!['admin','agent'].includes(data.user.role))
        throw new Error('Accès non autorisé');
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.user.role);
      set({ user: data.user, token: data.token, loading: false });
      return true;
    } catch (err) {
      set({ error: err.response?.data?.message || err.message, loading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    try { const { data } = await api.get('/auth/me'); set({ user: data.user }); }
    catch { localStorage.removeItem('token'); set({ user: null, token: null }); }
  },
}));

export default useAuthStore;
