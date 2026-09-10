import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnimationName } from '@/types';
import { MOOD_LOOKS, type RoomJourney } from '@/domain/choreography';
import { TEA, teaPose } from '@/domain/tea';
import { assetContract } from '@/generated/assets';
import { BouncyBall } from '@/domain/motion';
export interface RoomObjects {
  pet?: THREE.Group;
  cup?: THREE.Group;
  can?: THREE.Group;
  leaves?: THREE.Group;
  ball?: THREE.Group;
  blanket?: THREE.Group;
  duvet?: THREE.Group;
}
const cupHome = new THREE.Vector3().fromArray(TEA.cupHome),
  canHome = new THREE.Vector3().fromArray(assetContract.anchors.wateringCan);
const petalColours = ['#e5afbb', '#f3d791', '#a8c88c', '#beb4df', '#efb884'];
export function RoomProps({
  clip,
  journey,
  objects,
  playing,
  hidden,
}: {
  clip: AnimationName;
  journey: RoomJourney;
  objects: RoomObjects;
  playing: boolean;
  hidden: string[];
}) {
  const target = useMemo(() => new THREE.Vector3(), []),
    elapsed = useRef(0);
  const cupRotation = useMemo(() => new THREE.Quaternion(), []);
  const tilt = useMemo(() => new THREE.Quaternion(), []);
  const cupRestTurn = useMemo(
    () => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI),
    [],
  );
  const pitchAxis = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const ball = useMemo(() => new BouncyBall(), []);
  const lastKick = useRef(-1);
  const update = (delta: number, instant = false) => {
    const t = elapsed.current,
      p = journey.position,
      action = journey.activity,
      acting = journey.phase === 'act' && journey.animation === action;
    const mix = instant ? 1 : 1 - Math.exp(-delta * 5),
      turn = journey.yaw;
    if (objects.cup) {
      const held =
        acting &&
        action === 'tea' &&
        objects.pet &&
        journey.actionTime >= TEA.gripStart &&
        journey.actionTime <= TEA.gripEnd;
      target.copy(cupHome);
      cupRotation.identity();
      if (held && objects.pet) {
        const pose = teaPose(journey.actionTime);
        objects.pet.updateWorldMatrix(true, false);
        objects.pet.localToWorld(target.fromArray(pose.cup));
        objects.pet.getWorldQuaternion(cupRotation);
        cupRotation.multiply(tilt.setFromAxisAngle(pitchAxis, pose.pitch)).multiply(cupRestTurn);
      }
      // While held, the cup is part of the grip, never a separately eased follower.
      // Interruption returns it gently to the saucer; pausing preserves the pose.
      const amount = held ? 1 : mix;
      objects.cup.position.lerp(target, amount);
      objects.cup.quaternion.slerp(cupRotation, amount);
    }
    if (objects.can) {
      objects.can.position.copy(canHome);
      objects.can.rotation.set(0, 0, 0);
    }
    if (objects.leaves) {
      const low = ['worried', 'sick', 'critical'].includes(action),
        grow = (acting && action === 'tend') || action === 'recovering' || action === 'happy';
      objects.leaves.rotation.z =
        (low ? -0.08 : 0) + Math.sin(t * (grow ? 2 : 0.7)) * (grow ? 0.035 : 0.012);
      objects.leaves.scale.setScalar(grow ? 1.05 + 0.025 * Math.sin(t * 2) : low ? 0.95 : 1);
    }
    if (objects.ball) {
      const active = acting && ['ball', 'dance', 'celebrating'].includes(action);
      if (active) {
        const beat = Math.floor(journey.actionTime / 1.15);
        if (lastKick.current !== beat) {
          ball.kick(ball.x > 0.88 ? -1 : 1);
          lastKick.current = beat;
        }
      } else lastKick.current = -1;
      // Let momentum dissipate naturally after play instead of lifting or
      // teleporting the toy back to its original position.
      ball.step(delta);
      objects.ball.position.set(ball.x, ball.y, ball.z);
      objects.ball.rotation.z = ball.spin;
      objects.ball.scale.set(1 / Math.sqrt(ball.squash), ball.squash, 1 / Math.sqrt(ball.squash));
    }
    if (objects.duvet) {
      const tucked = acting && action === 'rest' && !hidden.includes('Bed');
      objects.duvet.visible = tucked;
      const rise = instant ? 1 : THREE.MathUtils.smoothstep(journey.actionTime, 0.25, 1.2);
      objects.duvet.scale.y = Math.max(0.01, rise) * (1 + 0.018 * Math.sin(t * 1.6));
    }
    if (objects.blanket) {
      objects.blanket.visible = action === 'critical' && acting;
      objects.blanket.position.set(p[0], p[1] - 0.03, p[2]);
      objects.blanket.rotation.y = turn;
      objects.blanket.scale.set(1, 1 + 0.015 * Math.sin(t * 1.6), 1);
    }
  };
  useEffect(() => {
    update(0, !playing);
  }, [clip, playing, objects, hidden]);
  useFrame((_, delta) => {
    if (playing) {
      elapsed.current += Math.min(delta, 0.05);
      update(Math.min(delta, 0.05));
    }
  });
  return null;
}
export default function MoodEffects({
  clip,
  journey,
  playing,
  hidden,
  objects,
}: {
  clip: AnimationName;
  journey: RoomJourney;
  playing: boolean;
  hidden: string[];
  objects: RoomObjects;
}) {
  const particles = useRef<THREE.InstancedMesh>(null),
    blossoms = useRef<THREE.InstancedMesh>(null),
    cloud = useRef<THREE.Group>(null),
    symbols = useRef<THREE.Group>(null),
    compress = useRef<THREE.Group>(null),
    butterfly = useRef<THREE.Group>(null),
    steam = useRef<THREE.InstancedMesh>(null);
  const elapsed = useRef(0),
    dummy = useMemo(() => new THREE.Object3D(), []);
  const look = MOOD_LOOKS[clip],
    effect = look.effect;
  const heart = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.6);
    s.bezierCurveTo(-1, 0.1, -0.8, 0.8, -0.35, 0.65);
    s.quadraticCurveTo(0, 0.6, 0, 0.28);
    s.quadraticCurveTo(0, 0.6, 0.35, 0.65);
    s.bezierCurveTo(0.8, 0.8, 1, 0.1, 0, -0.6);
    return s;
  }, []);
  const update = () => {
    const p = journey.position,
      t = elapsed.current,
      act = journey.phase === 'act' && journey.animation === clip;
    if (cloud.current) {
      cloud.current.position.set(p[0], p[1] + 1.7, p[2]);
      cloud.current.rotation.z = 0.045 * Math.sin(t);
    }
    if (symbols.current) {
      symbols.current.visible = act;
      symbols.current.position.set(
        p[0] + 0.24,
        p[1] + (clip === 'rest' ? 0.8 : 1.4),
        p[2] - (clip === 'rest' ? 0.65 : 0),
      );
      symbols.current.rotation.y = 0.5;
    }
    if (compress.current) {
      compress.current.position.set(p[0], p[1] + 1.02, p[2] + 0.3);
      compress.current.rotation.y = journey.yaw;
    }
    if (butterfly.current) {
      const around = clip === 'window' && act;
      butterfly.current.position.set(
        (around ? p[0] : 0.42) + 0.45 * Math.sin(t * 1.3),
        1.55 + 0.22 * Math.sin(t * 1.7),
        (around ? p[2] : -1.55) + 0.2 * Math.cos(t),
      );
      butterfly.current.rotation.y = t;
      butterfly.current.scale.x = 0.65 + 0.35 * Math.abs(Math.sin(t * 10));
    }
    if (particles.current) {
      for (let i = 0; i < 18; i++) {
        const phase = (t * 0.35 + i / 18) % 1,
          angle = i * 2.4 + t * 0.3;
        let size = 0.04,
          x = p[0] + Math.cos(angle) * 0.42,
          y = p[1] + 1.1 + phase * 0.7,
          z = p[2] + Math.sin(angle) * 0.35;
        if (effect === 'rain') {
          x = p[0] + Math.cos(i * 2.4) * 0.29;
          z = p[2] + Math.sin(i * 2.4) * 0.18;
          y = p[1] + 1.61 - phase * 0.95;
          size = 0.025;
        } else if (effect === 'confetti') {
          x = p[0] + Math.cos(angle) * (0.4 + phase * 0.6);
          y = p[1] + 0.8 + (1 - phase) * 1.2;
          z = p[2] + Math.sin(angle) * (0.4 + phase * 0.4);
          size = 0.025 + 0.017 * Math.sin(phase * Math.PI);
        } else if (effect === 'motes') {
          x = 0.4 + Math.cos(angle) * 1.5;
          y = 0.4 + phase * 1.5;
          z = Math.sin(angle) * 1.1;
          size = 0.008;
        } else if (effect === 'petals') {
          x = p[0] + Math.cos(angle) * (0.5 + phase * 0.4);
          z = p[2] + Math.sin(angle) * (0.5 + phase * 0.4);
          y = p[1] + 0.3 + phase * 1.35;
          size = 0.035 * Math.sin(phase * Math.PI);
        } else if (effect === 'hearts') {
          size = 0.08 * Math.sin(phase * Math.PI);
          x = p[0] + Math.cos(i * 2.4) * 0.5;
          z = p[2] + 0.12;
        } else size = 0;
        dummy.position.set(x, y, z);
        dummy.rotation.set(
          effect === 'rain' ? 0 : t * 0.5,
          effect === 'hearts' ? 0.5 : angle,
          effect === 'rain' ? -0.1 : angle,
        );
        dummy.scale.set(
          size,
          effect === 'rain' ? size * 2.8 : size,
          effect === 'confetti' ? size * 0.25 : size,
        );
        dummy.updateMatrix();
        particles.current.setMatrixAt(i, dummy.matrix);
      }
      particles.current.instanceMatrix.needsUpdate = true;
    }
    if (blossoms.current) {
      blossoms.current.visible =
        !hidden.includes('Bonsai') &&
        (['happy', 'recovering', 'celebrating'].includes(clip) || (clip === 'tend' && act));
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        dummy.position.set(
          -1.65 + 0.28 * Math.cos(a),
          1.32 + (i % 3) * 0.1,
          -1.23 + 0.18 * Math.sin(a),
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.045 + (Math.sin(t + i) + 1) * 0.006);
        dummy.updateMatrix();
        blossoms.current.setMatrixAt(i, dummy.matrix);
      }
      blossoms.current.instanceMatrix.needsUpdate = true;
    }
    if (steam.current) {
      steam.current.visible = clip === 'tea' && !hidden.includes('Tea_table');
      const cup = objects.cup?.position ?? cupHome;
      for (let i = 0; i < 6; i++) {
        const v = (t * 0.4 + i / 6) % 1;
        dummy.position.set(cup.x + 0.028 * Math.sin(v * 8 + i), cup.y + 0.07 + v * 0.3, cup.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.017 * (1 - v));
        dummy.updateMatrix();
        steam.current.setMatrixAt(i, dummy.matrix);
      }
      steam.current.instanceMatrix.needsUpdate = true;
    }
  };
  useEffect(() => {
    if (particles.current)
      for (let i = 0; i < 18; i++)
        particles.current.setColorAt(
          i,
          new THREE.Color(
            effect === 'rain'
              ? '#87b6e4'
              : effect === 'garden'
                ? '#92cddd'
                : effect === 'hearts'
                  ? '#df8eaf'
                  : petalColours[i % 5],
          ),
        );
    if (particles.current?.instanceColor) particles.current.instanceColor.needsUpdate = true;
    update();
  }, [clip, playing, hidden]);
  useFrame((_, delta) => {
    if (playing) {
      elapsed.current += Math.min(delta, 0.05);
      update();
    }
  });
  return (
    <group name="Mood_effects">
      <instancedMesh ref={particles} args={[undefined, undefined, 18]} frustumCulled={false}>
        {effect === 'hearts' ? (
          <extrudeGeometry args={[heart, { depth: 0.1, bevelEnabled: false, steps: 1 }]} />
        ) : effect === 'confetti' ? (
          <boxGeometry args={[1, 1, 1]} />
        ) : (
          <sphereGeometry args={[1, 8, 6]} />
        )}
        <meshStandardMaterial roughness={0.7} metalness={0} />
      </instancedMesh>
      {effect === 'rain' && (
        <group ref={cloud} name="Rain_cloud">
          {[-1, 0, 1].map((i) => (
            <mesh key={i} position={[i * 0.19, i === 0 ? 0.045 : 0, 0]} scale={[0.23, 0.13, 0.15]}>
              <sphereGeometry args={[1, 16, 10]} />
              <meshStandardMaterial color="#99abc8" roughness={1} />
            </mesh>
          ))}
        </group>
      )}
      {effect === 'poorly' && (
        <group ref={compress} name="Cool_compress">
          <mesh rotation={[-0.22, 0, 0]}>
            <boxGeometry args={[0.31, 0.065, 0.15]} />
            <meshStandardMaterial color="#d7e7ea" roughness={1} />
          </mesh>
        </group>
      )}
      {['sleep', 'blanket'].includes(effect) && (
        <group ref={symbols} name="Sleep_symbols">
          {[0, 1, 2].map((i) => (
            <group key={i} position={[i * 0.16, i * 0.17, 0]} scale={0.09 + i * 0.018}>
              {[-1, 1].map((j) => (
                <mesh key={j} position={[0, j * 0.55, 0]}>
                  <boxGeometry args={[1.1, 0.15, 0.1]} />
                  <meshBasicMaterial color="#dee1f5" />
                </mesh>
              ))}
              <mesh rotation={[0, 0, -0.75]}>
                <boxGeometry args={[0.15, 1.55, 0.1]} />
                <meshBasicMaterial color="#dee1f5" />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {!hidden.includes('Garden') && clip === 'window' && (
        <group ref={butterfly} name="Window_butterfly">
          {[-1, 1].map((sign) => (
            <mesh
              key={sign}
              position={[sign * 0.07, 0, 0]}
              rotation={[0, 0, sign * 0.5]}
              scale={[0.09, 0.13, 0.018]}
            >
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={sign === 1 ? '#e6b980' : '#e7c89c'} />
            </mesh>
          ))}
          <mesh scale={[0.017, 0.07, 0.018]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#987664" />
          </mesh>
        </group>
      )}
      <instancedMesh
        name="Bonsai_blossoms"
        ref={blossoms}
        args={[undefined, undefined, 9]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#e5a8b5" roughness={0.8} />
      </instancedMesh>
      <instancedMesh
        name="Tea_steam"
        ref={steam}
        args={[undefined, undefined, 6]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#f7ecd5" transparent opacity={0.5} />
      </instancedMesh>
    </group>
  );
}
