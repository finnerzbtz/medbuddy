import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const colours = ['#557d6c', '#a08ab0', '#ad8851', '#678d82'];

function noteShape() {
  const head = new THREE.Shape();
  head.absellipse(-0.15, -0.26, 0.21, 0.14, 0, Math.PI * 2, false, -0.28);
  const stem = new THREE.Shape();
  stem.moveTo(-0.015, -0.28);
  stem.lineTo(0.085, -0.25);
  stem.lineTo(0.085, 0.52);
  stem.quadraticCurveTo(0.035, 0.56, -0.015, 0.52);
  stem.closePath();
  const flag = new THREE.Shape();
  flag.moveTo(0.075, 0.5);
  flag.bezierCurveTo(0.13, 0.34, 0.4, 0.36, 0.3, 0.09);
  flag.bezierCurveTo(0.31, 0.28, 0.1, 0.23, 0.075, 0.3);
  flag.closePath();
  return new THREE.ShapeGeometry([head, stem, flag], 10);
}

export default function RecordMusicNotes({ active, moving }: { active: boolean; moving: boolean }) {
  const root = useRef<THREE.Group>(null);
  const notes = useRef<(THREE.Mesh | null)[]>([]);
  const elapsed = useRef(0);
  const { camera, invalidate } = useThree();
  const geometry = useMemo(noteShape, []);
  const materials = useMemo(
    () =>
      colours.map(
        (colour) =>
          new THREE.MeshBasicMaterial({
            color: colour,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false,
          }),
      ),
    [],
  );
  const pose = (time: number) => {
    notes.current.forEach((note, i) => {
      if (!note) return;
      const age = time - i * 0.85;
      const progress = (Math.max(0, age) % 3.6) / 3.6;
      note.visible = active && (moving ? age >= 0 : i < 2);
      note.quaternion.copy(camera.quaternion);
      if (!moving) {
        note.position.set(i ? 0.17 : -0.12, i ? 0.4 : 0.2, 0);
        note.scale.setScalar(0.19);
        note.rotateZ(i ? 0.16 : -0.14);
        materials[i].opacity = 0.78;
        return;
      }
      const side = i % 2 ? 1 : -1;
      note.position.set(
        side * (0.04 + progress * 0.16) + Math.sin(progress * 4.4 + i) * 0.075,
        0.03 + progress * 0.96,
        Math.sin(progress * Math.PI + i) * 0.025,
      );
      note.scale.setScalar(0.15 + Math.sin(progress * Math.PI) * 0.045);
      note.rotateZ(side * 0.16 + Math.sin(progress * 4 + i) * 0.12);
      materials[i].opacity =
        0.86 *
        THREE.MathUtils.smoothstep(progress, 0, 0.13) *
        (1 - THREE.MathUtils.smoothstep(progress, 0.68, 1));
    });
  };
  useEffect(() => {
    elapsed.current = 0;
    pose(0);
    invalidate();
  }, [active, moving, camera, invalidate]);
  useFrame((_, delta) => {
    if (!active || !moving) return;
    elapsed.current += Math.min(delta, 0.05);
    pose(elapsed.current);
  });
  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );
  return (
    <group ref={root} name="Record music notes" position={[-1.08, 0.78, 0.56]} visible={active}>
      {materials.map((material, i) => (
        <mesh
          key={i}
          name={`Floating music note ${i + 1}`}
          ref={(node) => {
            notes.current[i] = node;
          }}
          geometry={geometry}
          material={material}
          dispose={null}
          raycast={() => {}}
        />
      ))}
    </group>
  );
}
