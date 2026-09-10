import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  Vignette,
  HueSaturation,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';
import * as THREE from 'three';
import type { PetMood } from '@/types';

// ── Mood presets for post-processing effects ──────────────────────
interface MoodPreset {
  bloomIntensity: number;
  bloomThreshold: number;
  vignetteOffset: number;
  vignetteDarkness: number;
  hueShift: number;      // degrees
  saturation: number;     // degrees
  aberrationX: number;
  aberrationY: number;
}

const MOOD_PRESETS: Record<PetMood, MoodPreset> = {
  happy: {
    bloomIntensity: 1.8,
    bloomThreshold: 0.7,
    vignetteOffset: 0.3,
    vignetteDarkness: 0.15,
    hueShift: 10,
    saturation: 20,
    aberrationX: 0,
    aberrationY: 0,
  },
  content: {
    bloomIntensity: 1.2,
    bloomThreshold: 0.8,
    vignetteOffset: 0.35,
    vignetteDarkness: 0.2,
    hueShift: 5,
    saturation: 10,
    aberrationX: 0,
    aberrationY: 0,
  },
  bored: {
    bloomIntensity: 0.8,
    bloomThreshold: 0.85,
    vignetteOffset: 0.45,
    vignetteDarkness: 0.35,
    hueShift: 0,
    saturation: -10,
    aberrationX: 0,
    aberrationY: 0,
  },
  sad: {
    bloomIntensity: 0.4,
    bloomThreshold: 0.95,
    vignetteOffset: 0.7,
    vignetteDarkness: 0.6,
    hueShift: -25,
    saturation: -45,
    aberrationX: 0,
    aberrationY: 0,
  },
  sick: {
    bloomIntensity: 0.5,
    bloomThreshold: 0.9,
    vignetteOffset: 0.55,
    vignetteDarkness: 0.5,
    hueShift: 60,
    saturation: -35,
    aberrationX: 0.005,
    aberrationY: 0.003,
  },
  critical: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.85,
    vignetteOffset: 0.8,
    vignetteDarkness: 0.75,
    hueShift: -10,
    saturation: -20,
    aberrationX: 0.012,
    aberrationY: 0.008,
  },
};

// Celebration override — used briefly when dose is logged
const CELEBRATING_PRESET: MoodPreset = {
  bloomIntensity: 3.0,
  bloomThreshold: 0.5,
  vignetteOffset: 0.25,
  vignetteDarkness: 0.1,
  hueShift: 30,
  saturation: 40,
  aberrationX: 0.035,
  aberrationY: 0.02,
};

interface MoodEffectsProps {
  mood: PetMood;
  isCelebrating: boolean;
}

export const MoodEffects = ({ mood, isCelebrating }: MoodEffectsProps) => {
  const bloomRef = useRef<any>(null);
  const vignetteRef = useRef<any>(null);
  const colorRef = useRef<any>(null);
  const aberrationRef = useRef<any>(null);

  // Animated values (mutated directly, not React state)
  const currentRef = useRef({
    bloomIntensity: 1.2,
    bloomThreshold: 0.8,
    vignetteOffset: 0.35,
    vignetteDarkness: 0.2,
    hue: 0,
    saturation: 0,
    aberrationX: 0,
    aberrationY: 0,
  });

  // Target preset ref
  const targetRef = useRef<MoodPreset>(MOOD_PRESETS.content);

  // Celebration timer — snaps to celebration preset then fades back
  const celebrationTimerRef = useRef(0);

  useEffect(() => {
    targetRef.current = MOOD_PRESETS[mood] ?? MOOD_PRESETS.content;
  }, [mood]);

  useEffect(() => {
    if (isCelebrating) {
      celebrationTimerRef.current = 2.0; // 2 seconds of celebration effect
    }
  }, [isCelebrating]);

  useFrame((_, delta) => {
    const cur = currentRef.current;

    // Determine active target: celebration or mood
    let target: MoodPreset;
    if (celebrationTimerRef.current > 0) {
      celebrationTimerRef.current -= delta;
      target = CELEBRATING_PRESET;
    } else {
      target = targetRef.current;
    }

    // Transition speed: faster during celebration snap, slower for mood shifts
    const speed = celebrationTimerRef.current > 0 ? 0.15 : 0.04;

    // Lerp all values
    cur.bloomIntensity = THREE.MathUtils.lerp(cur.bloomIntensity, target.bloomIntensity, speed);
    cur.bloomThreshold = THREE.MathUtils.lerp(cur.bloomThreshold, target.bloomThreshold, speed);
    cur.vignetteOffset = THREE.MathUtils.lerp(cur.vignetteOffset, target.vignetteOffset, speed);
    cur.vignetteDarkness = THREE.MathUtils.lerp(cur.vignetteDarkness, target.vignetteDarkness, speed);
    cur.hue = THREE.MathUtils.lerp(cur.hue, (target.hueShift * Math.PI) / 180, speed);
    cur.saturation = THREE.MathUtils.lerp(cur.saturation, (target.saturation * Math.PI) / 180, speed);
    cur.aberrationX = THREE.MathUtils.lerp(cur.aberrationX, target.aberrationX, speed);
    cur.aberrationY = THREE.MathUtils.lerp(cur.aberrationY, target.aberrationY, speed);

    // Apply to effect refs
    if (bloomRef.current) {
      bloomRef.current.intensity = cur.bloomIntensity;
      bloomRef.current.luminanceThreshold = cur.bloomThreshold;
    }
    if (vignetteRef.current) {
      vignetteRef.current.offset = cur.vignetteOffset;
      vignetteRef.current.darkness = cur.vignetteDarkness;
    }
    if (colorRef.current) {
      colorRef.current.hue = cur.hue;
      colorRef.current.saturation = cur.saturation;
    }
    if (aberrationRef.current) {
      aberrationRef.current.offset.x = cur.aberrationX;
      aberrationRef.current.offset.y = cur.aberrationY;
    }
  });

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        ref={bloomRef}
        intensity={1.2}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.025}
      />
      <Vignette
        ref={vignetteRef}
        offset={0.35}
        darkness={0.2}
        blendFunction={BlendFunction.NORMAL}
      />
      <HueSaturation
        ref={colorRef}
        hue={0}
        saturation={0}
        blendFunction={BlendFunction.NORMAL}
      />
      <ChromaticAberration
        ref={aberrationRef}
        offset={new Vector2(0, 0)}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
};
