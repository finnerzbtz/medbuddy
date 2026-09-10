import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FoodId } from '@/types';
import { FEED, feedingPose } from '@/domain/feeding';
import type { RoomJourney } from '@/domain/choreography';

function FoodModel({ food }: { food: FoodId }) {
  const colours = {
    apple: '#c85e50',
    berries: '#78669a',
    dumpling: '#e6c7a0',
    strawberry: '#d3657f',
    cookie: '#c39361',
    mochi: '#dca6bd',
  };
  return (
    <group name={'Food_' + food}>
      {food === 'berries' ? (
        [-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * 0.14, i === 0 ? 0.09 : 0, 0]} castShadow>
            <sphereGeometry args={[0.14, 16, 12]} />
            <meshStandardMaterial color={colours[food]} roughness={0.5} />
          </mesh>
        ))
      ) : food === 'cookie' ? (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.27, 0.27, 0.12, 28]} />
            <meshStandardMaterial color={colours[food]} roughness={0.86} />
          </mesh>
          {[
            [0, 0],
            [-0.13, 0.12],
            [0.12, 0.09],
            [-0.1, -0.12],
            [0.13, -0.1],
          ].map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.069]} rotation={[0, 0, i * 0.8]}>
              <boxGeometry args={[0.06, 0.06, 0.025]} />
              <meshStandardMaterial color="#614534" roughness={0.8} />
            </mesh>
          ))}
        </>
      ) : (
        <mesh
          scale={
            food === 'dumpling'
              ? [1.3, 0.8, 0.85]
              : food === 'mochi'
                ? [1.15, 0.85, 1]
                : food === 'strawberry'
                  ? [1, 1.2, 1]
                  : [1, 1.07, 1]
          }
          castShadow
        >
          <sphereGeometry args={[0.235, 24, 16]} />
          <meshStandardMaterial color={colours[food]} roughness={food === 'mochi' ? 0.88 : 0.55} />
        </mesh>
      )}
      {food === 'apple' && (
        <>
          <mesh position={[0, 0.24, 0]} rotation={[0, 0, -0.25]}>
            <cylinderGeometry args={[0.018, 0.022, 0.12, 8]} />
            <meshStandardMaterial color="#6d5337" />
          </mesh>
          <mesh position={[0.1, 0.27, 0]} rotation={[0, 0, -0.55]} scale={[0.12, 0.047, 0.034]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#628150" roughness={0.8} />
          </mesh>
        </>
      )}
      {food === 'strawberry' && (
        <>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh
              key={i}
              position={[Math.sin(i * 1.256) * 0.07, 0.24, Math.cos(i * 1.256) * 0.07]}
              rotation={[0, i * 1.256, 0]}
              scale={[0.045, 0.035, 0.15]}
            >
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color="#628454" />
            </mesh>
          ))}
          {[
            [-0.11, 0.1],
            [0.09, 0.03],
            [-0.06, -0.11],
            [0.05, 0.16],
          ].map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.211]} scale={[0.012, 0.021, 0.014]}>
              <sphereGeometry args={[1, 8, 6]} />
              <meshStandardMaterial color="#f4d8a0" />
            </mesh>
          ))}
        </>
      )}
      {food === 'dumpling' &&
        [-2, -1, 0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[i * 0.085, 0.13, 0.03]}
            rotation={[0, 0, -i * 0.18]}
            scale={[0.025, 0.12, 0.12]}
          >
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color="#f5ddba" roughness={0.86} />
          </mesh>
        ))}
    </group>
  );
}
export default function Snack({
  food,
  journey,
  playing,
}: {
  food: FoodId;
  journey: RoomJourney;
  playing: boolean;
}) {
  const snack = useRef<THREE.Group>(null),
    crumbs = useRef<THREE.Group>(null),
    joy = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!snack.current || !crumbs.current || !joy.current) return;
    const t = journey.actionTime,
      pose = feedingPose(t);
    snack.current.visible = t < 3.2 && journey.animation === 'feeding';
    snack.current.position.set(...(pose.food as [number, number, number]));
    const eaten = t < FEED.bites[0] ? 1 : t < FEED.bites[1] ? 0.68 : 0.3;
    const bite = FEED.bites.reduce((v, at) => v + Math.max(0, 1 - Math.abs(t - at) / 0.16), 0);
    snack.current.scale.set(eaten * (1 + bite * 0.1), eaten * (1 - bite * 0.15), eaten);
    snack.current.rotation.z = playing ? 0.05 * Math.sin(t * 7) : 0;
    crumbs.current.visible = playing;
    crumbs.current.children.forEach((crumb, i) => {
      const age = t - FEED.bites[i < 5 ? 0 : 1],
        flight = age / 0.65;
      crumb.visible = age >= 0 && age < 0.65;
      const direction = ((i % 5) - 2) * 0.55;
      crumb.position.set(
        direction * flight * 0.55,
        1.24 + Math.sin(flight * Math.PI) * 0.24 - flight * 0.25,
        0.69 + flight * 0.16,
      );
      crumb.rotation.set(flight * 4, flight * 3, flight * 5);
      crumb.scale.setScalar(Math.max(0.001, 1 - flight));
    });
    joy.current.visible = playing && t > 3.55 && t < 5.35;
    joy.current.children.forEach((spark, i) => {
      const age = Math.max(0, t - 3.55 - i * 0.1);
      spark.position.set((i - 1) * 0.34, 1.7 + age * 0.34, 0.14);
      spark.rotation.z = age * 0.7 + i;
      spark.scale.setScalar(Math.max(0, Math.sin(Math.min(1, age / 1.3) * Math.PI)));
    });
  });
  return (
    <group name="Feeding_effects">
      <group name="Blobby_snack" ref={snack}>
        <FoodModel food={food} />
      </group>
      <group name="Snack_crumbs" ref={crumbs}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i}>
            <icosahedronGeometry args={[0.022 + (i % 3) * 0.008, 0]} />
            <meshStandardMaterial
              color={food === 'berries' ? '#a38cba' : food === 'strawberry' ? '#dd8d9a' : '#e5bd7e'}
              roughness={0.85}
            />
          </mesh>
        ))}
      </group>
      <group name="Snack_delight" ref={joy}>
        {[-1, 0, 1].map((i) => (
          <mesh key={i}>
            <octahedronGeometry args={[i === 0 ? 0.1 : 0.06, 0]} />
            <meshStandardMaterial color={i === 0 ? '#df8d95' : '#ebc772'} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
