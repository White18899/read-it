import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Volume2, Settings, Loader2, SkipBack, SkipForward } from 'lucide-react';

interface TTSPlayerProps {
  text: string;
  onWordBoundary: (charIndex: number, wordIndex: number) => void;
  onEnd: () => void;
  onPlayingStateChange: (isPlaying: boolean) => void;
  onBackward?: () => void;
  onForward?: () => void;
}

export const TTSPlayer: React.FC<TTSPlayerProps> = ({
  text,
  onWordBoundary,
  onEnd,
  onPlayingStateChange,
  onBackward,
  onForward,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Voice engine & settings state
  const [voiceEngine, setVoiceEngine] = useState<'browser' | 'openai' | 'cartesia'>(() => {
    return (localStorage.getItem('readit-tts-engine') as 'browser' | 'openai' | 'cartesia') || 'browser';
  });
  
  // Browser TTS state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  
  // OpenAI TTS state
  const [openaiApiKey, setOpenaiApiKey] = useState<string>(() => {
    return localStorage.getItem('readit-openai-key') || '';
  });
  const [openaiVoice, setOpenaiVoice] = useState<string>(() => {
    return localStorage.getItem('readit-openai-voice') || 'alloy';
  });

  // Cartesia TTS state
  const [cartesiaApiKey, setCartesiaApiKey] = useState<string>(() => {
    return localStorage.getItem('readit-cartesia-key') || '';
  });
  const [cartesiaVoice, setCartesiaVoice] = useState<string>(() => {
    return localStorage.getItem('readit-cartesia-voice') || 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';
  });
  const [isCustomCartesia, setIsCustomCartesia] = useState<boolean>(() => {
    const standardVoices = [
      'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
      'f786b574-daa5-4673-aa0c-cbe3e8534c02',
      'a5136bf9-224c-4d76-b823-52bd5efcffcc',
      '62ae83ad-4f6a-430b-af41-a9bede9286ca',
      'ef191366-f52f-447a-a398-ed8c0f2943a1',
      '95856005-0332-41b0-935f-352e296aa0df',
    ];
    const currentVoice = localStorage.getItem('readit-cartesia-voice') || 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4';
    return !standardVoices.includes(currentVoice);
  });
  const [customCartesiaVoiceVal, setCustomCartesiaVoiceVal] = useState<string>(() => {
    return localStorage.getItem('readit-cartesia-custom-voice') || '';
  });
  
  const [rate, setRate] = useState<number>(0.85);
  const [showSettings, setShowSettings] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Indian Voice Assist & Pitch State
  const [indianAssist, setIndianAssist] = useState<boolean>(() => {
    return localStorage.getItem('readit-indian-assist') === 'true';
  });
  const [pitch, setPitch] = useState<number>(() => {
    const saved = localStorage.getItem('readit-tts-pitch');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [backupVoice, setBackupVoice] = useState<string>(() => {
    return localStorage.getItem('readit-backup-voice') || '';
  });
  const [backupRate, setBackupRate] = useState<number>(() => {
    const saved = localStorage.getItem('readit-backup-rate');
    return saved ? parseFloat(saved) : 0.85;
  });

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load system voices for Browser engine
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
        
        // Select a default neat female voice if available, otherwise fallback
        let defaultVoice = availableVoices.find(v => {
          const name = v.name.toLowerCase();
          const lang = v.lang.toLowerCase();
          return lang.startsWith('en') && (
            name.includes('female') ||
            name.includes('zira') ||
            name.includes('samantha') ||
            name.includes('hazel') ||
            name.includes('google us english') ||
            name.includes('karen') ||
            name.includes('natural')
          );
        }) || availableVoices.find(
          v => v.lang.startsWith('en') && v.name.includes('Google')
        ) || availableVoices.find(
          v => v.lang.startsWith('en')
        ) || availableVoices[0];

        // If Indian Assist is enabled, try to select an Indian voice by default
        const isIndianAssistEnabled = localStorage.getItem('readit-indian-assist') === 'true';
        if (isIndianAssistEnabled) {
          const indianVoice = availableVoices.find(v => {
            const lang = v.lang.toLowerCase();
            const name = v.name.toLowerCase();
            return (lang === 'en-in' || lang === 'en_in') || 
                   (lang.startsWith('en') && (name.includes('india') || name.includes('in-')));
          });
          if (indianVoice) {
            defaultVoice = indianVoice;
          }
        }

        if (defaultVoice) {
          setSelectedVoice(defaultVoice.name);
        }
      }
    };

    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Sync playback rate for OpenAI audio in real time (Cartesia handles speed server-side)
  useEffect(() => {
    if (audioRef.current && voiceEngine !== 'cartesia') {
      audioRef.current.playbackRate = rate;
    } else if (audioRef.current && voiceEngine === 'cartesia') {
      audioRef.current.playbackRate = 1.0;
    }
  }, [rate, voiceEngine]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Sync playing/paused states with the parent component
  useEffect(() => {
    onPlayingStateChange(isPlaying && !isPaused);
  }, [isPlaying, isPaused, onPlayingStateChange]);

  const handleEngineChange = (engine: 'browser' | 'openai' | 'cartesia') => {
    handleStopOnly();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
    setVoiceEngine(engine);
    localStorage.setItem('readit-tts-engine', engine);
  };

  const handleCartesiaApiKeyChange = (key: string) => {
    setCartesiaApiKey(key);
    localStorage.setItem('readit-cartesia-key', key.trim());
  };

  const handleCartesiaVoiceChange = (voice: string) => {
    handleStopOnly();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
    
    if (voice === 'custom') {
      setIsCustomCartesia(true);
      const customVal = localStorage.getItem('readit-cartesia-custom-voice') || '';
      setCartesiaVoice(customVal);
      localStorage.setItem('readit-cartesia-voice', customVal);
    } else {
      setIsCustomCartesia(false);
      setCartesiaVoice(voice);
      localStorage.setItem('readit-cartesia-voice', voice);
    }
  };

  const handleCustomCartesiaVoiceChange = (val: string) => {
    handleStopOnly();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
    setCustomCartesiaVoiceVal(val);
    localStorage.setItem('readit-cartesia-custom-voice', val.trim());
    setCartesiaVoice(val.trim());
    localStorage.setItem('readit-cartesia-voice', val.trim());
  };

  const handleOpenaiVoiceChange = (voice: string) => {
    handleStopOnly();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
    setOpenaiVoice(voice);
    localStorage.setItem('readit-openai-voice', voice);
  };

  const handleOpenaiKeyChange = (key: string) => {
    setOpenaiApiKey(key);
    localStorage.setItem('readit-openai-key', key.trim());
  };

  const handleIndianAssistChange = (enabled: boolean) => {
    setIndianAssist(enabled);
    localStorage.setItem('readit-indian-assist', enabled ? 'true' : 'false');
    
    if (enabled) {
      // Cache current settings
      setBackupVoice(selectedVoice);
      setBackupRate(rate);
      localStorage.setItem('readit-backup-voice', selectedVoice);
      localStorage.setItem('readit-backup-rate', rate.toString());
      
      // Auto-select Indian English voice if available
      const indianVoice = voices.find(v => {
        const lang = v.lang.toLowerCase();
        const name = v.name.toLowerCase();
        return (lang === 'en-in' || lang === 'en_in') || 
               (lang.startsWith('en') && (name.includes('india') || name.includes('in-')));
      });
      
      if (indianVoice) {
        setSelectedVoice(indianVoice.name);
      }
      setRate(0.7);
    } else {
      // Restore previous settings
      if (backupVoice) {
        setSelectedVoice(backupVoice);
      }
      setRate(backupRate);
    }
  };

  const handlePitchChange = (newPitch: number) => {
    setPitch(newPitch);
    localStorage.setItem('readit-tts-pitch', newPitch.toString());
  };

  // Internal audio-stopping helper
  const handleStopOnly = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const handleSpeak = async () => {
    if (!text) return;

    if (isPaused) {
      if ((voiceEngine === 'openai' || voiceEngine === 'cartesia') && audioRef.current) {
        audioRef.current.play();
      } else {
        window.speechSynthesis.resume();
      }
      setIsPaused(false);
      return;
    }

    handleStopOnly();

    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) return;

    if (voiceEngine === 'browser') {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utteranceRef.current = utterance;

      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) {
        utterance.voice = voice;
      }
      
      utterance.rate = rate;
      utterance.pitch = pitch;

      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const charIndex = event.charIndex;
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
    } else if (voiceEngine === 'openai') {
      // OpenAI Engine
      if (!openaiApiKey) {
        alert('Please configure your OpenAI API Key in settings first.');
        setShowSettings(true);
        return;
      }

      setIsFetching(true);
      try {
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'tts-1',
            input: cleanText,
            voice: openaiVoice,
            speed: rate,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || `HTTP error! status: ${response.status}`;
          throw new Error(msg);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.playbackRate = rate;

        const words = cleanText.split(/\s+/);

        audio.ontimeupdate = () => {
          if (audio.duration) {
            const progress = audio.currentTime / audio.duration;
            const wordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);
            onWordBoundary(0, wordIdx);
          }
        };

        audio.onended = () => {
          setIsPlaying(false);
          setIsPaused(false);
          onEnd();
        };

        audio.onerror = () => {
          setIsPlaying(false);
          setIsPaused(false);
          onEnd();
          alert('Error playing audio from OpenAI TTS.');
        };

        await audio.play();
        setIsPlaying(true);
        setIsPaused(false);
      } catch (err: any) {
        console.error('OpenAI TTS error:', err);
        alert(`Failed to generate OpenAI voice: ${err.message}`);
      } finally {
        setIsFetching(false);
      }
    } else {
      // Cartesia Engine
      if (!cartesiaApiKey) {
        alert('Please configure your Cartesia API Key in settings first.');
        setShowSettings(true);
        return;
      }
      if (!cartesiaVoice) {
        alert('Please configure your Cartesia Voice ID in settings first.');
        setShowSettings(true);
        return;
      }

      setIsFetching(true);
      try {
        const response = await fetch('https://api.cartesia.ai/tts/bytes', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cartesiaApiKey}`,
            'Cartesia-Version': '2024-06-10',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model_id: 'sonic-3.5',
            transcript: cleanText,
            voice: {
              mode: 'id',
              id: cartesiaVoice,
            },
            output_format: {
              container: 'mp3',
              sample_rate: 44100,
              bit_rate: 128000
            },
            generation_config: {
              speed: Math.max(0.6, Math.min(1.5, rate)),
              volume: 1.0,
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData.error?.message || `HTTP error! status: ${response.status}`;
          throw new Error(msg);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.playbackRate = 1.0;

        const words = cleanText.split(/\s+/);

        audio.ontimeupdate = () => {
          if (audio.duration) {
            const progress = audio.currentTime / audio.duration;
            const wordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);
            onWordBoundary(0, wordIdx);
          }
        };

        audio.onended = () => {
          setIsPlaying(false);
          setIsPaused(false);
          onEnd();
        };

        audio.onerror = () => {
          setIsPlaying(false);
          setIsPaused(false);
          onEnd();
          alert('Error playing audio from Cartesia TTS.');
        };

        await audio.play();
        setIsPlaying(true);
        setIsPaused(false);
      } catch (err: any) {
        console.error('Cartesia TTS error:', err);
        alert(`Failed to generate Cartesia voice: ${err.message}`);
      } finally {
        setIsFetching(false);
      }
    }
  };

  // Auto-play when text changes if it was already playing
  useEffect(() => {
    if (isPlaying && !isPaused && text) {
      const timer = setTimeout(() => {
        handleSpeak();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [text]);

  const handlePause = () => {
    if (isPlaying && !isPaused) {
      if ((voiceEngine === 'openai' || voiceEngine === 'cartesia') && audioRef.current) {
        audioRef.current.pause();
      } else {
        window.speechSynthesis.pause();
      }
      setIsPaused(true);
    }
  };

  const handleStop = () => {
    handleStopOnly();
    setIsPlaying(false);
    setIsPaused(false);
    onEnd();
  };

  // Group browser voices for premium neural / local distinction
  const premiumVoices = voices.filter(v => {
    const name = v.name.toLowerCase();
    return name.includes('natural') || 
           name.includes('online') || 
           name.includes('google') || 
           name.includes('neural') ||
           name.includes('multilingual');
  });

  const standardVoices = voices.filter(v => {
    const name = v.name.toLowerCase();
    return !(name.includes('natural') || 
             name.includes('online') || 
             name.includes('google') || 
             name.includes('neural') ||
             name.includes('multilingual'));
  });

  const selectStyle: React.CSSProperties = {
    background: 'var(--background)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px',
    fontSize: '0.8rem',
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onBackward && (
          <button
            className="hover-scale"
            onClick={onBackward}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Previous Page/Section"
          >
            <SkipBack size={15} />
          </button>
        )}

        {isFetching ? (
          <button
            disabled
            style={{
              background: 'var(--surface-hover)',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'not-allowed',
            }}
          >
            <Loader2 size={16} className="animate-spin" />
          </button>
        ) : !isPlaying || isPaused ? (
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
              color: 'var(--accent-contrast)',
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

        {onForward && (
          <button
            className="hover-scale"
            onClick={onForward}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            title="Next Page/Section"
          >
            <SkipForward size={15} />
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
              width: '280px',
              boxShadow: 'var(--shadow-md)',
              zIndex: 100,
            }}
          >
            {/* Engine select */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>TTS Engine</label>
              <select
                value={voiceEngine}
                onChange={(e) => handleEngineChange(e.target.value as 'browser' | 'openai')}
                style={selectStyle}
              >
                <option value="browser">🌐 Browser Speech (Free)</option>
                <option value="openai">✨ OpenAI AI Voice (Premium)</option>
              </select>
            </div>

            {/* Indian English Assist Mode Toggle */}
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '6px 0', 
                borderBottom: '1px solid var(--border)',
                marginBottom: '2px'
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                🇮🇳 <span style={{ color: 'var(--text-primary)' }}>Indian Voice Assist</span>
              </span>
              <input
                type="checkbox"
                checked={indianAssist}
                onChange={(e) => handleIndianAssistChange(e.target.checked)}
                style={{
                  accentColor: 'var(--accent)',
                  cursor: 'pointer',
                  width: '16px',
                  height: '16px',
                }}
              />
            </div>

            {indianAssist && (
              <div style={{ 
                fontSize: '0.7rem', 
                background: 'rgba(99, 102, 241, 0.08)', 
                color: 'var(--accent)', 
                padding: '6px 8px', 
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                lineHeight: '1.25',
                marginBottom: '2px'
              }}>
                Optimized for Indian English comprehension: selected Indian voice at a slower rate (0.7x).
              </div>
            )}

            {voiceEngine === 'browser' && (
              /* Browser voice list */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  style={selectStyle}
                >
                  {premiumVoices.length > 0 && (
                    <optgroup label="✨ Premium Neural Voices">
                      {premiumVoices.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {standardVoices.length > 0 && (
                    <optgroup label="Standard Voices">
                      {standardVoices.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            {voiceEngine === 'openai' && (
              /* OpenAI Premium TTS settings */
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>OpenAI Voice</label>
                  <select
                    value={openaiVoice}
                    onChange={(e) => handleOpenaiVoiceChange(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="alloy">Alloy (Neutral)</option>
                    <option value="echo">Echo (Warm Male)</option>
                    <option value="fable">Fable (Narrative)</option>
                    <option value="onyx">Onyx (Deep Male)</option>
                    <option value="nova">Nova (Bright Female)</option>
                    <option value="shimmer">Shimmer (Professional)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>OpenAI API Key</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={openaiApiKey}
                    onChange={(e) => handleOpenaiKeyChange(e.target.value)}
                    style={{
                      background: 'var(--background)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px',
                      fontSize: '0.8rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </>
            )}

            {voiceEngine === 'cartesia' && (
              /* Cartesia Premium TTS settings */
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cartesia Voice</label>
                  <select
                    value={isCustomCartesia ? 'custom' : cartesiaVoice}
                    onChange={(e) => handleCartesiaVoiceChange(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="db6b0ed5-d5d3-463d-ae85-518a07d3c2b4">Skylar (US Female)</option>
                    <option value="f786b574-daa5-4673-aa0c-cbe3e8534c02">Katie (US Female)</option>
                    <option value="a5136bf9-224c-4d76-b823-52bd5efcffcc">Jameson (US Male)</option>
                    <option value="62ae83ad-4f6a-430b-af41-a9bede9286ca">Gemma (UK Female)</option>
                    <option value="ef191366-f52f-447a-a398-ed8c0f2943a1">Archie (UK Male)</option>
                    <option value="95856005-0332-41b0-935f-352e296aa0df">Sophie (Warm Female)</option>
                    <option value="custom">Custom Voice ID...</option>
                  </select>
                </div>

                {isCustomCartesia && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Custom Voice ID (UUID)</label>
                    <input
                      type="text"
                      placeholder="e.g. 57657279-7a55-4d7a..."
                      value={customCartesiaVoiceVal}
                      onChange={(e) => handleCustomCartesiaVoiceChange(e.target.value)}
                      style={{
                        background: 'var(--background)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px',
                        fontSize: '0.8rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cartesia API Key</label>
                  <input
                    type="password"
                    placeholder="Enter Cartesia API key..."
                    value={cartesiaApiKey}
                    onChange={(e) => handleCartesiaApiKeyChange(e.target.value)}
                    style={{
                      background: 'var(--background)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px',
                      fontSize: '0.8rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </>
            )}

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

            {/* Pitch range */}
            {voiceEngine === 'browser' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pitch (Smoothness)</span>
                  <span style={{ fontWeight: 500 }}>{pitch}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={pitch}
                  onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                  style={{
                    accentColor: 'var(--accent)',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
        <Volume2 size={16} />
        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
          {voiceEngine === 'openai' ? `OpenAI Voice (${openaiVoice})` : voiceEngine === 'cartesia' ? 'Cartesia Voice' : 'Text Reader'}
        </span>
      </div>
    </div>
  );
};
