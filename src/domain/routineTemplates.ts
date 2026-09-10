import type { RoutineCategory, RoutineInput } from '@/types';
export const CATEGORY_NAMES: Record<RoutineCategory, string> = {
  rest: 'Rest',
  'everyday-care': 'Everyday care',
  enjoyment: 'Enjoyment',
  connection: 'Connection',
  preparation: 'Preparation',
};
export const ROUTINE_TEMPLATES: Omit<RoutineInput, 'days' | 'startDate'>[] = [
  { title: 'Take a quiet break', category: 'rest', activity: 'sand' },
  {
    title: 'Prepare something to eat or drink that suits you',
    category: 'everyday-care',
    activity: 'tea',
  },
  { title: 'Set out something for tomorrow', category: 'preparation' },
  { title: 'Make time for something enjoyable', category: 'enjoyment', activity: 'garden' },
  { title: 'Contact someone you want to connect with', category: 'connection' },
  { title: 'Wind down for the night', category: 'rest', activity: 'bed' },
];
export const ACTIVITY_NAMES = {
  sand: 'Sand garden',
  garden: 'Bonsai garden',
  tea: 'Tea with Blobby',
  bed: 'Rest with Blobby',
  music: 'Record player',
};
