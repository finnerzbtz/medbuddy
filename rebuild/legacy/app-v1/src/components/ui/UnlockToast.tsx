import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { RARITY_COLORS } from '@/data/rewards';
import type { UnlockNotification } from '@/types';

/**
 * Animated toast notification for unlocks.
 *
 * Slides up from the bottom when a new outfit/furniture/milestone is unlocked.
 * Shows one at a time with auto-dismiss after 4 seconds.
 * Rarity determines the glow color (common grey → legendary gold).
 */
export const UnlockToast = () => {
  const notifications = useAppStore((s) => s.pendingNotifications);
  const dismissNotification = useAppStore((s) => s.dismissNotification);
  const [visible, setVisible] = useState(false);
  const [currentNotif, setCurrentNotif] = useState<UnlockNotification | null>(notifications[0] ?? null);

  // Show the first pending notification
  useEffect(() => {
    if (notifications.length > 0 && !visible) {
      setCurrentNotif(notifications[0]);
      setVisible(true);
    }
  }, [notifications, visible]);

  // Auto-dismiss after 4 seconds
  useEffect(() => {
    if (!visible || !currentNotif) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        dismissNotification(currentNotif.id);
        setCurrentNotif(null);
      }, 400); // Wait for exit animation
    }, 4000);
    return () => clearTimeout(timer);
  }, [visible, currentNotif, dismissNotification]);

  if (!currentNotif) return null;

  const rarityColor = RARITY_COLORS[currentNotif.rarity] ?? '#A8A8A8';
  const isLegendary = currentNotif.rarity === 'legendary';
  const isRare = currentNotif.rarity === 'rare' || isLegendary;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 100,
        left: '50%',
        transform: `translateX(-50%) translateY(${visible ? 0 : 120}px)`,
        opacity: visible ? 1 : 0,
        transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
      onClick={() => {
        setVisible(false);
        setTimeout(() => {
          dismissNotification(currentNotif.id);
          setCurrentNotif(null);
        }, 300);
      }}
    >
      <div
        style={{
          background: 'rgba(26, 22, 18, 0.95)',
          backdropFilter: 'blur(20px)',
          border: `2px solid ${rarityColor}`,
          borderRadius: 20,
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          minWidth: 280,
          maxWidth: 360,
          boxShadow: `0 0 ${isRare ? 30 : 15}px ${rarityColor}40, 0 8px 32px rgba(0,0,0,0.5)`,
          animation: isLegendary ? 'legendaryPulse 2s ease-in-out infinite' : undefined,
          cursor: 'pointer',
        }}
      >
        {/* Icon */}
        <div
          style={{
            fontSize: 36,
            lineHeight: 1,
            filter: isRare ? `drop-shadow(0 0 8px ${rarityColor})` : undefined,
          }}
        >
          {currentNotif.icon}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Rarity label */}
          <div
            style={{
              fontSize: 10,
              fontFamily: 'DM Mono, monospace',
              color: rarityColor,
              textTransform: 'uppercase',
              letterSpacing: 1.5,
              marginBottom: 2,
            }}
          >
            {currentNotif.rarity} {currentNotif.type}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 15,
              fontFamily: 'Sora, sans-serif',
              fontWeight: 600,
              color: '#F5F0E8',
              lineHeight: 1.2,
            }}
          >
            {currentNotif.title}
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 12,
              fontFamily: 'DM Sans, sans-serif',
              color: '#F5F0E870',
              marginTop: 2,
              lineHeight: 1.3,
            }}
          >
            {currentNotif.description}
          </div>
        </div>

        {/* Sparkle indicator for rare+ */}
        {isRare && (
          <div
            style={{
              fontSize: 20,
              animation: 'spin 3s linear infinite',
            }}
          >
            ✨
          </div>
        )}
      </div>

      {/* Inline keyframe styles */}
      <style>{`
        @keyframes legendaryPulse {
          0%, 100% { box-shadow: 0 0 30px ${rarityColor}40, 0 8px 32px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 50px ${rarityColor}70, 0 8px 32px rgba(0,0,0,0.5); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
