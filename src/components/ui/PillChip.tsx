import type { FC } from 'react';
import StatusDot from '@/components/ui/StatusDot';

interface PillChipProps {
  name: string;
  time: string;
  color: string;
}

const PillChip: FC<PillChipProps> = ({ name, time, color }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        background: 'var(--glass-fill)',
        border: '1px solid var(--glass-border)',
        borderRadius: 9999,
        padding: '8px 14px',
        flexShrink: 0,
      }}
    >
      <StatusDot color={color} />
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {time}
      </span>
    </div>
  );
};

export default PillChip;
