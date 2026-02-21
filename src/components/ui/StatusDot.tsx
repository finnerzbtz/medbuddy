import type { FC } from 'react';

interface StatusDotProps {
  color: string;
  size?: number;
}

const StatusDot: FC<StatusDotProps> = ({ color, size = 8 }) => {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
      }}
    />
  );
};

export default StatusDot;
