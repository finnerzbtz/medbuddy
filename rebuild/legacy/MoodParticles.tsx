import { useRef, useEffect } from 'react';
import { VFXParticles, VFXEmitter } from 'wawa-vfx';
import type { PetMood } from '@/types';

// Use any for emitter refs — wawa-vfx exports its own ref type internally
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmitterRef = any;

interface MoodParticlesProps {
  mood: PetMood;
  position: [number, number, number];
  isCelebrating: boolean;
}

/**
 * Mood-reactive particle system for Blobby.
 *
 * Each mood has its own VFXParticles + VFXEmitter pair.
 * Only the active mood's emitter runs. Celebration bursts
 * are triggered via ref when a dose is logged.
 */
export const MoodParticles = ({ mood, position, isCelebrating }: MoodParticlesProps) => {
  const happyRef = useRef<EmitterRef>(null);
  const sadRef = useRef<EmitterRef>(null);
  const sickRef = useRef<EmitterRef>(null);
  const criticalRef = useRef<EmitterRef>(null);
  const celebrateRef = useRef<EmitterRef>(null);
  const sleepRef = useRef<EmitterRef>(null);

  // Start/stop emitters based on mood
  useEffect(() => {
    // Stop all first
    happyRef.current?.stopEmitting();
    sadRef.current?.stopEmitting();
    sickRef.current?.stopEmitting();
    criticalRef.current?.stopEmitting();
    sleepRef.current?.stopEmitting();

    // Start the right one
    switch (mood) {
      case 'happy':
      case 'content':
        happyRef.current?.startEmitting(true);
        break;
      case 'sad':
      case 'bored':
        sadRef.current?.startEmitting(true);
        break;
      case 'sick':
        sickRef.current?.startEmitting(true);
        sleepRef.current?.startEmitting(true);
        break;
      case 'critical':
        criticalRef.current?.startEmitting(true);
        break;
    }
  }, [mood]);

  // Celebration burst when dose is logged
  useEffect(() => {
    if (isCelebrating) {
      celebrateRef.current?.startEmitting(true);
    }
  }, [isCelebrating]);

  const [px, py, pz] = position;

  return (
    <group position={[px, py, pz]}>
      {/* ── HAPPY: Floating golden sparkles + tiny hearts ─────────── */}
      <VFXParticles
        name="mood-happy"
        settings={{
          nbParticles: 500,
          intensity: 2,
          fadeAlpha: [0.1, 0.9] as [number, number],
          gravity: [0, 0.3, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={happyRef}
        emitter="mood-happy"
        autoStart={false}
        settings={{
          spawnMode: 'time',
          duration: 2,
          nbParticles: 30,
          loop: true,
          particlesLifetime: [2, 4] as [number, number],
          speed: [0.2, 0.6] as [number, number],
          size: [0.02, 0.06] as [number, number],
          startPositionMin: [-0.6, -0.2, -0.6] as [number, number, number],
          startPositionMax: [0.6, 0.4, 0.6] as [number, number, number],
          directionMin: [-0.3, 0.5, -0.3] as [number, number, number],
          directionMax: [0.3, 1, 0.3] as [number, number, number],
          colorStart: ['#FFD700', '#FFA500', '#FFE4B5'],
          colorEnd: ['#FFFFFF', '#FFD700', '#FFECD2'],
        }}
      />

      {/* ── SAD: Slow rain-like drops falling ────────────────────── */}
      <VFXParticles
        name="mood-sad"
        settings={{
          nbParticles: 800,
          intensity: 0.6,
          fadeAlpha: [0.3, 1] as [number, number],
          gravity: [0, -3, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={sadRef}
        emitter="mood-sad"
        autoStart={false}
        settings={{
          spawnMode: 'time',
          duration: 2,
          nbParticles: 40,
          loop: true,
          particlesLifetime: [1.5, 3] as [number, number],
          speed: [0.5, 1.5] as [number, number],
          size: [0.01, 0.03] as [number, number],
          startPositionMin: [-0.8, 1.2, -0.8] as [number, number, number],
          startPositionMax: [0.8, 1.5, 0.8] as [number, number, number],
          directionMin: [-0.1, -1, -0.1] as [number, number, number],
          directionMax: [0.1, -0.8, 0.1] as [number, number, number],
          colorStart: ['#87CEEB', '#B0C4DE'],
          colorEnd: ['#4682B4', '#6495ED'],
        }}
      />

      {/* ── SICK: Green bubbles + sweat drops ────────────────────── */}
      <VFXParticles
        name="mood-sick"
        settings={{
          nbParticles: 300,
          intensity: 0.8,
          fadeAlpha: [0.2, 0.8] as [number, number],
          gravity: [0, 0.5, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={sickRef}
        emitter="mood-sick"
        autoStart={false}
        settings={{
          spawnMode: 'time',
          duration: 3,
          nbParticles: 15,
          loop: true,
          particlesLifetime: [2, 4] as [number, number],
          speed: [0.1, 0.3] as [number, number],
          size: [0.02, 0.05] as [number, number],
          startPositionMin: [-0.4, -0.1, -0.4] as [number, number, number],
          startPositionMax: [0.4, 0.3, 0.4] as [number, number, number],
          directionMin: [-0.5, 0.3, -0.5] as [number, number, number],
          directionMax: [0.5, 1, 0.5] as [number, number, number],
          colorStart: ['#90EE90', '#98FB98', '#7CFC00'],
          colorEnd: ['#006400', '#228B22', '#2E8B57'],
        }}
      />

      {/* ── SLEEP: Floating dust motes (used when sick/bored) ──── */}
      <VFXParticles
        name="mood-sleep"
        settings={{
          nbParticles: 200,
          intensity: 0.4,
          fadeAlpha: [0.1, 0.9] as [number, number],
          gravity: [0, 0.15, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={sleepRef}
        emitter="mood-sleep"
        autoStart={false}
        settings={{
          spawnMode: 'time',
          duration: 4,
          nbParticles: 8,
          loop: true,
          particlesLifetime: [3, 6] as [number, number],
          speed: [0.05, 0.15] as [number, number],
          size: [0.03, 0.07] as [number, number],
          startPositionMin: [0.1, 0.3, -0.1] as [number, number, number],
          startPositionMax: [0.4, 0.5, 0.1] as [number, number, number],
          directionMin: [0.2, 0.8, -0.2] as [number, number, number],
          directionMax: [0.5, 1, 0.2] as [number, number, number],
          colorStart: ['#E8E8FF', '#D8D8FF'],
          colorEnd: ['#AAAACC', '#9999BB'],
        }}
      />

      {/* ── CRITICAL: Red warning particles ──────────────────────── */}
      <VFXParticles
        name="mood-critical"
        settings={{
          nbParticles: 600,
          intensity: 2.5,
          fadeAlpha: [0.2, 0.8] as [number, number],
          gravity: [0, -1, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={criticalRef}
        emitter="mood-critical"
        autoStart={false}
        settings={{
          spawnMode: 'time',
          duration: 1,
          nbParticles: 50,
          loop: true,
          particlesLifetime: [0.5, 1.5] as [number, number],
          speed: [1, 3] as [number, number],
          size: [0.02, 0.05] as [number, number],
          startPositionMin: [-0.5, -0.2, -0.5] as [number, number, number],
          startPositionMax: [0.5, 0.5, 0.5] as [number, number, number],
          directionMin: [-1, -0.5, -1] as [number, number, number],
          directionMax: [1, 1, 1] as [number, number, number],
          colorStart: ['#FF0000', '#FF4444', '#FF6666'],
          colorEnd: ['#8B0000', '#CC0000', '#AA0000'],
        }}
      />

      {/* ── CELEBRATION: Confetti burst (one-shot on dose log) ──── */}
      <VFXParticles
        name="mood-celebrate"
        settings={{
          nbParticles: 2000,
          intensity: 2,
          fadeAlpha: [0.5, 1] as [number, number],
          gravity: [0, -4, 0] as [number, number, number],
        }}
      />
      <VFXEmitter
        ref={celebrateRef}
        emitter="mood-celebrate"
        autoStart={false}
        settings={{
          spawnMode: 'burst',
          nbParticles: 300,
          duration: 0.1,
          loop: false,
          particlesLifetime: [1.5, 3] as [number, number],
          speed: [5, 12] as [number, number],
          size: [0.03, 0.1] as [number, number],
          startPositionMin: [-0.2, 0, -0.2] as [number, number, number],
          startPositionMax: [0.2, 0.3, 0.2] as [number, number, number],
          directionMin: [-1, 0.5, -1] as [number, number, number],
          directionMax: [1, 1.5, 1] as [number, number, number],
          colorStart: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFD93D', '#FF69B4', '#95E1D3'],
          colorEnd: ['#FFD700', '#FF1493', '#87CEEB', '#FF4500', '#00CED1', '#FF6347'],
        }}
      />
    </group>
  );
};
