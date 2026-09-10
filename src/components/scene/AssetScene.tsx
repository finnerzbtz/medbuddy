import { appAudio } from '@/audio/AppAudio';
import { SceneSound } from '@/audio/SceneSound';
import RoomCollection from './RoomCollection';
import { DEFAULT_ROOM, roomHiddenGroups } from '@/domain/room';
import Snack from './Snack';
import { FEED, type FeedTarget } from '@/domain/feeding';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import type { AnimationName, FoodId, RoomStyle } from '@/types';
import { GROUP_PARENT, MOOD_LOOKS, RoomJourney } from '@/domain/choreography';
import { TEA, teaCloseup } from '@/domain/tea';
import { DAYLIGHT, type RoomEnvironmentState } from '@/domain/environment';
import { animationSpeed, Spring } from '@/domain/motion';
import MoodEffects, { RoomProps, type RoomObjects } from './RoomLife';
import { assetContract, assetReport } from '@/generated/assets';

export type AssetOutfit = (typeof assetContract.outfits)[number];
export type AssetClip = keyof typeof assetContract.clips;
export interface SceneMetrics {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
interface Props {
  outfit: AssetOutfit;
  presentation?: 'celebration';
  clip: AssetClip;
  playing: boolean;
  room?: boolean;
  roomStyle?: RoomStyle;
  cosy?: boolean;
  closeUp?: boolean;
  reactionId?: number;
  food?: FoodId;
  onPet?: () => void;
  onFeedTarget?: (target: FeedTarget) => void;
  environment?: RoomEnvironmentState;
  lampOn?: boolean;
  onLampToggle?: () => void;
  onInteract?: (activity: AnimationName) => void;
  onActivityArrive?: (activity: AnimationName) => void;
  onActivityComplete?: (activity: AnimationName) => void;
  loopJourney?: boolean;
  freezeCamera?: boolean;
  orbit?: boolean;
  cameraStep?: { direction: 'left' | 'right' | 'up' | 'down' | 'in' | 'out'; id: number };
  wireframe?: boolean;
  hiddenGroups?: string[];
  onMetrics?: (value: SceneMetrics) => void;
  onReady?: (ready: boolean) => void;
}
const urls = {
  characters: `/assets-v2/characters.glb?v=${assetReport.assets.characters.hash}`,
  room: `/assets-v2/room.glb?v=${assetReport.assets.room.hash}`,
};

function useVisible() {
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

export { useReducedMotion } from '@/components/app/useReducedMotion';

function materialsFor(object: THREE.Object3D) {
  const materials: THREE.MeshStandardMaterial[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const source = Array.isArray(child.material) ? child.material : [child.material];
    const owned = source.map((mat) => {
      const m = mat.clone() as THREE.MeshStandardMaterial;
      m.envMapIntensity = 0.22;
      materials.push(m);
      return m;
    });
    child.material = Array.isArray(child.material) ? owned : owned[0];
  });
  return materials;
}

function Character({
  outfit,
  presentation,
  clip,
  playing,
  wireframe = false,
  room,
  cosy,
  reactionId,
  food,
  onPet,
  onFeedTarget,
  onActivityArrive,
  onActivityComplete,
  journey,
  objects,
}: Props & { journey: RoomJourney; objects: RoomObjects }) {
  const asset = useGLTF(urls.characters, false);
  const { object, materials } = useMemo(() => {
    const object = clone(asset.scene);
    return { object, materials: materialsFor(object) };
  }, [asset.scene]);
  const sound = useRef(new SceneSound((cue, pan) => appAudio.cue(cue, pan)));
  const mixer = useMemo(() => new THREE.AnimationMixer(object), [object]);
  const previous = useRef<THREE.AnimationAction>();
  const placement = useRef<THREE.Group>(null);
  const playingRef = useRef(playing);
  const sleeper = useRef<THREE.Group>(null);
  const arrived = useRef(false);
  const completed = useRef(false);
  useEffect(() => {
    objects.pet = placement.current ?? undefined;
    return () => {
      delete objects.pet;
    };
  }, [objects]);
  const arrivalCallback = useRef(onActivityArrive);
  arrivalCallback.current = onActivityArrive;
  playingRef.current = playing;
  const tint = useMemo(() => new THREE.Color(MOOD_LOOKS[clip].body), [clip]);
  const bodyMaterials = useMemo(
    () => materials.filter((m) => m.name.toLowerCase().includes('porcelain')),
    [materials],
  );
  const invalidate = useThree((s) => s.invalidate);
  const { camera, size } = useThree();
  const foodPoint = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    object.traverse((node) => {
      const allowed = node.userData.variants as string | undefined;
      if (allowed) node.visible = allowed === 'all' || allowed.split(',').includes(outfit);
    });
    invalidate();
  }, [object, outfit, invalidate]);
  useEffect(() => {
    materials.forEach((mat) => {
      mat.wireframe = wireframe;
    });
    invalidate();
  }, [materials, wireframe, invalidate]);
  const select = useCallback(
    (name: AssetClip, restart = false) => {
      const animation = asset.animations.find((a) => a.name === name);
      if (!animation) throw new Error(`Missing animation: ${name}`);
      const action = mixer.clipAction(animation);
      if (previous.current === action && !restart) return;
      action
        .reset()
        .setEffectiveWeight(1)
        .setEffectiveTimeScale(
          presentation === 'celebration'
            ? 1.5
            : cosy
              ? ['tea', 'feeding'].includes(name)
                ? 0
                : animationSpeed(name)
              : 1,
        )
        .play();
      if (previous.current && previous.current !== action) {
        if (playingRef.current) previous.current.crossFadeTo(action, 0.32, false);
        else previous.current.stop();
      }
      if (!playingRef.current) {
        action.time =
          cosy && name === 'tea'
            ? TEA.stillTime
            : cosy && name === 'feeding'
              ? FEED.stillTime
              : animation.duration * 0.35;
        mixer.update(0);
      }
      previous.current = action;
      invalidate();
    },
    [asset.animations, mixer, invalidate, cosy, presentation],
  );
  useEffect(() => {
    arrived.current = false;
    completed.current = false;
    journey.setActivity(clip, !playingRef.current);
    select(cosy ? journey.animation : clip, true);
    if (!playingRef.current && placement.current && cosy) {
      placement.current.position.fromArray(journey.position);
      placement.current.rotation.y = journey.yaw;
      placement.current.rotation.z = 0;
      if (sleeper.current) {
        sleeper.current.rotation.x = clip === 'rest' ? -1.55 : 0;
        sleeper.current.position.y = clip === 'rest' ? 0.34 : 0;
      }
      placement.current.scale.setScalar(assetContract.characterScale * 1.22);
    }
    if (!playingRef.current && cosy) {
      arrived.current = true;
      arrivalCallback.current?.(clip);
    }
  }, [clip, reactionId, journey, cosy, select]);
  useEffect(() => {
    // A still pose has no journey. Starting motion again gives it a real ending.
    if (cosy && playing && !journey.segments.length) {
      journey.setActivity(clip);
      select(journey.animation, true);
    }
  }, [cosy, playing, journey, clip, select]);
  useEffect(() => {
    if (cosy && !playing) {
      bodyMaterials.forEach((m) => m.color.copy(tint));
      invalidate();
    }
  }, [clip, cosy, playing, bodyMaterials, tint, invalidate]);
  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(object);
      materials.forEach((mat) => mat.dispose());
    },
    [mixer, object, materials],
  );
  useEffect(() => {
    if (import.meta.env.DEV && !presentation) {
      const target = window as unknown as { __assetCharacter?: unknown };
      target.__assetCharacter = {
        object,
        mixer,
        clips: asset.animations,
        journey,
      };
      return () => {
        delete target.__assetCharacter;
      };
    }
  }, [object, mixer, asset.animations, presentation]);
  useFrame((_, delta) => {
    if (onFeedTarget && placement.current) {
      placement.current.updateWorldMatrix(true, false);
      camera.updateMatrixWorld();
      foodPoint.set(0, 1.05, 0.15).applyMatrix4(placement.current.matrixWorld).project(camera);
      const zoom = (camera as THREE.OrthographicCamera).zoom;
      onFeedTarget({
        x: ((foodPoint.x + 1) * size.width) / 2,
        y: ((1 - foodPoint.y) * size.height) / 2,
        width: Math.max(80, zoom * 1.05),
        height: Math.max(100, zoom * 1.5),
      });
    }
    if (!playing) return;
    const dt = Math.min(delta, 0.05);
    if (cosy && room && placement.current) {
      journey.update(dt);
      if (!presentation && window.location.pathname === '/')
        sound.current.update(
          journey.animation,
          journey.phase,
          journey.actionTime,
          journey.position[0],
          journey.position[2],
          journey.elapsed,
        );
      select(journey.animation);
      placement.current.position.fromArray(journey.position);
      const current = placement.current.rotation.y;
      const angle =
        current + Math.atan2(Math.sin(journey.yaw - current), Math.cos(journey.yaw - current));
      placement.current.rotation.y =
        journey.animation === 'tea' &&
        journey.phase === 'act' &&
        journey.actionTime >= TEA.gripStart
          ? journey.yaw
          : THREE.MathUtils.damp(current, angle, journey.animation === 'tea' ? 12 : 7, dt);
      const stretch = journey.squash;
      const scale = assetContract.characterScale * 1.22;
      placement.current.scale.set(
        scale / Math.sqrt(stretch),
        scale * stretch,
        scale / Math.sqrt(stretch),
      );
      placement.current.rotation.z = THREE.MathUtils.damp(
        placement.current.rotation.z,
        journey.lean,
        18,
        dt,
      );
      if (sleeper.current) {
        const sleeping = journey.phase === 'act' && journey.animation === 'rest';
        sleeper.current.rotation.x = THREE.MathUtils.damp(
          sleeper.current.rotation.x,
          sleeping ? -1.55 : 0,
          5,
          dt,
        );
        sleeper.current.position.y = THREE.MathUtils.damp(
          sleeper.current.position.y,
          sleeping ? 0.34 : 0,
          5,
          dt,
        );
      }
      bodyMaterials.forEach((m) => m.color.lerp(tint, 1 - Math.exp(-dt * 3)));
      if (
        !arrived.current &&
        journey.phase === 'act' &&
        journey.animation === clip &&
        journey.actionTime >= 0.24
      ) {
        arrived.current = true;
        arrivalCallback.current?.(clip);
      }
    }
    // Native arm keys and the real cup share the same action clock.
    if (cosy && ['tea', 'feeding'].includes(journey.animation) && previous.current)
      previous.current.time = Math.min(
        journey.animation === 'tea' ? TEA.duration : FEED.duration,
        journey.actionTime,
      );
    mixer.update(dt);
    if (
      cosy &&
      ['tea', 'feeding'].includes(clip) &&
      !completed.current &&
      !journey.loop &&
      journey.duration > 0 &&
      journey.elapsed >= journey.duration
    ) {
      completed.current = true;
      onActivityComplete?.(clip);
    }
  });
  return (
    <group
      ref={placement}
      position={room ? [...assetContract.anchors.pet] : [0, 0, 0]}
      scale={room ? assetContract.characterScale * (cosy ? 1.22 : 1) : 1}
    >
      <group ref={sleeper} name="Blobby_sleep_pose">
        <primitive
          object={object}
          dispose={null}
          onClick={
            onPet
              ? (event: { stopPropagation: () => void }) => {
                  event.stopPropagation();
                  onPet();
                }
              : undefined
          }
        />
      </group>
      {cosy && clip === 'feeding' && (
        <Snack food={food ?? 'apple'} playing={playing} journey={journey} />
      )}
    </group>
  );
}

function Room({
  wireframe = false,
  hiddenGroups = [],
  clip,
  cosy,
  playing,
  objects,
  onInteract,
  environment = DAYLIGHT,
  lampOn = true,
  onLampToggle,
}: Pick<
  Props,
  | 'wireframe'
  | 'hiddenGroups'
  | 'clip'
  | 'cosy'
  | 'playing'
  | 'onInteract'
  | 'environment'
  | 'lampOn'
  | 'onLampToggle'
> & {
  objects: RoomObjects;
}) {
  const asset = useGLTF(urls.room, false);
  const { object, materials } = useMemo(() => {
    const object = asset.scene.clone(true);
    const materials = materialsFor(object);
    // Authored linear colours need richer midtones under the realtime environment.
    materials.forEach((material) => {
      material.color.multiplyScalar(0.62);
      material.envMapIntensity = 0.12;
    });
    object.updateMatrixWorld(true);
    const pivots = [
      ['cup', 'Tea_cup', TEA.cupHome],
      ['can', 'Watering_can', assetContract.anchors.wateringCan],
      ['duvet', 'Bed_cover', [1.2, 0.43, -0.76]],
      ['leaves', 'Bonsai_leaves', [-1.65, 1.35, -1.23]],
      ['ball', 'Toy_ball', [1.25, 0.145, 1.4]],
      ['blanket', 'Blanket', [0, 0, 0]],
    ] as const;
    for (const [key, name, at] of pivots) {
      // Blender may suffix duplicate object names; the exported contract is stable.
      let node: THREE.Object3D | undefined;
      object.traverse((candidate) => {
        if (!node && candidate.userData.asset_group === name) node = candidate;
      });
      if (!node) continue;
      const pivot = new THREE.Group();
      pivot.name = 'Interactive_' + key;
      pivot.position.set(at[0], at[1], at[2]);
      object.add(pivot);
      pivot.updateMatrixWorld(true);
      pivot.attach(node);
      objects[key] = pivot;
      if (key === 'blanket' || key === 'duvet') pivot.visible = false;
    }
    return { object, materials };
  }, [asset.scene, objects]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    materials.forEach((mat) => {
      mat.wireframe = wireframe;
    });
    object.traverse((node) => {
      if (node.userData.asset_group)
        node.visible = !hiddenGroups.includes(
          GROUP_PARENT[node.userData.asset_group] ?? node.userData.asset_group,
        );
    });
    invalidate();
  }, [object, materials, wireframe, hiddenGroups, invalidate]);
  useEffect(() => {
    materials.forEach((m) => {
      if (m.name.includes('glowing porcelain')) {
        m.emissiveIntensity = lampOn && !hiddenGroups.includes('Lamp') ? 1.8 : 0;
      }
      if (cosy && m.name.toLowerCase().includes('sky')) {
        m.emissive.set(environment.sky);
        m.emissiveIntensity = 0.22;
      }
    });
    object.traverse((node) => {
      const group = node.userData.asset_group;
      if (['Window_sun', 'Window_moon', 'Window_stars'].includes(group))
        node.visible =
          !hiddenGroups.includes('Garden') &&
          (group === 'Window_sun' ? environment.daylight > 0.45 : environment.daylight <= 0.45);
    });
    invalidate();
  }, [environment, cosy, lampOn, hiddenGroups, object, materials, invalidate]);
  const baseColours = useMemo(() => materials.map((m) => m.color.clone()), [materials]);
  const targets = useMemo(
    () =>
      materials.map((m, i) => {
        if (!cosy) return baseColours[i];
        const look = MOOD_LOOKS[clip];
        return m.name.toLowerCase().includes('sky')
          ? new THREE.Color(environment.sky)
          : baseColours[i]
              .clone()
              .lerp(new THREE.Color(look.light), 0.06)
              .lerp(new THREE.Color('#8299c6'), (1 - environment.daylight) * 0.22)
              .multiplyScalar(0.65 + environment.daylight * 0.35);
      }),
    [clip, cosy, materials, baseColours, environment.sky, environment.daylight],
  );
  useEffect(() => {
    if (!playing) {
      materials.forEach((m, i) => m.color.copy(targets[i]));
      invalidate();
    }
  }, [targets, playing, materials, invalidate]);
  useFrame((_, delta) => {
    if (playing)
      materials.forEach((m, i) =>
        m.color.lerp(targets[i], 1 - Math.exp(-Math.min(delta, 0.05) * 2)),
      );
  });
  useEffect(() => () => materials.forEach((mat) => mat.dispose()), [materials]);
  const interaction = (node: THREE.Object3D): AnimationName | 'lamp' | undefined => {
    for (let at: THREE.Object3D | null = node; at; at = at.parent) {
      const group = GROUP_PARENT[at.userData.asset_group] ?? at.userData.asset_group;
      if (group === 'Tea_table') return 'tea';
      if (group === 'Bonsai') return 'tend';
      if (group === 'Garden') return 'window';
      if (group === 'Toy_ball') return 'ball';
      if (group === 'Bed') return 'rest';
      if (group === 'Lamp') return 'lamp';
    }
  };
  return (
    <primitive
      object={object}
      dispose={null}
      onClick={
        onInteract
          ? (event: { object: THREE.Object3D; stopPropagation: () => void }) => {
              const action = interaction(event.object);
              if (action) {
                event.stopPropagation();
                if (action === 'lamp') onLampToggle?.();
                else onInteract(action);
              }
            }
          : undefined
      }
      onPointerOver={
        onInteract
          ? (event: { object: THREE.Object3D; nativeEvent: PointerEvent }) => {
              if (interaction(event.object))
                (event.nativeEvent.target as HTMLCanvasElement).style.cursor = 'pointer';
            }
          : undefined
      }
      onPointerOut={
        onInteract
          ? (event: { nativeEvent: PointerEvent }) => {
              (event.nativeEvent.target as HTMLCanvasElement).style.cursor = '';
            }
          : undefined
      }
    />
  );
}

function CameraAndLight({
  room,
  roomStyle = DEFAULT_ROOM,
  presentation,
  orbit,
  cameraStep,
  onMetrics,
  cosy,
  closeUp,
  clip,
  playing,
  journey,
  freezeCamera,
  environment = DAYLIGHT,
  lampOn = true,
  hiddenGroups = [],
}: Pick<
  Props,
  | 'room'
  | 'roomStyle'
  | 'presentation'
  | 'orbit'
  | 'cameraStep'
  | 'onMetrics'
  | 'cosy'
  | 'closeUp'
  | 'clip'
  | 'playing'
  | 'freezeCamera'
  | 'environment'
  | 'lampOn'
  | 'hiddenGroups'
> & {
  journey: RoomJourney;
}) {
  const { camera, size, gl, scene, invalidate } = useThree();
  // Fit the full architectural silhouette with a little space around its edges.
  // Use both dimensions so narrow screens retain the walls without making the
  // room unnecessarily small on wider screens.
  const roomZoom = Math.min(Math.max(size.width, 1) / 6.35, Math.max(size.height, 1) / 6.1);
  const roomExtent = Math.max(1, Math.min(size.width, size.height)) / roomZoom;
  const follow = useMemo(() => new THREE.Vector3(0, 1.425, 0), []);
  const cameraMotion = useMemo(
    () => ({
      x: new Spring(0),
      y: new Spring(1.425),
      z: new Spring(0),
      extent: new Spring(6.35),
      aim: new THREE.Vector3(0, 1.425, 0),
    }),
    [],
  );
  const offset = useMemo(() => new THREE.Vector3(4.5, 5.5, 8.5), []);
  const appliedStep = useRef(-1);
  const frameCount = useRef(0);
  const elapsed = useRef(0);
  const target: [number, number, number] = room ? [...assetContract.camera.target] : [0, 1.1, 0];
  useEffect(() => {
    // Framing also runs during React's effect replay; reapply an initial camera
    // command after that reset instead of silently discarding the user's press.
    appliedStep.current = -1;
    const ortho = camera as THREE.OrthographicCamera;
    if (cosy && room) {
      // A fixed viewing direction plus parallel translation avoids orbiting,
      // changing perspective or zooming at every locomotion/idle boundary.
      camera.position.copy(follow).add(offset);
      camera.lookAt(follow);
      ortho.zoom = Math.min(size.width, size.height) / cameraMotion.extent.value;
      ortho.updateProjectionMatrix();
      invalidate();
      return;
    }
    const position = room
      ? cosy
        ? [4.7, 4.1, 8.5]
        : assetContract.camera.position
      : presentation
        ? [0, 1.9, 8]
        : [-3.4, 2.78, 7];
    const focus = room
      ? cosy
        ? closeUp
          ? [0.68, 1.1, 0.43]
          : [0.18, 1.25, 0.05]
        : assetContract.camera.target
      : presentation
        ? [0, 1.38, 0]
        : [0, 1.1, 0];
    ortho.position.set(position[0], position[1], position[2]);
    ortho.lookAt(focus[0], focus[1], focus[2]);
    ortho.zoom =
      Math.min(size.width, size.height) /
      (room
        ? cosy
          ? closeUp
            ? 3.1
            : size.width < 500
              ? 4.6
              : 5.0
          : assetContract.camera.extent
        : 3.1);
    ortho.updateProjectionMatrix();
    invalidate();
  }, [
    camera,
    size.width,
    size.height,
    presentation,
    room,
    cosy,
    closeUp,
    invalidate,
    follow,
    offset,
    cameraMotion,
  ]);
  useEffect(() => {
    if (!orbit || !cameraStep || appliedStep.current === cameraStep.id) return;
    appliedStep.current = cameraStep.id;
    const focus = new THREE.Vector3(
      ...(room ? assetContract.camera.target : ([0, 1.1, 0] as [number, number, number])),
    );
    const position = new THREE.Spherical().setFromVector3(camera.position.clone().sub(focus));
    const direction = cameraStep.direction;
    if (direction === 'left' || direction === 'right')
      position.theta += direction === 'left' ? -0.25 : 0.25;
    if (direction === 'up' || direction === 'down')
      position.phi = THREE.MathUtils.clamp(
        position.phi + (direction === 'up' ? -0.15 : 0.15),
        0.25,
        Math.PI * 0.49,
      );
    camera.position.setFromSpherical(position).add(focus);
    camera.lookAt(focus);
    const ortho = camera as THREE.OrthographicCamera;
    if (direction === 'in' || direction === 'out')
      ortho.zoom = THREE.MathUtils.clamp(
        ortho.zoom * (direction === 'in' ? 1.2 : 1 / 1.2),
        30,
        550,
      );
    ortho.updateProjectionMatrix();
    invalidate();
  }, [cameraStep, orbit, room, camera, size.width, size.height, invalidate]);
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const environment = new RoomEnvironment();
    const texture = generator.fromScene(environment, 0.04);
    scene.environment = texture.texture;
    environment.dispose();
    generator.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      texture.dispose();
    };
  }, [gl, scene, invalidate]);
  useEffect(() => {
    scene.environmentIntensity = cosy ? 0.28 + environment.daylight * 0.72 : 1;
    invalidate();
  }, [scene, cosy, environment.daylight, invalidate]);
  useEffect(() => {
    if (import.meta.env.DEV && !presentation) {
      const target = window as unknown as { __assetScene?: unknown };
      target.__assetScene = { scene, camera, renderer: gl };
      return () => {
        delete target.__assetScene;
      };
    }
  }, [scene, camera, gl]);
  useFrame((_, delta) => {
    elapsed.current += delta;
    frameCount.current++;
    if (room && cosy && !freezeCamera) {
      const p = journey.position,
        motion = cameraMotion,
        aim = motion.aim;
      if (closeUp) {
        const dx = p[0] - aim.x,
          dz = p[2] - aim.z;
        if (Math.abs(dx) > 0.24)
          aim.x = THREE.MathUtils.clamp(p[0] - Math.sign(dx) * 0.24, -0.9, 1.35);
        if (Math.abs(dz) > 0.24)
          aim.z = THREE.MathUtils.clamp(p[2] - Math.sign(dz) * 0.24, -0.62, 1.02);
      } else aim.set(0, 1.425, 0);
      const tea =
        closeUp && clip === 'tea' && journey.phase === 'act' && journey.animation === 'tea'
          ? teaCloseup(journey.actionTime)
          : 0;
      const extent = closeUp ? THREE.MathUtils.lerp(3.8, 2.4, tea) : roomExtent;
      const targetX = THREE.MathUtils.lerp(aim.x, p[0], tea);
      const targetZ = THREE.MathUtils.lerp(aim.z, p[2] + 0.12, tea);
      const targetY = closeUp ? THREE.MathUtils.lerp(1.08, 0.85, tea) : 1.425;
      if (!playing) {
        motion.x.snap(targetX);
        motion.y.snap(targetY);
        motion.z.snap(targetZ);
        motion.extent.snap(extent);
      }
      follow.set(
        motion.x.step(targetX, delta),
        motion.y.step(targetY, delta),
        motion.z.step(targetZ, delta),
      );
      camera.position.copy(follow).add(offset);
      camera.lookAt(follow);
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.min(size.width, size.height) / motion.extent.step(extent, delta, 75, 19);
      ortho.updateProjectionMatrix();
    }
    if (elapsed.current >= 1 && onMetrics) {
      onMetrics({
        fps: Math.round(frameCount.current / elapsed.current),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
      elapsed.current = 0;
      frameCount.current = 0;
    }
  });
  return (
    <>
      <ambientLight
        name="Room_ambient"
        intensity={cosy ? 0.08 + environment.daylight * 0.06 : 0.1}
        color={cosy ? environment.light : '#fff4e4'}
      />
      <directionalLight
        position={[-3.5, 6, 4]}
        name="Room_daylight"
        intensity={cosy ? 0.28 + environment.daylight * 1.57 : 1.85}
        color={cosy ? environment.light : '#fff0d8'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={5}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.1}
        shadow-camera-far={16}
        shadow-bias={-0.0002}
        shadow-normalBias={0.015}
      />
      <directionalLight position={[-3, 3, -2]} intensity={0.22} color="#dcecff" />
      {room && (
        <pointLight
          position={[
            assetContract.anchors.lamp[0],
            assetContract.anchors.lamp[1] + 0.1,
            assetContract.anchors.lamp[2],
          ]}
          name="Room_lamp"
          intensity={
            lampOn && !hiddenGroups.includes('Lamp')
              ? 2.5 + (cosy ? (1 - environment.daylight) * 2 : 0)
              : 0
          }
          distance={4.5}
          decay={2}
          color={roomStyle.lamp === 'lava_lamp' ? '#d4a4ff' : '#ffc778'}
        />
      )}
      {orbit && (
        <OrbitControls
          target={target}
          enablePan={false}
          minZoom={30}
          maxZoom={550}
          minPolarAngle={0.25}
          maxPolarAngle={Math.PI * 0.49}
        />
      )}
    </>
  );
}

function ReadySignal({ onReady }: Pick<Props, 'onReady'>) {
  const invalidate = useThree((state) => state.invalidate);
  const scheduled = useRef(false);
  const frame = useRef<number>();
  useEffect(() => {
    scheduled.current = false;
    invalidate();
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      onReady?.(false);
    };
  }, [onReady, invalidate]);
  useFrame(() => {
    if (scheduled.current || !onReady) return;
    scheduled.current = true;
    // Keep the preview visible until a real frame has rendered, even when paused.
    frame.current = requestAnimationFrame(() => onReady(true));
  });
  return null;
}

export default function AssetScene(props: Props) {
  // Stable options stop a UI update from reapplying the initial camera position.
  const cameraOptions = useMemo(
    () => ({ position: [6.7, 6.8, 9] as [number, number, number], near: 0.05, far: 80, zoom: 60 }),
    [],
  );
  const roomStyle = props.roomStyle ?? DEFAULT_ROOM;
  const hidden = useMemo(
    () => roomHiddenGroups(roomStyle, props.hiddenGroups ?? []),
    [roomStyle, props.hiddenGroups],
  );
  const hasCollection = Object.entries(roomStyle).some(
    ([slot, value]) => value !== DEFAULT_ROOM[slot as keyof RoomStyle],
  );
  const journey = useMemo(() => new RoomJourney(), []);
  journey.loop = props.loopJourney ?? false;
  const objects = useMemo<RoomObjects>(() => ({}), []);
  const visible = useVisible();
  const active = props.playing && visible;
  return (
    <Canvas
      shadows
      orthographic
      frameloop={active ? 'always' : 'demand'}
      dpr={[1, 2]}
      camera={cameraOptions}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.76,
      }}
    >
      <CameraAndLight
        clip={props.clip}
        playing={active}
        journey={journey}
        freezeCamera={props.freezeCamera}
        room={props.room}
        roomStyle={roomStyle}
        presentation={props.presentation}
        orbit={props.orbit}
        cameraStep={props.cameraStep}
        onMetrics={props.onMetrics}
        cosy={props.cosy}
        closeUp={props.closeUp}
        environment={props.environment}
        lampOn={props.lampOn}
        hiddenGroups={props.hiddenGroups}
      />
      <Suspense fallback={null}>
        {props.room && <Room {...props} hiddenGroups={hidden} objects={objects} playing={active} />}
        {props.room && hasCollection && (
          <RoomCollection
            style={roomStyle}
            hidden={props.hiddenGroups ?? []}
            playing={active}
            lampOn={props.lampOn ?? true}
            environment={props.environment ?? DAYLIGHT}
            onInteract={props.onInteract}
            onLampToggle={props.onLampToggle}
          />
        )}
        <Character {...props} playing={active} journey={journey} objects={objects} />
        {props.cosy && props.room && (
          <>
            <RoomProps
              clip={props.clip}
              journey={journey}
              objects={objects}
              playing={active}
              hidden={hidden}
            />
            <MoodEffects
              clip={props.clip}
              journey={journey}
              objects={objects}
              playing={active}
              hidden={hidden}
            />
          </>
        )}
        <ReadySignal onReady={props.onReady} />
        {!props.room && !props.presentation && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, 0]} receiveShadow>
            <circleGeometry args={[2.5, 64]} />
            <meshStandardMaterial color="#d8d2c3" roughness={1} />
          </mesh>
        )}
      </Suspense>
    </Canvas>
  );
}
