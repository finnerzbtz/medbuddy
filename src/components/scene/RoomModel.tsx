import { useGLTF } from '@react-three/drei';

interface RoomModelProps {
  healthState?: 'good' | 'warning' | 'critical';
}

export const RoomModel = ({ healthState: _healthState }: RoomModelProps) => {
  const { scene } = useGLTF('/models/room.glb');

  return (
    <group position={[0, -1, -1]} scale={0.5}>
      <primitive object={scene} />
    </group>
  );
};
