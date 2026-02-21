import { create } from 'zustand';
import type { AnimationName, BlobbyVariant, Medication } from '@/types';

interface AppState {
  currentAnimation: AnimationName;
  currentVariant: BlobbyVariant;
  streak: number;
  isPlaying: boolean;
  medications: Medication[];
  setAnimation: (animation: AnimationName) => void;
  setVariant: (variant: BlobbyVariant) => void;
  togglePlaying: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentAnimation: 'walk_to_cushion',
  currentVariant: 'base',
  streak: 33,
  isPlaying: true,
  medications: [
    {
      id: '1',
      name: 'Sertraline',
      dosage: '50mg',
      time: '8AM',
      color: '#8BA875',
    },
    {
      id: '2',
      name: 'Vitamin D',
      dosage: '1000IU',
      time: '8AM',
      color: '#D4A574',
    },
    {
      id: '3',
      name: 'Omega-3',
      dosage: '1000mg',
      time: '12PM',
      color: '#7A9B68',
    },
  ],
  setAnimation: (animation) => set({ currentAnimation: animation }),
  setVariant: (variant) => set({ currentVariant: variant }),
  togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
}));
