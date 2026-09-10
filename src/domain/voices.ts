export const BLOBBY_VOICES = [
  { id: 'cloud', name: 'Cloud', description: 'Floaty and softly curious' },
  { id: 'moss', name: 'Moss', description: 'Cuddly with a little rumble' },
  { id: 'pip', name: 'Pip', description: 'Bouncy and gently cheeky' },
] as const;
export type BlobbyVoice = (typeof BLOBBY_VOICES)[number]['id'] | 'quiet';
export const VOICE_SAMPLE =
  'Hello, I’m Blobby. Let’s take a little moment together. There’s no hurry.';
export const voiceName = (id: BlobbyVoice) =>
  BLOBBY_VOICES.find((voice) => voice.id === id)?.name ?? 'Quiet';
export const isBlobbyVoice = (id: unknown): id is BlobbyVoice =>
  id === 'quiet' || BLOBBY_VOICES.some((v) => v.id === id);
