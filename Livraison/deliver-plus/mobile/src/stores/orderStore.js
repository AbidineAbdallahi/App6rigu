import { create } from 'zustand';

const useOrderStore = create(set => ({
  currentOrder: null,
  setCurrentOrder: order => set({ currentOrder: order }),
  clearCurrentOrder: () => set({ currentOrder: null }),
}));

export default useOrderStore;
