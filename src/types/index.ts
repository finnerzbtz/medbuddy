export type BlobbyVariant = 'base' | 'raincoat' | 'sweater' | 'glasses';
export type AnimationName = 'idle' | 'happy' | 'celebrating' | 'worried' | 'sick' | 'critical' | 'recovering' | 'walk_to_cushion';

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  time: string;
  color: string;
}
