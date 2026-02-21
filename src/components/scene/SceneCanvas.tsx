import { Suspense, useEffect } from 'react';
import type { FC } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { BlobbyModel } from './BlobbyModel';
import * as THREE from 'three';

/** Points the orthographic camera at the room center and auto-fits zoom */
const CameraRig = () => {
  const { camera, size } = useThree();

  useEffect(() => {
    camera.lookAt(0, 1.4, 0);

    const worldExtent = 7;
    const baseZoom = Math.min(size.width, size.height) / worldExtent;
    (camera as any).zoom = baseZoom;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
};

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
          shadow-camera-near={0.5}
          shadow-camera-far={20}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
          shadow-bias={-0.0005}
          shadow-normalBias={0.15}
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

        {/* Blobby + Room — stays mounted, outfit swaps happen inside */}
        <BlobbyModel />
      </Suspense>
    </Canvas>
  );
};

export default SceneCanvas;
