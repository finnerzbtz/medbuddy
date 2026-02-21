import type { FC } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from '@/components/pages/HomePage';
import MedsPage from '@/components/pages/MedsPage';
import LogPage from '@/components/pages/LogPage';
import VerifyPage from '@/components/pages/VerifyPage';

const App: FC = () => {
  return (
    <BrowserRouter>
      <div
        style={{
          maxWidth: 430,
          width: '100%',
          margin: '0 auto',
          minHeight: '100vh',
          backgroundColor: 'var(--bg-base)',
          position: 'relative',
        }}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/meds" element={<MedsPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/verify" element={<VerifyPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;
