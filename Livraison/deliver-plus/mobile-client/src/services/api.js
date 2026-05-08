import axios from 'axios';
import { API_URL } from '../constants';
import useAuthStore from '../stores/authStore';

const api = axios.create({ baseURL: API_URL, timeout: 10000 });

api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(r => r, async err => {
  if (err.response?.status === 401) useAuthStore.getState().logout();
  return Promise.reject(err);
});

export default api;
