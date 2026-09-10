import { useState } from 'react';
import type { FC } from 'react';
import { Play, Pause, ChevronUp, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { AnimationName, BlobbyVariant } from '@/types';

const ANIMATIONS: AnimationName[] = [
  'idle',
  'wave',
  'happy',
  'celebrating',
  'worried',
  'sick',
  'critical',
  'recovering',
  'rest',
];

const VARIANTS: { label: string; value: BlobbyVariant }[] = [
  { label: 'Base', value: 'base' },
  { label: 'Raincoat', value: 'raincoat' },
  { label: 'Sweater', value: 'sweater' },
  { label: 'Glasses', value: 'glasses' },
];

const AnimationControls: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const currentAnimation = useAppStore((state) => state.currentAnimation);
  const currentVariant = useAppStore((state) => state.currentVariant);
  const isPlaying = useAppStore((state) => state.isPlaying);
  const setAnimation = useAppStore((state) => state.setAnimation);
  const setVariant = useAppStore((state) => state.setVariant);
  const togglePlaying = useAppStore((state) => state.togglePlaying);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        background: 'rgba(26, 22, 18, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Toggle header — always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 12px',
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
          color: 'rgba(245, 240, 232, 0.5)',
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        {isOpen ? 'Hide Controls' : 'Controls'}
        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {/* Expandable content */}
      <div
        style={{
          maxHeight: isOpen ? 200 : 0,
          opacity: isOpen ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.2s ease',
          padding: isOpen ? '0 12px 12px' : '0 12px',
        }}
      >
        {/* Animation row */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {ANIMATIONS.map((anim) => {
            const isActive = currentAnimation === anim;
            return (
              <button
                key={anim}
                onClick={() => setAnimation(anim)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 9999,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  background: isActive
                    ? '#8BA875'
                    : 'rgba(255, 255, 255, 0.06)',
                  color: isActive ? '#1A1612' : 'rgba(245, 240, 232, 0.6)',
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {anim}
              </button>
            );
          })}
        </div>

        {/* Variant + Controls row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 8,
          }}
        >
          {/* Variant buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
            {VARIANTS.map((v) => {
              const isActive = currentVariant === v.value;
              return (
                <button
                  key={v.value}
                  onClick={() => setVariant(v.value)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 9999,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    background: isActive
                      ? '#8BA875'
                      : 'rgba(255, 255, 255, 0.06)',
                    color: isActive ? '#1A1612' : 'rgba(245, 240, 232, 0.6)',
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          {/* Play/Pause */}
          <button
            onClick={togglePlaying}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 9999,
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'rgba(245, 240, 232, 0.6)',
              transition: 'background 0.2s',
            }}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnimationControls;
