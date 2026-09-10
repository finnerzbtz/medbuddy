import { useRef, useEffect, useMemo } from 'react';
import { useGLTF, Float, Sparkles } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore } from '@/stores/appStore';
import { useIdleBehavior } from '@/hooks/useIdleBehavior';
import type { BlobbyVariant, PetMood } from '@/types';

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

// ── Mood → color tint mapping ──────────────────────────────────────
// These multiply the base albedo, so a saturated value repaints the whole
// character. Blobby's albedo is pure white, which means the tint *is* his colour
// — at full strength he came out flat pink / green / red and read as a bug
// rather than a mood. Healthy moods are now neutral and the rest are only a
// wash, blended in at MOOD_TINT_STRENGTH.
const MOOD_TINT: Record<PetMood, THREE.Color> = {
  happy:    new THREE.Color('#FFFFFF'),   // his own colour — nothing to signal
  content:  new THREE.Color('#FFFFFF'),
  bored:    new THREE.Color('#E9E6E2'),   // faintly drab
  sad:      new THREE.Color('#D6E0EC'),   // cool
  sick:     new THREE.Color('#DCE9CE'),   // faintly green
  critical: new THREE.Color('#E9CBC6'),   // faintly flushed
};

// How far to blend from the true albedo toward the mood tint (0 = off, 1 = full).
const MOOD_TINT_STRENGTH = 0.35;

// Scratch colour reused each frame so tinting allocates nothing in the render loop.
const tintScratch = new THREE.Color();

// ── Procedural behavior constants ──────────────────────────────────
const BREATHE_SPEED = 1.8;       // cycles per second
const BREATHE_AMOUNT = 0.04;     // scale amplitude on Spine Y
const SWAY_SPEED = 0.7;          // slow wobble
const SWAY_AMOUNT = 0.015;       // radians of Z-rotation
const HEAD_BOB_SPEED = 2.5;
const HEAD_BOB_AMOUNT = 0.008;   // subtle head bob offset
const HEAD_TRACK_SPEED = 3;      // damping speed for head tracking
const COLOR_DAMP_SPEED = 2;      // how fast tint transitions

// ── Environment heights, measured from room.glb (see scripts/measure-room.py) ──
// The room is modelled with a raised tatami deck, so "the floor" is NOT y=0.
const FLOOR_Y = 0.335;        // top of the tatami mats
const CUSHION_TOP_Y = 0.86;   // flat top of the beanbag at its centre
const CUSHION_SINK = 0.04;    // how far Blobby settles into the squishy top
const CUSHION_SEAT_Y = CUSHION_TOP_Y - CUSHION_SINK;

const CUSHION_POS = new THREE.Vector3(1.26, 0, -0.01);   // measured cushion centre

function getIdlePos(variant: BlobbyVariant): THREE.Vector3 {
  return new THREE.Vector3(
    CUSHION_POS.x,
    CUSHION_SEAT_Y + VARIANT_Y_OFFSET[variant],
    CUSHION_POS.z,
  );
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

// Root.position is deliberately KEPT: it is the only rigid channel on this rig.
// Bouncing via Spine.position translates the torso while the legs stay pinned to
// Root, which stretches the mesh and makes the silhouette wobble between frames.
// Root.position moves the whole character as one piece, and composes cleanly with
// the world placement the app writes to sceneRoot.position.
// Root rotation/scale stay stripped — the app drives sway through rootBone.rotation.
function stripRootTracks(clip: THREE.AnimationClip) {
  clip.tracks = clip.tracks.filter(
    (t) =>
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

function findBone(armature: THREE.Object3D, name: string): THREE.Bone | null {
  let bone: THREE.Bone | null = null;
  armature.traverse((child) => {
    if ((child as THREE.Bone).isBone && child.name === name && !bone) {
      bone = child as THREE.Bone;
    }
  });
  return bone;
}

// Per-variant state: scene root (contains armature + skinned mesh), mixer, clips
interface VariantState {
  sceneRoot: THREE.Object3D;
  armature: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  action: THREE.AnimationAction | null;
  // Bone refs for procedural animation
  spineBone: THREE.Bone | null;
  headBone: THREE.Bone | null;
  rootBone: THREE.Bone | null;
  // Material refs for color tinting
  materials: THREE.MeshStandardMaterial[];
  originalColors: THREE.Color[];
}

export const BlobbyModel = () => {
  const groupRef = useRef<THREE.Group>(null);
  const walkElapsedRef = useRef(0);
  const hasLandedRef = useRef(false);
  const prevAnimRef = useRef<string | null>(null);
  const variantStatesRef = useRef<Record<BlobbyVariant, VariantState> | null>(null);

  // For procedural behaviors
  const timeRef = useRef(0);
  const targetTintRef = useRef(new THREE.Color('#FFECD2'));
  const currentTintRef = useRef(new THREE.Color('#FFECD2'));
  const pointerRef = useRef(new THREE.Vector2(0, 0));
  // Smoothed look-at offset, applied *on top of* the baked head animation
  const headOffsetRef = useRef(new THREE.Vector2(0, 0));
  const currentAnimation = useAppStore((state) => state.currentAnimation);
  const currentVariant = useAppStore((state) => state.currentVariant);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const petMood = useAppStore((state) => state.petMood);

  // Track pointer position for head tracking
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };
    canvas.addEventListener('pointermove', onPointerMove);
    return () => canvas.removeEventListener('pointermove', onPointerMove);
  }, [gl]);

  // Idle behavior state machine
  const { update: updateIdleBehavior } = useIdleBehavior(petMood);

  // Update target tint when mood changes
  useEffect(() => {
    targetTintRef.current.copy(MOOD_TINT[petMood] ?? MOOD_TINT.content);
  }, [petMood]);

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

      // Grab individual bone refs for procedural animation
      const spineBone = findBone(arm, 'Spine');
      const headBone = findBone(arm, 'Head');
      const rootBone = findBone(arm, 'Root');

      // Collect materials for mood color tinting
      const materials: THREE.MeshStandardMaterial[] = [];
      const originalColors: THREE.Color[] = [];
      sceneRoot.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat?.isMeshStandardMaterial && !materials.includes(mat)) {
            materials.push(mat);
            originalColors.push(mat.color.clone());
          }
        }
      });

      states[v] = {
        sceneRoot, armature: arm, mixer, clips, action: null,
        spineBone, headBone, rootBone,
        materials, originalColors,
      };
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
  // Uses crossfade for smooth blending between non-walk animations
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

      const clip = state.clips.find((c) => c.name === currentAnimation)
        ?? state.clips.find((c) => c.name === 'idle');
      if (!clip) continue;

      const newAction = state.mixer.clipAction(clip);

      if (isWalk) {
        // Walk needs an immediate hard reset — no crossfade
        state.mixer.stopAllAction();
        newAction.reset().play();
        newAction.setLoop(THREE.LoopRepeat, Infinity);
        newAction.clampWhenFinished = true;
      } else if (state.action && state.action !== newAction) {
        // Crossfade from current to new over 300ms
        newAction.reset().play();
        state.action.crossFadeTo(newAction, 0.3, true);
        // Reset position for non-walk animations
        state.sceneRoot.position.copy(getIdlePos(v));
        state.sceneRoot.rotation.set(0, 0, 0);
      } else {
        // No previous action — just play
        state.mixer.stopAllAction();
        newAction.reset().play();
        state.sceneRoot.position.copy(getIdlePos(v));
        state.sceneRoot.rotation.set(0, 0, 0);
      }

      state.action = newAction;
    }
  }, [currentAnimation, variantStates]);

  // ── Main render loop: mixers + walk + procedural behaviors ─────────
  useFrame((_, delta) => {
    const states = variantStatesRef.current;
    if (!states) return;

    timeRef.current += delta;
    const t_anim = timeRef.current;
    const clampedDelta = Math.min(delta, 0.05); // prevent big jumps

    // Update all animation mixers
    if (isPlaying) {
      for (const v of ALL_VARIANTS) {
        states[v]?.mixer.update(delta);
      }
    }

    // ── Walk-to-cushion position logic ──────────────────────────────
    if (currentAnimation === 'walk_to_cushion' && isPlaying) {
      walkElapsedRef.current += delta;
      const t = walkElapsedRef.current;

      let px: number, baseY: number, pz: number, ry: number;

      // baseY is an absolute world height for Blobby's feet.
      if (t <= WALK_END) {
        const pos = lerpPath(t);
        px = pos.x; baseY = FLOOR_Y; pz = pos.z;
        const futurePos = lerpPath(t + 0.1);
        const dir = futurePos.clone().sub(pos);
        ry = dir.lengthSq() > 0.0001 ? Math.atan2(dir.x, dir.z) : 0;
      } else if (t <= JUMP_END) {
        const jumpProgress = (t - WALK_END) / (JUMP_END - WALK_END);
        const arcY = JUMP_HEIGHT * Math.sin(jumpProgress * Math.PI);
        px = WALK_ARRIVAL.x + (CUSHION_POS.x - WALK_ARRIVAL.x) * jumpProgress;
        pz = WALK_ARRIVAL.z + (CUSHION_POS.z - WALK_ARRIVAL.z) * jumpProgress;
        baseY = FLOOR_Y + (CUSHION_SEAT_Y - FLOOR_Y) * jumpProgress + arcY;
        ry = Math.atan2(CUSHION_POS.x - WALK_ARRIVAL.x, CUSHION_POS.z - WALK_ARRIVAL.z);
      } else if (t <= SETTLE_END) {
        if (!hasLandedRef.current) {
          hasLandedRef.current = true;
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
        baseY = CUSHION_SEAT_Y + bounce;
        pz = CUSHION_POS.z;
        ry = Math.PI * 0.75;
      } else {
        px = CUSHION_POS.x;
        baseY = CUSHION_SEAT_Y;
        pz = CUSHION_POS.z;
        ry = Math.PI * 0.75;
      }

      for (const v of ALL_VARIANTS) {
        const state = states[v];
        if (!state) continue;
        state.sceneRoot.position.set(px, baseY + VARIANT_Y_OFFSET[v], pz);
        state.sceneRoot.rotation.y = ry;
      }
    }

    // ── Procedural behaviors (applied AFTER baked animation update) ──
    // Only apply when not walking (settled on cushion)
    const isSettled = currentAnimation !== 'walk_to_cushion' || hasLandedRef.current;
    if (!isSettled) return;

    // Update idle behavior state machine
    const idleState = updateIdleBehavior(delta);

    // ── Head look-at offset ──────────────────────────────────────────
    // Computed once per frame (not per variant) and applied additively below,
    // so the authored head animation still reads through underneath it.
    {
      let targetRotY = pointerRef.current.x * 0.3;
      let targetRotX = -pointerRef.current.y * 0.15;

      // Idle behavior can steer the head away from the pointer
      if (idleState.active) {
        const idleBlend = 0.7;
        targetRotY = targetRotY * (1 - idleBlend) + idleState.headTargetY * idleBlend;
        targetRotX = targetRotX * (1 - idleBlend) + idleState.headTargetX * idleBlend;
      }

      const lerpFactor = 1 - Math.exp(-HEAD_TRACK_SPEED * clampedDelta);
      headOffsetRef.current.y += (targetRotY - headOffsetRef.current.y) * lerpFactor;
      headOffsetRef.current.x += (targetRotX - headOffsetRef.current.x) * lerpFactor;
    }

    for (const v of ALL_VARIANTS) {
      const state = states[v];
      if (!state || !state.sceneRoot.visible) continue;

      // 1. BREATHING — Spine Y-scale oscillation
      if (state.spineBone) {
        const breathe = Math.sin(t_anim * BREATHE_SPEED * Math.PI * 2) * BREATHE_AMOUNT;
        state.spineBone.scale.y = 1 + breathe;
        state.spineBone.scale.x = 1 - breathe * 0.3;
        state.spineBone.scale.z = 1 - breathe * 0.3;
      }

      // 2. SWAY + IDLE TILT — Root Z-rotation wobble, plus idle body tilt
      if (state.rootBone) {
        const sway = Math.sin(t_anim * SWAY_SPEED * Math.PI * 2) * SWAY_AMOUNT;
        const idleTilt = idleState.active ? idleState.bodyTilt : 0;
        state.rootBone.rotation.z = sway + idleTilt;
      }

      // 3. HEAD TRACKING + IDLE OVERRIDES
      // Added to whatever the mixer just wrote, rather than replacing it, so
      // look-at layers on top of the authored head motion instead of erasing it.
      if (state.headBone) {
        const headBobX = Math.sin(t_anim * HEAD_BOB_SPEED) * HEAD_BOB_AMOUNT;
        const headBobZ = Math.cos(t_anim * HEAD_BOB_SPEED * 0.7) * HEAD_BOB_AMOUNT * 0.5;

        state.headBone.rotation.y += headOffsetRef.current.y;
        state.headBone.rotation.x += headOffsetRef.current.x + headBobX;
        state.headBone.rotation.z += headBobZ;
      }

      // 4. IDLE BODY BOUNCE (happy hops, perk-ups, etc)
      // Assigned as an absolute height, never accumulated. This was `+=`, which
      // added the bounce again on every rendered frame — once any hop behaviour
      // fired, Blobby drifted upward at ~0.15/frame and left the room entirely
      // within a couple of seconds.
      if (currentAnimation !== 'walk_to_cushion') {
        state.sceneRoot.position.y =
          CUSHION_SEAT_Y + VARIANT_Y_OFFSET[v] +
          (idleState.active ? idleState.bodyBounce : 0);
      }

      // 5. MOOD COLOR TINTING — smooth lerp material colors
      const tintLerp = 1 - Math.exp(-COLOR_DAMP_SPEED * clampedDelta);
      currentTintRef.current.lerp(targetTintRef.current, tintLerp);

      for (let i = 0; i < state.materials.length; i++) {
        const mat = state.materials[i];
        const orig = state.originalColors[i];
        // Blend from the true albedo toward the tinted version rather than
        // replacing it outright, so mood reads as a shift, not a repaint.
        tintScratch.copy(orig).multiply(currentTintRef.current);
        mat.color.copy(orig).lerp(tintScratch, MOOD_TINT_STRENGTH);
      }
    }
  });

  // Sparkle intensity scales with happiness
  const showSparkles = petMood === 'happy' || petMood === 'content';

  return (
    <group ref={groupRef}>
      {/* Room from separate room.glb — transform baked into the GLB node */}
      {roomNode && <primitive object={roomNode} />}

      {/* Float gives gentle hovering bob — disabled during walk */}
      <Float
        speed={1.5}
        rotationIntensity={0.1}
        floatIntensity={currentAnimation === 'walk_to_cushion' ? 0 : 0.15}
        floatingRange={[-0.03, 0.03]}
      >
        {ALL_VARIANTS.map((v) => {
          const state = variantStates[v];
          if (!state) return null;
          return <primitive key={v} object={state.sceneRoot} />;
        })}
      </Float>

      {/* Happy sparkles around Blobby's cushion position */}
      {showSparkles && (
        <Sparkles
          count={14}
          // Tight halo just above Blobby's head. At scale 1.5 they scattered
          // across the whole room and read as render artifacts.
          scale={[0.55, 0.4, 0.55]}
          position={[CUSHION_POS.x, CUSHION_SEAT_Y + 0.95, CUSHION_POS.z]}
          size={2}
          speed={0.35}
          opacity={0.5}
          color="#FFD700"
        />
      )}
    </group>
  );
};

useGLTF.preload('/models/blobby-base.glb');
useGLTF.preload('/models/blobby-raincoat.glb');
useGLTF.preload('/models/blobby-sweater.glb');
useGLTF.preload('/models/blobby-glasses.glb');
useGLTF.preload('/models/room.glb');
