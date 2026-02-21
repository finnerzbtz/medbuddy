import type { FC } from 'react';
import TopBar from '@/components/ui/TopBar';
import BottomNav from '@/components/ui/BottomNav';

const VerifyPage: FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <TopBar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Verify
        </h1>
      </div>
      <BottomNav />
    </div>
  );
};

export default VerifyPage;
