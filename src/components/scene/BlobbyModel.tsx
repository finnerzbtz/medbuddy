import { useRef, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '@/stores/appStore';
import type { BlobbyVariant } from '@/types';

// Draco decoder is auto-configured by drei's useGLTF from CDN

// Per-variant Y offset to put feet on the floor.
// New Meshy models are all centered at origin with ~0.814 height,
// mesh bottom at Y ≈ -0.407. All variants now share the same offset.
const VARIANT_Y_OFFSET: Record<BlobbyVariant, number> = {
  base:     0.407,
  raincoat: 0.407,
  sweater:  0.407,
  glasses:  0.407,
};

const CUSHION_POS = new THREE.Vector3(1.25, 0, 0.0);
const CUSHION_SIT_HEIGHT = 0.45;

function getIdlePos(variant: BlobbyVariant): THREE.Vector3 {
  return new THREE.Vector3(1.25, VARIANT_Y_OFFSET[variant] + CUSHION_SIT_HEIGHT, 0.0);
}

const WALK_END = 9.0;
const JUMP_END = 10.0;
const SETTLE_END = 11.0;
const JUMP_HEIGHT = 0.6;
const WALK_ARRIVAL = new THREE.Vector3(1.25, 0, 0.6);

const WALK_PATH = [
  { time: 0, pos: new THREE.Vector3(-0.8, 0, -0.7) },
  { time: 1.5, pos: new THREE.Vector3(-0.8, 0, 0.2) },
  { time: 3.0, pos: new THREE.Vector3(-0.8, 0, 1.1) },
  { time: 4.5, pos: new THREE.Vector3(-0.2, 0, 1.1) },
  { time: 6.0, pos: new THREE.Vector3(0.6, 0, 1.1) },
  { time: 7.5, pos: new THREE.Vector3(1.25, 0, 0.8) },
  { time: WALK_END, pos: WALK_ARRIVAL.clone() },
];

function lerpPath(elapsed: number): THREE.Vector3 {
  const t = Math.min(elapsed, WALK_END);
  for (let i = 0; i < WALK_PATH.length - 1; i++) {
    const a = WALK_PATH[i];
    const b = WALK_PATH[i + 1];
    if (t >= a.time && t <= b.time) {
      const alpha = (t - a.time) / (b.time - a.time);
      return new THREE.Vector3().lerpVectors(a.pos, b.pos, alpha);
    }
  }
  return WALK_PATH[WALK_PATH.length - 1].pos.clone();
}

const ALL_VARIANTS: BlobbyVariant[] = ['base', 'raincoat', 'sweater', 'glasses'];

function stripRootTracks(clip: THREE.AnimationClip) {
  clip.tracks = clip.tracks.filter(
    (t) =>
      !t.name.includes('Root.position') &&
      !t.name.includes('Root.quaternion') &&
      !t.name.includes('Root.scale'),
  );
}

function findArmature(scene: THREE.Object3D): THREE.Object3D | null {
  let armature: THREE.Object3D | null = null;
  scene.traverse((child) => {
    if (child.name.toLowerCase().includes('armature') && !armature) {
      armature = child;
    }
  });
  return armature;
}

// Per-variant state: scene root (contains armature + skinned mesh), mixer, clips
interface VariantState {
  /** The full GLTF scene — contains both the armature and skinned mesh as siblings */
  sceneRoot: THREE.Object3D;
  /** The armature node inside the scene — used for animation mixer binding */
  armature: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action: THREE.AnimationAction | null;
}

export const BlobbyModel = () => {
  const groupRef = useRef<THREE.Group>(null);
  const walkElapsedRef = useRef(0);
  const hasLandedRef = useRef(false);
  const prevAnimRef = useRef<string | null>(null);
  const variantStatesRef = useRef<Record<BlobbyVariant, VariantState> | null>(null);

  const currentAnimation = useAppStore((state) => state.currentAnimation);
  const currentVariant = useAppStore((state) => state.currentVariant);
  const isPlaying = useAppStore((state) => state.isPlaying);

  // Load all 4 character GLBs + separate room GLB
  const baseGLTF = useGLTF('/models/blobby-base.glb');
  const raincoatGLTF = useGLTF('/models/blobby-raincoat.glb');
  const sweaterGLTF = useGLTF('/models/blobby-sweater.glb');
  const glassesGLTF = useGLTF('/models/blobby-glasses.glb');
  const roomGLTF = useGLTF('/models/room.glb');

  const gltfs = useMemo(() => ({
    base: baseGLTF,
    raincoat: raincoatGLTF,
    sweater: sweaterGLTF,
    glasses: glassesGLTF,
  }), [baseGLTF, raincoatGLTF, sweaterGLTF, glassesGLTF]);

  // Room node — loaded from separate room.glb
  const roomNode = useMemo(() => {
    const scene = roomGLTF.scene;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) {
          mat.envMapIntensity = 0.3;
          mat.flatShading = false;
          mat.needsUpdate = true;
        }
      }
    });
    return scene;
  }, [roomGLTF.scene]);

  // Build all 4 variant states: full scene (armature + skinned mesh) + mixer + clips
  // All scenes are rendered but only the active one is visible
  const variantStates = useMemo(() => {
    const states = {} as Record<BlobbyVariant, VariantState>;

    for (const v of ALL_VARIANTS) {
      const sceneRoot = gltfs[v].scene;
      const arm = findArmature(sceneRoot);
      if (!arm) continue;

      // Configure materials on ALL meshes in the scene (including the skinned mesh)
      sceneRoot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial) {
            mat.envMapIntensity = 0.3;
            mat.flatShading = false;
            mat.needsUpdate = true;
          }
        }
      });

      // Strip Root tracks from all clips
      const clips = gltfs[v].animations;
      for (const clip of clips) {
        stripRootTracks(clip);
      }

      // Bind mixer to scene root so it can resolve bone names across the full
      // scene graph (armature + skinned mesh are siblings under sceneRoot)
      const mixer = new THREE.AnimationMixer(sceneRoot);

      states[v] = { sceneRoot, armature: arm, mixer, clips, action: null };
    }

    return states;
  }, [gltfs]);

  // Store ref for useFrame access
  variantStatesRef.current = variantStates;

  // Place all scenes at idle position on mount
  useEffect(() => {
    for (const v of ALL_VARIANTS) {
      const state = variantStates[v];
      if (!state) continue;
      state.sceneRoot.position.copy(getIdlePos(v));
    }
  }, [variantStates]);

  // Toggle visibility when variant changes
  useEffect(() => {
    for (const v of ALL_VARIANTS) {
      const state = variantStates[v];
      if (!state) continue;
      state.sceneRoot.visible = v === currentVariant;
    }
  }, [currentVariant, variantStates]);

  // Play/pause all mixers together
  useEffect(() => {
    for (const v of ALL_VARIANTS) {
      const state = variantStates[v];
      if (!state) continue;
      state.mixer.timeScale = isPlaying ? 1 : 0;
    }
  }, [isPlaying, variantStates]);

  // Start animation on ALL variants simultaneously so they stay in sync
  useEffect(() => {
    if (prevAnimRef.current === currentAnimation) return;
    prevAnimRef.current = currentAnimation;

    const isWalk = currentAnimation === 'walk_to_cushion';

    if (isWalk) {
      walkElapsedRef.current = 0;
      hasLandedRef.current = false;
    }

    for (const v of ALL_VARIANTS) {
      const state = variantStates[v];
      if (!state) continue;

      state.mixer.stopAllAction();

      const clip = state.clips.find((c) => c.name === currentAnimation)
        ?? state.clips.find((c) => c.name === 'idle');
      if (!clip) continue;

      const action = state.mixer.clipAction(clip);

      if (isWalk) {
        action.reset().play();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = true;
      } else {
        action.reset().play();
        // Reset all scenes to idle position
        state.sceneRoot.position.copy(getIdlePos(v));
        state.sceneRoot.rotation.set(0, 0, 0);
      }

      state.action = action;
    }
  }, [currentAnimation, variantStates]);

  // Update ALL mixers and ALL armature positions every frame
  useFrame((_, delta) => {
    const states = variantStatesRef.current;
    if (!states) return;

    // Update all mixers
    if (isPlaying) {
      for (const v of ALL_VARIANTS) {
        states[v]?.mixer.update(delta);
      }
    }

    // Position logic — applied to ALL armatures so they stay in sync
    if (currentAnimation !== 'walk_to_cushion') return;
    if (!isPlaying) return;

    walkElapsedRef.current += delta;
    const t = walkElapsedRef.current;

    // Compute base position (variant-independent: Y relative to floor = 0)
    let px: number, baseY: number, pz: number, ry: number;

    if (t <= WALK_END) {
      const pos = lerpPath(t);
      px = pos.x; baseY = 0; pz = pos.z;
      const futurePos = lerpPath(t + 0.1);
      const dir = futurePos.clone().sub(pos);
      ry = dir.lengthSq() > 0.0001 ? Math.atan2(dir.x, dir.z) : 0;
    } else if (t <= JUMP_END) {
      const jumpProgress = (t - WALK_END) / (JUMP_END - WALK_END);
      const arcY = JUMP_HEIGHT * Math.sin(jumpProgress * Math.PI);
      px = WALK_ARRIVAL.x + (CUSHION_POS.x - WALK_ARRIVAL.x) * jumpProgress;
      pz = WALK_ARRIVAL.z + (CUSHION_POS.z - WALK_ARRIVAL.z) * jumpProgress;
      baseY = CUSHION_SIT_HEIGHT * jumpProgress + arcY;
      ry = Math.atan2(CUSHION_POS.x - WALK_ARRIVAL.x, CUSHION_POS.z - WALK_ARRIVAL.z);
    } else if (t <= SETTLE_END) {
      if (!hasLandedRef.current) {
        hasLandedRef.current = true;
        // Switch all variants from walk to idle
        for (const v of ALL_VARIANTS) {
          const state = states[v];
          if (!state) continue;
          state.mixer.stopAllAction();
          const idleClip = state.clips.find((c) => c.name === 'idle');
          if (idleClip) {
            const idleAction = state.mixer.clipAction(idleClip);
            idleAction.reset().play();
            state.action = idleAction;
          }
        }
      }
      const settleProgress = (t - JUMP_END) / (SETTLE_END - JUMP_END);
      const bounce = 0.05 * Math.sin(settleProgress * Math.PI) * (1 - settleProgress);
      px = CUSHION_POS.x;
      baseY = CUSHION_SIT_HEIGHT + bounce;
      pz = CUSHION_POS.z;
      ry = Math.PI * 0.75;
    } else {
      px = CUSHION_POS.x;
      baseY = CUSHION_SIT_HEIGHT;
      pz = CUSHION_POS.z;
      ry = Math.PI * 0.75;
    }

    // Apply position to ALL scene roots with per-variant Y offset
    for (const v of ALL_VARIANTS) {
      const state = states[v];
      if (!state) continue;
      state.sceneRoot.position.set(px, VARIANT_Y_OFFSET[v] + baseY, pz);
      state.sceneRoot.rotation.y = ry;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Room from separate room.glb — transform baked into the GLB node */}
      {roomNode && <primitive object={roomNode} />}
      {ALL_VARIANTS.map((v) => {
        const state = variantStates[v];
        if (!state) return null;
        return <primitive key={v} object={state.sceneRoot} />;
      })}
    </group>
  );
};

useGLTF.preload('/models/blobby-base.glb');
useGLTF.preload('/models/blobby-raincoat.glb');
useGLTF.preload('/models/blobby-sweater.glb');
useGLTF.preload('/models/blobby-glasses.glb');
useGLTF.preload('/models/room.glb');
