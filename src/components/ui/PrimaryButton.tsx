import type { FC, ReactNode } from 'react';

interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
}

const PrimaryButton: FC<PrimaryButtonProps> = ({ children, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'linear-gradient(90deg, #8BA875, #A3B18A)',
        color: '#1A1612',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 16,
        fontWeight: 600,
        padding: '14px 24px',
        borderRadius: 16,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 24px rgba(139, 168, 117, 0.3)',
      }}
    >
      {children}
    </button>
  );
};

export default PrimaryButton;
