import { create } from 'zustand';
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from '@/native/platform';
import { appAudio, enableSound, setSoundSettings, useSoundSettings } from './AppAudio';

export interface MusicItem {
  id: string;
  kind: 'song' | 'playlist';
  title: string;
  artist: string;
  artwork: string;
}
export interface MusicStatus {
  available: boolean;
  connected: boolean;
  playing: boolean;
  title?: string;
  artist?: string;
  artwork?: string;
}
interface MusicPlugin {
  getStatus(): Promise<MusicStatus>;
  connect(): Promise<MusicStatus>;
  disconnect(): Promise<MusicStatus>;
  library(options: {
    kind: 'songs' | 'playlists';
    query: string;
    offset: number;
  }): Promise<{ items: MusicItem[]; hasMore: boolean }>;
  play(options: { id: string; kind: string }): Promise<MusicStatus>;
  control(options: { action: 'play' | 'pause' | 'next' | 'previous' }): Promise<MusicStatus>;
  addListener(
    name: 'musicChanged',
    fn: (status: MusicStatus) => void,
  ): Promise<PluginListenerHandle>;
}
const NativeMusic = registerPlugin<MusicPlugin>('BlobbyMusic');
interface LocalTrack {
  id: string;
  title: string;
  url: string;
}
export const useRecordPlayer = create<{
  source: 'radio' | 'files' | 'apple';
  tracks: LocalTrack[];
  index: number;
  playing: boolean;
  progress: number;
  duration: number;
  error: string;
  apple: MusicStatus;
}>(() => ({
  source: 'radio',
  tracks: [],
  index: 0,
  playing: false,
  progress: 0,
  duration: 0,
  error: '',
  apple: { available: false, connected: false, playing: false },
}));
let fileAudio: HTMLAudioElement | null = null;
let revision = 0;
let musicListener: Promise<PluginListenerHandle> | null = null;
function acceptApple(status: MusicStatus) {
  useRecordPlayer.setState({
    apple: status,
    ...(useRecordPlayer.getState().source === 'apple' ? { playing: status.playing } : {}),
  });
  if (useRecordPlayer.getState().source === 'apple')
    appAudio.setExternalMusicPlaying(status.playing);
}
export async function refreshMusic() {
  if (!isNative) return;
  acceptApple(await NativeMusic.getStatus());
  musicListener ??= NativeMusic.addListener('musicChanged', acceptApple);
  await musicListener;
}
export async function connectAppleMusic() {
  acceptApple(await NativeMusic.connect());
  await refreshMusic();
}
export async function disconnectAppleMusic() {
  const state = await NativeMusic.disconnect();
  acceptApple(state);
  if (useRecordPlayer.getState().source === 'apple')
    useRecordPlayer.setState({ source: 'radio', playing: false });
  appAudio.setExternalMusicPlaying(false);
}
export const loadMusicLibrary = (kind: 'songs' | 'playlists', query: string, offset = 0) =>
  NativeMusic.library({ kind, query, offset });
export async function stopOwnedPlayback() {
  const request = ++revision;
  fileAudio?.pause();
  if (useRecordPlayer.getState().apple.playing)
    acceptApple(await NativeMusic.control({ action: 'pause' }));
  appAudio.setExternalMusicPlaying(false);
  useRecordPlayer.setState({ playing: false, error: '' });
  return request;
}
export async function playRadio() {
  const request = await stopOwnedPlayback();
  if (request !== revision) return;
  useRecordPlayer.setState({ source: 'radio' });
  await enableSound({ music: true });
}
function localPlayer() {
  if (fileAudio) return fileAudio;
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.onplay = () => {
    appAudio.setExternalMusicPlaying(true);
    useRecordPlayer.setState({ playing: true });
  };
  audio.onpause = () => {
    appAudio.setExternalMusicPlaying(false);
    useRecordPlayer.setState({ playing: false });
  };
  audio.ontimeupdate = () => useRecordPlayer.setState({ progress: audio.currentTime });
  audio.ondurationchange = () =>
    useRecordPlayer.setState({ duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
  audio.onended = () => {
    if (useRecordPlayer.getState().index + 1 < useRecordPlayer.getState().tracks.length)
      void playLocal(useRecordPlayer.getState().index + 1).catch(reportPlayerError);
  };
  audio.onerror = () => {
    appAudio.setExternalMusicPlaying(false);
    useRecordPlayer.setState({
      playing: false,
      error: 'This file couldn’t play. Try an MP3, M4A or WAV file.',
    });
  };
  const pause = () => {
    if (useRecordPlayer.getState().source === 'files') audio.pause();
  };
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  useSoundSettings.subscribe((settings) => {
    audio.volume = settings.musicVolume;
    if (!settings.enabled) audio.pause();
  });
  fileAudio = audio;
  return audio;
}
export function addMusicFiles(files: FileList | File[]) {
  const selected = Array.from(files).filter(
    (file) =>
      /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name) &&
      file.size > 0 &&
      file.size <= 100 * 1024 * 1024,
  );
  const tracks = useRecordPlayer.getState().tracks;
  if (!selected.length)
    throw new Error('Choose an MP3, M4A, WAV or other audio file under 100 MB.');
  const added = selected
    .slice(0, Math.max(0, 50 - tracks.length))
    .map((file) => ({
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, ''),
      url: URL.createObjectURL(file),
    }));
  if (!added.length) throw new Error('Your listening queue is full. Clear it to add more music.');
  useRecordPlayer.setState({ tracks: [...tracks, ...added], error: '' });
}
export async function clearMusicFiles() {
  if (useRecordPlayer.getState().source === 'files') await stopOwnedPlayback();
  if (fileAudio) {
    fileAudio.removeAttribute('src');
    fileAudio.load();
  }
  for (const track of useRecordPlayer.getState().tracks) URL.revokeObjectURL(track.url);
  useRecordPlayer.setState({ tracks: [], index: 0, progress: 0, duration: 0 });
}
export async function playLocal(index: number) {
  const request = await stopOwnedPlayback();
  const track = useRecordPlayer.getState().tracks[index];
  if (!track) return;
  setSoundSettings({ music: false });
  await enableSound();
  if (revision !== request) return;
  const audio = localPlayer();
  useRecordPlayer.setState({ source: 'files', index, progress: 0 });
  audio.src = track.url;
  audio.volume = useSoundSettings.getState().musicVolume;
  await audio.play();
}
export async function playAppleMusic(item: MusicItem) {
  const request = await stopOwnedPlayback();
  setSoundSettings({ music: false });
  await enableSound();
  if (revision !== request) return;
  useRecordPlayer.setState({ source: 'apple', error: '' });
  // Silence the room before streaming starts. No sampled or mixed Apple Music audio.
  appAudio.setExternalMusicPlaying(true);
  try {
    const status = await NativeMusic.play({ id: item.id, kind: item.kind });
    if (request !== revision || !useSoundSettings.getState().enabled)
      acceptApple(await NativeMusic.control({ action: 'pause' }));
    else acceptApple(status);
  } catch (error) {
    appAudio.setExternalMusicPlaying(false);
    throw error;
  }
}
export async function controlRecord(action: 'play' | 'pause' | 'next' | 'previous') {
  const s = useRecordPlayer.getState();
  if (s.source === 'apple') {
    const request = ++revision;
    if (action !== 'pause') {
      await enableSound({ music: false });
      appAudio.setExternalMusicPlaying(true);
    }
    try {
      const status = await NativeMusic.control({ action });
      if (request !== revision || !useSoundSettings.getState().enabled)
        acceptApple(await NativeMusic.control({ action: 'pause' }));
      else acceptApple(status);
    } catch (error) {
      appAudio.setExternalMusicPlaying(false);
      throw error;
    }
    return;
  }
  if (s.source === 'radio') {
    if (action === 'pause') setSoundSettings({ music: false });
    else if (action === 'play') await playRadio();
    return;
  }
  if (action === 'next' || action === 'previous') {
    await playLocal(
      Math.max(0, Math.min(s.tracks.length - 1, s.index + (action === 'next' ? 1 : -1))),
    );
    return;
  }
  const audio = localPlayer();
  if (action === 'pause') audio.pause();
  else {
    await enableSound({ music: false });
    await audio.play();
  }
}
export function seekRecord(time: number) {
  if (fileAudio && Number.isFinite(time))
    fileAudio.currentTime = Math.max(0, Math.min(time, fileAudio.duration || 0));
}
export function reportPlayerError(error: unknown) {
  useRecordPlayer.setState({
    error: error instanceof Error ? error.message : 'Music couldn’t start. Please try again.',
  });
}

// The master mute also controls native playback, even before any file is loaded.
useSoundSettings.subscribe((settings, previous) => {
  if (previous.enabled && !settings.enabled) void stopOwnedPlayback().catch(reportPlayerError);
});
