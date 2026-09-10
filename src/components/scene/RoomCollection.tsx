import { useMusicPlaying } from '@/audio/useMusicPlaying';
import RecordMusicNotes from './RecordMusicNotes';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { AnimationName, RoomStyle } from '@/types';
import { roomItem, roomGroup } from '@/domain/room';
import type { RoomEnvironmentState } from '@/domain/environment';
import { roomCollectionReport } from '@/generated/room-collection';

export default function RoomCollection({
  style,
  hidden,
  playing,
  lampOn,
  environment,
  onInteract,
  onLampToggle,
}: {
  style: RoomStyle;
  hidden: string[];
  playing: boolean;
  lampOn: boolean;
  environment: RoomEnvironmentState;
  onInteract?: (activity: AnimationName) => void;
  onLampToggle?: () => void;
}) {
  const musicPlaying = useMusicPlaying();
  const discTime = useRef(0);
  const asset = useGLTF('/assets-v2/room-collection.glb?v=' + roomCollectionReport.hash, false);
  const { object, materials, moving } = useMemo(() => {
    const object = asset.scene.clone(true);
    const materials: { material: THREE.MeshStandardMaterial; colour: THREE.Color; glow: number }[] =
      [];
    const moving: {
      node: THREE.Object3D;
      home: THREE.Vector3;
      scale: THREE.Vector3;
      kind: string;
    }[] = [];
    object.traverse((node) => {
      if (node.userData.room_motion)
        moving.push({
          node,
          home: node.position.clone(),
          scale: node.scale.clone(),
          kind: node.userData.room_motion,
        });
      if (!(node instanceof THREE.Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      const owned = list.map((source) => {
        const material = source.clone() as THREE.MeshStandardMaterial;
        material.envMapIntensity = 0.16;
        if (material.transparent) {
          material.depthWrite = false;
          node.castShadow = false;
        }
        materials.push({
          material,
          colour: material.color.clone().multiplyScalar(0.72),
          glow: material.emissiveIntensity,
        });
        return material;
      });
      node.material = Array.isArray(node.material) ? owned : owned[0];
    });
    return { object, materials, moving };
  }, [asset.scene]);
  const invalidate = useThree((s) => s.invalidate),
    elapsed = useRef(0);
  useEffect(() => {
    object.traverse((node) => {
      const item = roomItem(node.userData.room_item);
      if (!item) return;
      const celestial = node.userData.room_celestial;
      node.visible =
        style[item.slot] === item.id &&
        !hidden.includes(roomGroup(item.slot)) &&
        (!celestial ||
          (celestial === 'sun' ? environment.daylight > 0.45 : environment.daylight <= 0.45));
    });
    materials.forEach(({ material, colour, glow }) => {
      material.color.copy(colour).multiplyScalar(0.65 + environment.daylight * 0.35);
      const lamp = /wax glow|mushroom glow/.test(material.name);
      material.emissiveIntensity = lamp ? (lampOn && !hidden.includes('Lamp') ? glow : 0) : glow;
      if (material.name.includes('sky')) {
        material.color.set(environment.sky);
        material.emissive.set(environment.sky);
      }
    });
    invalidate();
  }, [style, hidden, lampOn, environment, object, materials, invalidate]);
  useFrame((_, delta) => {
    if (!playing) return;
    const dt = Math.min(delta, 0.05);
    const t = (elapsed.current += dt);
    if (musicPlaying) discTime.current += dt;
    moving.forEach(({ node, home, scale, kind }, i) => {
      if (!node.visible) return;
      if (kind === 'lava' && lampOn) {
        node.position.y = home.y + Math.sin(t * 0.65 + i * 2.2) * 0.025;
        node.position.x = home.x + Math.sin(t * 0.43 + i) * 0.012;
        node.scale.set(
          scale.x * (1 + 0.08 * Math.sin(t + i)),
          scale.y * (1 + 0.12 * Math.cos(t * 0.7 + i)),
          scale.z,
        );
      } else if (kind === 'record') {
        node.position.x = home.x + 0.025 * (Math.cos(discTime.current * 1.8) - 1);
        node.position.z = home.z + 0.025 * Math.sin(discTime.current * 1.8);
      } else if (kind === 'wave') node.position.y = home.y + 0.008 * Math.sin(t * 0.7);
    });
  });
  useEffect(() => () => materials.forEach(({ material }) => material.dispose()), [materials]);
  const pick = (node: THREE.Object3D) => {
    for (let at: THREE.Object3D | null = node; at; at = at.parent) {
      const item = roomItem(at.userData.room_item);
      if (item) return item.slot;
    }
  };
  return (
    <>
      <RecordMusicNotes
        active={
          musicPlaying && style.table === 'record_player' && !hidden.includes(roomGroup('table'))
        }
        moving={playing}
      />
      <primitive
        object={object}
        dispose={null}
        onClick={
          onInteract
            ? (event: { object: THREE.Object3D; stopPropagation: () => void }) => {
                const slot = pick(event.object);
                if (!slot) return;
                event.stopPropagation();
                if (slot === 'lamp') onLampToggle?.();
                else onInteract(slot === 'garden' ? 'tend' : slot === 'table' ? 'tea' : 'window');
              }
            : undefined
        }
        onPointerOver={
          onInteract
            ? (e: { object: THREE.Object3D; nativeEvent: PointerEvent }) => {
                if (pick(e.object))
                  (e.nativeEvent.target as HTMLCanvasElement).style.cursor = 'pointer';
              }
            : undefined
        }
        onPointerOut={
          onInteract
            ? (e: { nativeEvent: PointerEvent }) => {
                (e.nativeEvent.target as HTMLCanvasElement).style.cursor = '';
              }
            : undefined
        }
      />
    </>
  );
}
