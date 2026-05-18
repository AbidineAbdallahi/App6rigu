import { useState, useCallback } from 'react';
import api from '../services/api';

export function useFavorites() {
  const [favorites, setFavorites] = useState([]);
  const [loading,   setLoading]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/users/favorites');
      setFavorites(data.favorites || []);
    } catch {}
  }, []);

  const add = useCallback(async (fav) => {
    try {
      setLoading(true);
      const { data } = await api.post('/users/favorites', fav);
      if (data.success) {
        setFavorites(prev => [...prev, { ...fav, _id: data.id }]);
      }
      return data.success;
    } catch { return false; }
    finally { setLoading(false); }
  }, []);

  const remove = useCallback(async (id) => {
    try {
      setFavorites(prev => prev.filter(f => f._id !== id));
      await api.delete(`/users/favorites/${id}`);
    } catch {}
  }, []);

  return { favorites, loading, load, add, remove };
}
