import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Volume2, Settings } from 'lucide-react';

interface TTSPlayerProps {
  text: string;
  onWordBoundary: (charIndex: number, wordIndex: number) => void;
  onEnd: () => void;
  onPlayingStateChange: (isPlaying: boolean) => void;
}

export const TTSPlayer: React.FC<TTSPlayerProps> = ({
  text,
  onWordBoundary,
  onEnd,
  onPlayingStateChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [rate, setRate] = useState<number>(1.0);
  const [showSettings, setShowSettings] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load system voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Select a default voice (prefer Google US English or high-quality English voice if available)
        const defaultVoice = availableVoices.find(
          v => v.lang.startsWith('en') && v.name.includes('Google')
        ) || availableVoices.find(
          v => v.lang.startsWith('en')
        ) || availableVoices[0];

        if (defaultVoice) {
          setSelectedVoice(defaultVoice.name);
        }
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Sync state with parent
  useEffect(() => {
    onPlayingStateChange(isPlaying && !isPaused);
  }, [isPlaying, isPaused, onPlayingStateChange]);

  const handleSpeak = () => {
    if (!text) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      return;
    }

    window.speechSynthesis.cancel(); // Clear any ongoing speech

    // Clean text: replace markdown/HTML symbols or multiple spacings
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // Apply voice settings
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) {
      utterance.voice = voice;
    }
    
    utterance.rate = rate;

    // Track word boundaries for real-time word highlighting
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        // Calculate word index based on space characters
        const textBefore = cleanText.slice(0, charIndex);
        const wordsBefore = textBefore.trim().split(/\s+/);
        const wordIndex = textBefore.trim() === '' ? 0 : wordsBefore.length;
        onWordBoundary(charIndex, wordIndex);
      }
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      onEnd();
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      onEnd();
    };

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    if (isPlaying && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
  };

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 16px',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {!isPlaying || isPaused ? (
          <button
            className="hover-scale"
            onClick={handleSpeak}
            style={{
              background: 'var(--accent-gradient)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              cursor: 'pointer',
            }}
            title="Read Aloud"
          >
            <Play size={16} style={{ marginLeft: '2px' }} />
          </button>
        ) : (
          <button
            className="hover-scale"
            onClick={handlePause}
            style={{
              background: 'var(--surface-hover)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
            title="Pause"
          >
            <Pause size={16} />
          </button>
        )}

        {isPlaying && (
          <button
            className="hover-scale"
            onClick={handleStop}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              cursor: 'pointer',
            }}
            title="Stop"
          >
            <Square size={14} />
          </button>
        )}
      </div>

      <div style={{ height: '20px', borderLeft: '1px solid var(--border)' }}></div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
        <button
          className="hover-scale"
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'transparent',
            border: 'none',
            color: showSettings ? 'var(--accent)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
          title="Audio Settings"
        >
          <Settings size={18} />
        </button>

        {showSettings && (
          <div
            className="glass-panel animate-scale-up"
            style={{
              position: 'absolute',
              bottom: '50px',
              right: '-80px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              width: '240px',
              boxShadow: 'var(--shadow-md)',
              zIndex: 100,
            }}
          >
            {/* Voice select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Voice</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{
                  background: 'var(--background)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px',
                  fontSize: '0.8rem',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>

            {/* Rate range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Speed</span>
                <span style={{ fontWeight: 500 }}>{rate}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                style={{
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                  width: '100%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
        <Volume2 size={16} />
        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>Text Reader</span>
      </div>
    </div>
  );
};
