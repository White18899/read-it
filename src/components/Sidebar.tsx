import React, { useState, useEffect, useRef } from 'react';
import { Send, Key, Sparkles, HelpCircle, BookOpen, AlertCircle, X, Mic } from 'lucide-react';
import { chatWithGemini } from '../utils/gemini';
import type { ChatMessage } from '../utils/gemini';
import type { Flashcard } from '../App';

interface SidebarProps {
  documentText: string;
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  triggerPrompt?: string;
  onLoadFlashcards: (cards: Flashcard[]) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documentText,
  isOpen,
  onClose,
  apiKey,
  onApiKeyChange,
  triggerPrompt,
  onLoadFlashcards,
}) => {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [tempKey, setTempKey] = useState(apiKey);
  
  // Voice Input States & Reference
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync internal key when prop changes
  useEffect(() => {
    setTempKey(apiKey);
    setShowKeyInput(!apiKey);
  }, [apiKey]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isLoading]);

  // Trigger prompt when passed from parent toolbar
  useEffect(() => {
    if (triggerPrompt && triggerPrompt.trim()) {
      handleSend(triggerPrompt);
    }
  }, [triggerPrompt]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
        }
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Speech Recognition is not supported in this browser. Try Chrome, Edge, or Safari.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
      }
    }
  };

  const saveApiKey = () => {
    onApiKeyChange(tempKey.trim());
    setShowKeyInput(false);
  };

  // Helper to parse Q&A pairs from text
  const extractFlashcards = (text: string): Flashcard[] => {
    const cards: Flashcard[] = [];
    const lines = text.split('\n');
    let currentQ = '';
    let currentA = '';
    
    lines.forEach(line => {
      const clean = line.replace(/\*\*/g, '').trim();
      const qMatch = clean.match(/^(?:q(?:uestion)?\s*(?:\d+)?\s*[:\-–])\s*(.*)$/i);
      const aMatch = clean.match(/^(?:a(?:nswer)?\s*(?:\d+)?\s*[:\-–])\s*(.*)$/i);
      
      if (qMatch) {
        if (currentQ && currentA) {
          cards.push({
            id: `${Date.now()}-${cards.length}`,
            question: currentQ,
            answer: currentA
          });
          currentQ = '';
          currentA = '';
        }
        currentQ = qMatch[1].trim();
      } else if (aMatch) {
        currentA = aMatch[1].trim();
      } else if (clean !== '') {
        if (currentQ && !currentA) {
          currentQ += ' ' + clean;
        } else if (currentQ && currentA) {
          currentA += ' ' + clean;
        }
      }
    });
    
    if (currentQ && currentA) {
      cards.push({
        id: `${Date.now()}-${cards.length}`,
        question: currentQ,
        answer: currentA
      });
    }
    
    return cards;
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isLoading) return;

    if (!apiKey) {
      setErrorMessage('Please set your Gemini API Key first.');
      setShowKeyInput(true);
      return;
    }

    setErrorMessage('');
    if (!textToSend) setInputText('');

    const newMessages = [...messages, { sender: 'user', text } as const];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const docContext = documentText 
        ? `\n\n[DOCUMENT CONTENT EXCERPT (first 12,000 chars)]:\n${documentText.slice(0, 12000)}`
        : '\n\n[No document loaded]';
      
      const systemInstruction = `You are a helpful AI reading assistant. Below is the document context being read. Respond to the user's questions or request based on this context. Be concise, insightful, and structure your responses with clean, readable sections.`;
      
      const geminiHistory: ChatMessage[] = [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}${docContext}` }]
        },
        {
          role: 'model',
          parts: [{ text: "Understood. I'm ready to assist you with the document. What would you like me to do?" }]
        }
      ];

      messages.forEach(msg => {
        geminiHistory.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });

      geminiHistory.push({
        role: 'user',
        parts: [{ text }]
      });

      const response = await chatWithGemini(apiKey, geminiHistory);
      setMessages([...newMessages, { sender: 'ai', text: response }]);
    } catch (error: any) {
      setErrorMessage(error.message || 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const runPresetPrompt = (type: 'summary' | 'concept' | 'qa') => {
    if (!documentText) {
      setErrorMessage('Please load a document first.');
      return;
    }

    let prompt = '';
    switch (type) {
      case 'summary':
        prompt = 'Provide a comprehensive summary of this document. Outline the main thesis, key arguments, and final conclusions in structured bullet points.';
        break;
      case 'concept':
        prompt = 'Identify the 3 most important or complex concepts explained in this document. Define them clearly in simple terms, using real-world analogies.';
        break;
      case 'qa':
        prompt = 'Generate 4 high-quality Q&A cards (questions followed by answers) that test key understandings of this document. Format each card clearly as:\nQ: [Question]\nA: [Answer]';
        break;
    }

    handleSend(prompt);
  };

  const renderMarkdown = (text: string) => {
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    const lines = escaped.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();

      if (trimmed.startsWith('### ')) {
        return `<h3>${trimmed.slice(4)}</h3>`;
      }
      if (trimmed.startsWith('## ')) {
        return `<h2>${trimmed.slice(3)}</h2>`;
      }
      if (trimmed.startsWith('# ')) {
        return `<h1>${trimmed.slice(2)}</h1>`;
      }

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
        return `<li>${trimmed.slice(2)}</li>`;
      }

      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        return `<li>${numberedMatch[2]}</li>`;
      }

      return line;
    });

    let html = '';
    let inList = false;

    processedLines.forEach(line => {
      const isListItem = line.startsWith('<li>');
      if (isListItem) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += line;
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        const isHeading = line.startsWith('<h') && line.includes('</h');
        if (isHeading || line.startsWith('<pre>')) {
          html += line;
        } else {
          html += line + '<br />';
        }
      }
    });

    if (inList) {
      html += '</ul>';
    }

    return <div dangerouslySetInnerHTML={{ __html: html }} className="markdown-body" />;
  };

  if (!isOpen) return null;

  return (
    <div
      className="glass-panel"
      style={{
        width: '380px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        position: 'relative',
        animation: 'slideInRight var(--transition-normal) forwards',
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={18} className="gradient-text" style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.125rem', fontWeight: 600 }}>AI Assistant</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Configure API Key"
          >
            <Key size={16} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Key Input Section */}
      {showKeyInput && (
        <div
          style={{
            padding: '16px',
            background: 'var(--surface-hover)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <Key size={14} />
            <span>Enter Gemini API Key</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
            <button
              onClick={saveApiKey}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Your key is saved locally in your browser storage. Get a free API Key from Google AI Studio.
          </p>
        </div>
      )}

      {/* Chat pane */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Preset prompts */}
        {messages.length === 0 && !isLoading && (
          <div
            style={{
              padding: '24px 16px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              Quick Actions
            </p>
            <button
              onClick={() => runPresetPrompt('summary')}
              className="hover-scale"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Sparkles size={16} style={{ color: '#a855f7' }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Summarize Document</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Key points, thesis, and takeaways</div>
              </div>
            </button>

            <button
              onClick={() => runPresetPrompt('concept')}
              className="hover-scale"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <BookOpen size={16} style={{ color: '#3b82f6' }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Explain Key Concepts</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Identify and define core topics</div>
              </div>
            </button>

            <button
              onClick={() => runPresetPrompt('qa')}
              className="hover-scale"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <HelpCircle size={16} style={{ color: '#f59e0b' }} />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Generate Q&A Cards</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Practice and test your memory</div>
              </div>
            </button>
          </div>
        )}

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.sender === 'user' ? 'var(--accent)' : 'var(--surface)',
                  border: msg.sender === 'user' ? 'none' : '1px solid var(--border)',
                  color: msg.sender === 'user' ? 'var(--accent-contrast)' : 'var(--text-primary)',
                  fontSize: '0.875rem',
                  lineHeight: '1.45',
                }}
              >
                {msg.sender === 'user' ? msg.text : renderMarkdown(msg.text)}
                
                {msg.sender === 'ai' && (() => {
                  const cards = extractFlashcards(msg.text);
                  if (cards.length > 0) {
                    return (
                      <button
                        onClick={() => onLoadFlashcards(cards)}
                        style={{
                          marginTop: '8px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          border: '1px solid rgba(59, 130, 246, 0.2)',
                          borderRadius: '8px',
                          color: 'var(--text-primary)',
                          padding: '6px 12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        className="hover-scale"
                      >
                        <BookOpen size={12} style={{ color: '#3b82f6' }} />
                        <span>Study as Flashcards ({cards.length})</span>
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {msg.sender === 'user' ? 'You' : 'Gemini'}
              </span>
            </div>
          ))}

          {isLoading && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                borderRadius: '14px 14px 14px 2px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                display: 'flex',
                gap: '6px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulse 1.2s infinite ease-in-out',
                }}
              ></div>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulse 1.2s infinite ease-in-out 0.2s',
                }}
              ></div>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  animation: 'pulse 1.2s infinite ease-in-out 0.4s',
                }}
              ></div>
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                display: 'flex',
                gap: '8px',
                color: '#ef4444',
                fontSize: '0.8rem',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{errorMessage}</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{
              display: 'flex',
              gap: '8px',
              position: 'relative',
            }}
          >
            <input
              type="text"
              placeholder={isListening ? "Listening..." : "Ask AI about this document..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
              style={{
                flex: 1,
                background: 'var(--background)',
                border: isListening ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '10px 72px 10px 14px',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'all var(--transition-fast)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
              onBlur={(e) => (e.target.style.borderColor = isListening ? 'var(--accent)' : 'var(--border)')}
            />
            
            <button
              type="button"
              onClick={toggleListening}
              style={{
                position: 'absolute',
                right: '38px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                color: isListening ? '#ef4444' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)',
              }}
              title={isListening ? "Stop listening" : "Talk to AI"}
              className={isListening ? "animate-pulse" : "hover-scale"}
            >
              <Mic size={14} />
            </button>

            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                background: inputText.trim() ? 'var(--accent-gradient)' : 'transparent',
                color: inputText.trim() ? 'var(--accent-contrast)' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      </div>

      {/* Global CSS Inject for markdown body */}
      <style dangerouslySetInnerHTML={{ __html: `
        .markdown-body pre {
          background: var(--background);
          padding: 8px;
          border-radius: var(--radius-sm);
          overflow-x: auto;
          margin: 8px 0;
          border: 1px solid var(--border);
        }
        .markdown-body code {
          font-family: monospace;
          font-size: 0.85em;
          background: var(--background);
          padding: 2px 4px;
          border-radius: 4px;
          color: #a855f7;
        }
        .markdown-body br {
          content: "";
          display: block;
          margin-top: 6px;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(0.6); opacity: 0.4; }
          50% { transform: scale(1.2); opacity: 1; }
        }
      `}} />
    </div>
  );
};
