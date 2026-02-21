import type { FC, ReactNode } from 'react';

interface GlassCardProps {
  className?: string;
  children: ReactNode;
}

const GlassCard: FC<GlassCardProps> = ({ className = '', children }) => {
  return (
    <div
      className={className}
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        borderRadius: 24,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
};

export default GlassCard;
