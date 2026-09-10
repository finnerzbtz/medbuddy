import { Suspense, useEffect } from 'react';
import type { FC } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { BlobbyModel } from './BlobbyModel';
// import { WindowScene } from './WindowScene'; // see note below
// TODO: Re-enable once wawa-vfx compatibility is resolved
// import { MoodParticles } from './MoodParticles';
// import { MoodEffects } from './MoodEffects';
// import { useAppStore } from '@/stores/appStore';
import * as THREE from 'three';

/** Points the orthographic camera at the room center and auto-fits zoom */
const CameraRig = () => {
  const { camera, size } = useThree();
  const three = useThree();

  // Dev-only handle for scripts/validate-scene.mjs, which measures Blobby's
  // world position against the room geometry to catch him clipping into furniture.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __three?: typeof three }).__three = three;
    }
  }, [three]);

  useEffect(() => {
    camera.lookAt(0, 1.4, 0);

    const worldExtent = 7;
    const baseZoom = Math.min(size.width, size.height) / worldExtent;
    (camera as any).zoom = baseZoom;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
};

// TODO: Re-enable MoodSystems once wawa-vfx VFXParticles crash is fixed
// wawa-vfx ForwardRef crashes the R3F Canvas, killing the whole scene

const SceneCanvas: FC = () => {
  return (
    <Canvas
      orthographic
      camera={{
        position: [5, 5, 5],
        zoom: 80,
        near: 0.1,
        far: 100,
      }}
      style={{
        width: '100%',
        height: '100%',
      }}
      gl={{
        alpha: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      shadows
    >
      <CameraRig />

      <Suspense fallback={null}>
        {/* Low ambient so shadows have contrast — warm tint */}
        <ambientLight intensity={0.3} color="#fff5e6" />

        {/* Main key light — warm sun from upper-right, casts shadows */}
        <directionalLight
          position={[4, 6, 3]}
          intensity={1.8}
          color="#ffe4c4"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          /* Frustum tightened to the room's actual extent (x±2.26, z±1.94).
             At ±5 the 2048 map gave ~4.9mm texels; ±2.8 nearly doubles that. */
          shadow-camera-near={2}
          shadow-camera-far={16}
          shadow-camera-left={-2.8}
          shadow-camera-right={2.8}
          shadow-camera-top={2.8}
          shadow-camera-bottom={-2.8}
          shadow-bias={-0.0004}
          /* normalBias was 0.15 — a fifth of Blobby's height — which shoved
             shadows off their casters (the bonsai's shadow floated on the wall
             as a detached grey slab). 0.03 still kills acne on the noisy mesh. */
          shadow-normalBias={0.03}
        />

        {/* Fill light — cool blue from the left, softer */}
        <directionalLight
          position={[-3, 4, -2]}
          intensity={0.4}
          color="#d4e5ff"
        />

        {/* Rim/back light — subtle warm highlight on edges */}
        <directionalLight
          position={[-1, 3, 5]}
          intensity={0.3}
          color="#ffeedd"
        />

        {/* Soft environment for subtle reflections — low intensity */}
        <Environment preset="apartment" environmentIntensity={0.3} />

        {/* NOTE: <WindowScene /> is deliberately not rendered. room.glb already
            has a garden backdrop baked behind the moon window; the placeholder
            gradient disc sat in front of it (z=-1.0 vs the wall at z=-1.94) and
            read as a flat green blob. Kept in the tree for the future
            swappable-scene feature, but it needs correct placement first. */}

        {/* Blobby + Room — stays mounted, outfit swaps happen inside */}
        <BlobbyModel />

        {/* TODO: Mood-reactive particles + post-processing (disabled - wawa-vfx crash) */}
      </Suspense>
    </Canvas>
  );
};

export default SceneCanvas;
