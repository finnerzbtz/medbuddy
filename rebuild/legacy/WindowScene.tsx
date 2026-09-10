import { useMemo } from 'react';
import * as THREE from 'three';
import { useAppStore } from '@/stores/appStore';
import type { WindowScene as WindowSceneType } from '@/types';

/**
 * Gradient colors per window scene — used as placeholder until
 * we swap in animated video textures or shader-based scenes.
 */
const SCENE_COLORS: Record<WindowSceneType, [top: string, bottom: string]> = {
  garden:     ['#7ec850', '#3a6b24'],
  river:      ['#87ceeb', '#4a90a4'],
  forest:     ['#2d5a27', '#1a3a15'],
  underwater: ['#1a6b8a', '#0a2d3d'],
};

/**
 * WindowScene renders a colored disc behind the circular moon-window
 * opening in the room mesh. The disc sits just inside the back wall
 * so it's visible through the window but doesn't poke through walls.
 *
 * Position calibrated for the room.glb baked geometry:
 *   Blender Z-up → Three.js Y-up mapping
 *   Window center ≈ (1.0, 2.4, -1.0) in Three.js world space
 */
export const WindowScene = () => {
  const windowScene = useAppStore((s) => s.windowScene);

  const material = useMemo(() => {
    const [top, bottom] = SCENE_COLORS[windowScene];

    // Create a simple gradient texture via canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    return new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.FrontSide,
      toneMapped: false,
    });
  }, [windowScene]);

  return (
    <mesh
      position={[1.0, 2.4, -1.0]}
      rotation={[0, 0, 0]}
      material={material}
    >
      {/* Circle geometry — radius matched to window opening */}
      <circleGeometry args={[0.85, 64]} />
    </mesh>
  );
};
