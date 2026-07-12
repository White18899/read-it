import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

export const PomodoroTimer: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes default
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setIsActive(false);
            playChime();
            
            // Switch modes automatically
            const nextMode = mode === 'focus' ? 'break' : 'focus';
            setMode(nextMode);
            return nextMode === 'focus' ? 25 * 60 : 5 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, mode]);

  const playChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = () => {
    setIsActive(false);
    setTimeLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 12px',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        height: '36px',
        background: 'var(--surface)',
      }}
    >
      {/* Small status dot indicating active state */}
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: mode === 'focus' ? '#ef4444' : '#10b981',
          boxShadow: mode === 'focus' 
            ? '0 0 8px rgba(239, 68, 68, 0.6)' 
            : '0 0 8px rgba(16, 185, 129, 0.6)',
          transition: 'all 0.3s ease',
        }}
        title={mode === 'focus' ? 'Focus Session' : 'Break Time'}
      />

      <span
        style={{
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          width: '40px',
          textAlign: 'center',
        }}
      >
        {formatTime(timeLeft)}
      </span>

      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={() => setIsActive(!isActive)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          className="hover-scale"
          title={isActive ? 'Pause' : 'Start'}
        >
          {isActive ? <Pause size={12} /> : <Play size={12} />}
        </button>

        <button
          onClick={handleReset}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          className="hover-scale"
          title="Reset"
        >
          <RotateCcw size={12} />
        </button>
      </div>
    </div>
  );
};
