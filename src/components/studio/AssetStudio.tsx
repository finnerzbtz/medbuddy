import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { Link } from 'react-router-dom';
import { ArrowLeft, Box, Check, Layers, Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import AssetScene, {
  type AssetClip,
  type AssetOutfit,
  type SceneMetrics,
  useReducedMotion,
} from '@/components/scene/AssetScene';
import SceneErrorBoundary from '@/components/scene/SceneErrorBoundary';
import { assetContract, assetReport } from '@/generated/assets';
import './studio.css';

const pretty = (name: string) =>
  name === 'walk_to_cushion'
    ? 'Walk cycle (in place)'
    : name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const bytes = (value: number) => `${(value / 1024).toFixed(0)} KB`;
export default function AssetStudio() {
  const osReduced = useReducedMotion();
  const preference = useAppStore((s) => s.data.preferences.reducedMotion);
  const reducedMotion = osReduced || preference;
  const [outfit, setOutfit] = useState<AssetOutfit>('base');
  const [clip, setClip] = useState<AssetClip>('idle');
  const [playing, setPlaying] = useState(!reducedMotion);
  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);
  const [room, setRoom] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [reset, setReset] = useState(0);
  const [cameraStep, setCameraStep] = useState<{
    direction: 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
    id: number;
  }>();
  const [metrics, setMetrics] = useState<SceneMetrics>();
  const total = assetReport.assets.characters.bytes + assetReport.assets.room.bytes;
  return (
    <div className="asset-studio">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="studio-header">
        <div className="studio-brand">
          <span className="studio-mark">
            <Box aria-hidden="true" focusable="false" size={23} />
          </span>
          <div>
            <strong>
              reminduh<span> / studio</span>
            </strong>
            <small>BLOBBY’S LITTLE WORLD</small>
          </div>
        </div>
        <Link to="/" className="studio-back">
          <ArrowLeft aria-hidden="true" focusable="false" size={15} /> Back to app
        </Link>
      </header>
      <main className="studio-layout" id="main-content" tabIndex={-1}>
        <section className="studio-stage" aria-label="Interactive 3D asset preview">
          <div className="stage-heading">
            <div>
              <span className="studio-eyebrow">THE ASSET COLLECTION</span>
              <h1>
                A little world,
                <br />
                built with care.
              </h1>
              <p>Original character. Fresh geometry. Ready to build on.</p>
            </div>
            <span className="studio-status">
              <span /> Development ready
            </span>
          </div>
          <div className="studio-viewport" data-testid="asset-viewport">
            <SceneErrorBoundary
              fallback={
                <div className="studio-fallback">
                  <img src="/assets-v2/room-preview.webp" alt="Blobby in the rebuilt room" />
                  <p>3D preview unavailable. You can still download the assets below.</p>
                </div>
              }
            >
              <AssetScene
                key={reset}
                outfit={outfit}
                clip={clip}
                playing={playing && !reducedMotion}
                room={room}
                orbit
                cameraStep={cameraStep}
                wireframe={wireframe}
                hiddenGroups={hidden}
                onMetrics={setMetrics}
              />
            </SceneErrorBoundary>
          </div>
          <div className="studio-toolbar">
            <div className="studio-segment" aria-label="Preview scene">
              <button aria-pressed={room} onClick={() => setRoom(true)}>
                <Layers aria-hidden="true" focusable="false" size={15} /> Room
              </button>
              <button aria-pressed={!room} onClick={() => setRoom(false)}>
                <Box aria-hidden="true" focusable="false" size={15} /> Character
              </button>
            </div>
            <div className="studio-tools">
              <button
                disabled={reducedMotion}
                aria-label={playing ? 'Pause animation' : 'Play animation'}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? (
                  <Pause aria-hidden="true" focusable="false" size={17} />
                ) : (
                  <Play aria-hidden="true" focusable="false" size={17} />
                )}
              </button>
              <button
                aria-label="Toggle wireframe"
                aria-pressed={wireframe}
                onClick={() => setWireframe(!wireframe)}
              >
                <ScanLine aria-hidden="true" focusable="false" size={17} />
              </button>
              <button
                aria-label="Reset camera"
                onClick={() => {
                  setCameraStep(undefined);
                  setReset((n) => n + 1);
                }}
              >
                <RotateCcw aria-hidden="true" focusable="false" size={17} />
              </button>
            </div>
          </div>
          <div className="studio-camera-buttons" role="group" aria-label="Camera controls">
            {(['left', 'right', 'up', 'down', 'in', 'out'] as const).map((direction) => (
              <button
                key={direction}
                onClick={() =>
                  setCameraStep((previous) => ({ direction, id: (previous?.id ?? 0) + 1 }))
                }
              >
                {['in', 'out'].includes(direction) ? 'Zoom ' : 'Rotate '}
                {direction}
              </button>
            ))}
          </div>
          <footer className="stage-footer">
            <span>
              {reducedMotion ? 'Reduced motion is on.' : 'Use camera buttons, or drag and scroll.'}
            </span>
            <span>
              {playing ? `${metrics?.fps ?? '—'} fps` : 'Paused'}
              <i />
              {metrics?.calls ?? '—'} draw calls
              <i />
              {metrics ? `${(metrics.triangles / 1000).toFixed(1)}k triangles` : 'Loading scene'}
            </span>
          </footer>
        </section>
        <aside className="studio-panel">
          <div className="panel-section">
            <span className="studio-eyebrow">01 / WARDROBE</span>
            <h2>Made for every mood.</h2>
            <div className="outfit-grid">
              {assetContract.outfits.map((name) => (
                <button
                  key={name}
                  className="outfit-card"
                  aria-pressed={outfit === name}
                  onClick={() => setOutfit(name)}
                >
                  <img src={`/assets-v2/${name}-preview.webp`} alt="" />
                  <span>
                    {pretty(name)}
                    {outfit === name && <Check aria-hidden="true" focusable="false" size={14} />}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel-section">
            <span className="studio-eyebrow">02 / ANIMATION</span>
            <label htmlFor="clip">A little personality</label>
            <select id="clip" value={clip} onChange={(e) => setClip(e.target.value as AssetClip)}>
              {Object.entries(assetContract.clips).map(([name, seconds]) => (
                <option key={name} value={name}>
                  {pretty(name)} · {seconds}s
                </option>
              ))}
            </select>
            <p className="panel-note">One skeleton and one animation mixer across every outfit.</p>
          </div>
          {room && (
            <div className="panel-section">
              <span className="studio-eyebrow">03 / ROOM PIECES</span>
              <div className="room-toggles">
                {assetContract.roomGroups.map((group) => (
                  <label key={group}>
                    <input
                      type="checkbox"
                      checked={!hidden.includes(group)}
                      onChange={() =>
                        setHidden((list) =>
                          list.includes(group) ? list.filter((g) => g !== group) : [...list, group],
                        )
                      }
                    />
                    {pretty(group)}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="panel-section studio-delivery">
            <span className="studio-eyebrow">BUILT FOR DEVELOPMENT</span>
            <div className="delivery-total">
              {(total / 1_000_000).toFixed(2)}
              <span> MB total</span>
            </div>
            <p>Embedded materials. Local assets. No decoder downloads.</p>
            <a href="/assets-v2/characters.glb" download>
              <span>Character + all outfits</span>
              <b>{bytes(assetReport.assets.characters.bytes)} ↗</b>
            </a>
            <a href="/assets-v2/room.glb" download>
              <span>Room + furniture</span>
              <b>{bytes(assetReport.assets.room.bytes)} ↗</b>
            </a>
            <a href="/assets-v2/asset-report.json" download>
              <span>Asset report</span>
              <b>JSON ↗</b>
            </a>
          </div>
        </aside>
      </main>
    </div>
  );
}
