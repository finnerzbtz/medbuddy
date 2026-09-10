import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMusicPlaying } from '@/audio/useMusicPlaying';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Leaf,
  Music,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react';
import { useSoundSettings, setSoundSettings, useRadioPlayback } from '@/audio/AppAudio';
import {
  addMusicFiles,
  clearMusicFiles,
  connectAppleMusic,
  controlRecord,
  disconnectAppleMusic,
  loadMusicLibrary,
  playAppleMusic,
  playLocal,
  playRadio,
  refreshMusic,
  reportPlayerError,
  seekRecord,
  useRecordPlayer,
  type MusicItem,
} from '@/audio/RecordPlayerAudio';
import { useAppStore } from '@/stores/appStore';
import { useReducedMotion } from '@/components/app/useReducedMotion';
import './record-player.css';

const stamp = (time: number) =>
  `${Math.floor(time / 60)}:${Math.floor(time % 60)
    .toString()
    .padStart(2, '0')}`;
export default function RecordPlayer({ reduced = false }: { reduced?: boolean }) {
  const s = useRecordPlayer();
  const sound = useSoundSettings();
  const musicPlaying = useMusicPlaying();
  const radioPlayback = useRadioPlayback();
  const osReduced = useReducedMotion();
  const calmMotion = useAppStore(
    (s) => s.data.preferences.reducedMotion || s.data.preferences.pauseScene,
  );
  const [tab, setTab] = useState<'radio' | 'library'>(s.source === 'radio' ? 'radio' : 'library');
  const [busy, setBusy] = useState(false);
  const [library, setLibrary] = useState<MusicItem[]>([]);
  const [kind, setKind] = useState<'songs' | 'playlists'>('playlists');
  const [query, setQuery] = useState('');
  const appliedQuery = useRef('');
  const [more, setMore] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const libraryRequest = useRef(0);
  const radio = tab === 'radio';
  const playing = radio
    ? s.source === 'radio' && sound.enabled && sound.music
    : s.source !== 'radio' && s.playing;
  const title = radio
    ? 'Soft afternoon'
    : s.source === 'apple'
      ? s.apple.title || 'Your Apple Music'
      : s.tracks[s.index]?.title || 'Your listening corner';
  const artist = radio
    ? 'Gentle keys & guitar · no drums'
    : s.source === 'apple'
      ? s.apple.artist || 'Apple Music'
      : 'Music from your device';
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    useRecordPlayer.setState({ error: '' });
    try {
      await action();
    } catch (error) {
      reportPlayerError(error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refreshMusic().catch(reportPlayerError);
    return () => {
      libraryRequest.current++;
    };
  }, []);
  const browse = async (nextKind = kind, offset = 0) => {
    const request = ++libraryRequest.current;
    if (offset === 0) appliedQuery.current = query;
    const result = await loadMusicLibrary(nextKind, appliedQuery.current, offset);
    if (request !== libraryRequest.current) return;
    setLibrary((previous) => (offset ? [...previous, ...result.items] : result.items));
    setMore(result.hasMore);
  };
  useEffect(() => {
    if (!s.apple.connected) {
      libraryRequest.current++;
      setLibrary([]);
      setMore(false);
      return;
    }
    void run(() => browse(kind));
  }, [s.apple.connected, kind]);
  return (
    <div
      className="record-player"
      data-playing={playing && musicPlaying}
      data-notes-playing={playing && musicPlaying}
      data-reduced={reduced || osReduced || calmMotion}
    >
      <div className="record-source-tabs" role="group" aria-label="Music source">
        <button aria-pressed={radio} onClick={() => setTab('radio')}>
          Blobby radio
        </button>
        <button aria-pressed={!radio} onClick={() => setTab('library')}>
          Your music
        </button>
      </div>
      <div className="record-turntable" aria-hidden="true">
        <div className="record-music-notes">
          {[Music2, Music, Music2, Music].map((Note, i) => (
            <span
              key={i}
              style={{ '--note': i, '--drift': `${i % 2 ? 18 : -18}px` } as CSSProperties}
            >
              <Note size={23} strokeWidth={2.3} />
            </span>
          ))}
        </div>
        <div className="record-platter">
          <div className="record-grooves">
            <div className="record-label">
              {s.source === 'apple' && !radio && s.apple.artwork ? (
                <img src={s.apple.artwork} alt="" />
              ) : (
                <Leaf size={29} />
              )}
              <span />
            </div>
          </div>
        </div>
        <div className="record-arm">
          <i />
        </div>
        <div className="record-power" />
      </div>
      <div className="record-now">
        <h3>{title}</h3>
        <p>{artist}</p>
      </div>
      <div className="record-transport">
        {!radio && (
          <button
            className="icon-button"
            aria-label="Previous track"
            disabled={
              busy ||
              (s.source !== 'apple' ? s.index === 0 || !s.tracks.length : !s.apple.connected)
            }
            onClick={() => void run(() => controlRecord('previous'))}
          >
            <SkipBack size={21} />
          </button>
        )}
        <button
          className="record-play"
          disabled={busy || (!radio && s.source !== 'apple' && !s.tracks.length)}
          aria-label={
            radio && radioPlayback.error
              ? 'Retry music'
              : playing
                ? 'Pause record'
                : radio
                  ? 'Play Blobby radio'
                  : 'Play record'
          }
          onClick={() =>
            void run(() =>
              radio
                ? playing && !radioPlayback.error
                  ? controlRecord('pause')
                  : playRadio()
                : s.source === 'radio'
                  ? playLocal(0)
                  : controlRecord(playing ? 'pause' : 'play'),
            )
          }
        >
          {radio && radioPlayback.error ? (
            <RotateCcw size={23} />
          ) : playing ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" />
          )}
        </button>
        {!radio && (
          <button
            className="icon-button"
            aria-label="Next track"
            disabled={
              busy || (s.source !== 'apple' ? s.index >= s.tracks.length - 1 : !s.apple.connected)
            }
            onClick={() => void run(() => controlRecord('next'))}
          >
            <SkipForward size={21} />
          </button>
        )}
      </div>
      {!radio && s.source === 'files' && s.duration > 0 && (
        <label className="record-progress">
          <span className="visually-hidden">Track position</span>
          <input
            aria-label="Track position"
            type="range"
            min={0}
            max={s.duration}
            step={1}
            value={s.progress}
            onChange={(e) => seekRecord(Number(e.target.value))}
          />
          <span>
            {stamp(s.progress)} / {stamp(s.duration)}
          </span>
        </label>
      )}
      {radio ? (
        <p className="record-playback-status" role="status">
          {radioPlayback.error ||
            (playing && radioPlayback.loading
              ? 'Loading music…'
              : playing && sound.musicVolume === 0
                ? 'Music volume is zero'
                : playing && musicPlaying
                  ? 'Playing'
                  : 'Paused')}
        </p>
      ) : (
        <>
          <div className="record-library-heading">
            <h3>From your device</h3>
            <button className="text-link" onClick={() => input.current?.click()}>
              <Plus size={17} />
              Add music
            </button>
          </div>
          <input
            ref={input}
            tabIndex={-1}
            type="file"
            multiple
            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
            className="visually-hidden"
            aria-label="Choose music files"
            onChange={(e) => {
              try {
                if (e.target.files) addMusicFiles(e.target.files);
              } catch (error) {
                reportPlayerError(error);
              }
              e.target.value = '';
            }}
          />
          {!s.tracks.length ? (
            <button className="record-file-drop" onClick={() => input.current?.click()}>
              <Upload size={23} />
              <strong>Bring a favourite song</strong>
              <span>Choose audio files. They stay on your device.</span>
            </button>
          ) : (
            <>
              <ol className="record-queue" aria-label="Your music queue">
                {s.tracks.map((track, index) => (
                  <li key={track.id}>
                    <button
                      aria-label={`Play ${track.title}`}
                      aria-current={s.source === 'files' && s.index === index ? 'true' : undefined}
                      disabled={busy}
                      onClick={() => void run(() => playLocal(index))}
                    >
                      <Music2 size={18} />
                      <span>{track.title}</span>
                      <Play size={16} />
                    </button>
                  </li>
                ))}
              </ol>
              <button className="text-link record-clear" onClick={() => void run(clearMusicFiles)}>
                Clear listening queue
              </button>
              <p className="record-small">
                The listening queue lasts for this visit. Files are never uploaded.
              </p>
            </>
          )}
          <section className="record-connect" aria-labelledby="apple-library-heading">
            <div>
              <h3 id="apple-library-heading">Apple Music</h3>
              <p>
                {s.apple.connected
                  ? 'Choose from your library.'
                  : s.apple.available
                    ? 'Listen to your songs and playlists.'
                    : 'Library connection is coming to the iPhone app.'}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={!s.apple.available || busy}
              onClick={() => void run(s.apple.connected ? disconnectAppleMusic : connectAppleMusic)}
            >
              {s.apple.connected ? 'Disconnect' : 'Connect'}
            </button>
          </section>
          {s.apple.connected && (
            <div className="apple-library">
              <div
                className="record-source-tabs"
                role="group"
                aria-label="Apple Music library type"
              >
                {(['playlists', 'songs'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={kind === value}
                    disabled={busy}
                    onClick={() => setKind(value)}
                  >
                    {value === 'songs' ? 'Songs' : 'Playlists'}
                  </button>
                ))}
              </div>
              <form
                className="record-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => browse());
                }}
              >
                <input
                  aria-label="Search your Apple Music library"
                  value={query}
                  maxLength={100}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your library"
                />
                <button className="icon-button" aria-label="Search library" disabled={busy}>
                  <Search size={20} />
                </button>
              </form>
              <ul className="record-queue" aria-label="Apple Music library">
                {library.map((item) => (
                  <li key={item.id}>
                    <button
                      disabled={busy}
                      onClick={() => void run(() => playAppleMusic(item))}
                      aria-label={`Play ${item.title}`}
                    >
                      {item.artwork ? <img src={item.artwork} alt="" /> : <Music2 size={25} />}
                      <span>
                        {item.title}
                        <small>{item.artist}</small>
                      </span>
                      <Play size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              {!busy && !library.length && <p className="record-small">No music found here yet.</p>}
              {more && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void run(() => browse(kind, library.length))}
                >
                  Show more music
                </button>
              )}
            </div>
          )}
          <a
            className="record-spotify"
            href="https://open.spotify.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Spotify <ExternalLink size={15} aria-hidden="true" />
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
        </>
      )}
      <label className="record-volume">
        Music volume
        <input
          type="range"
          aria-label="Record player volume"
          min={0}
          max={100}
          value={Math.round(sound.musicVolume * 100)}
          disabled={s.source === 'apple' && !radio}
          onChange={(e) => setSoundSettings({ musicVolume: Number(e.target.value) / 100 })}
        />
        <span>
          {s.source === 'apple' && !radio
            ? 'Use device volume'
            : `${Math.round(sound.musicVolume * 100)}%`}
        </span>
      </label>
      <p className="record-feedback" role="status">
        {busy ? 'Just a moment…' : s.error}
      </p>
    </div>
  );
}
export function RecordPlayerPage() {
  return (
    <section className="record-player-page">
      <Link to="/" className="text-link">
        <ArrowLeft size={17} />
        Back to Blobby
      </Link>
      <h1>Record player</h1>
      <RecordPlayer />
    </section>
  );
}
