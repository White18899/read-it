import React, { useState, useEffect, useRef } from 'react';
import { Send, Key, Sparkles, HelpCircle, BookOpen, AlertCircle, X } from 'lucide-react';
import { chatWithGemini } from '../utils/gemini';
import type { ChatMessage } from '../utils/gemini';

interface SidebarProps {
  documentText: string;
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  triggerPrompt?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documentText,
  isOpen,
  onClose,
  apiKey,
  onApiKeyChange,
  triggerPrompt,
}) => {
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [tempKey, setTempKey] = useState(apiKey);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Sync internal key when prop changes
  useEffect(() => {
    setTempKey(apiKey);
    setShowKeyInput(!apiKey);
  }, [apiKey]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Trigger prompt when passed from parent toolbar
  useEffect(() => {
    if (triggerPrompt && triggerPrompt.trim()) {
      handleSend(triggerPrompt);
    }
  }, [triggerPrompt]);

  const saveApiKey = () => {
    onApiKeyChange(tempKey.trim());
    setShowKeyInput(false);
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

    // Append user message
    const newMessages = [...messages, { sender: 'user', text } as const];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Create context prompt
      // Include document text excerpt to avoid exceeding token limits for extremely long files.
      // 1.5 Flash easily handles up to 1M tokens, but we trim to a reasonable size (e.g. first 60k characters) to keep responses snappy and lightweight.
      const docContext = documentText 
        ? `\n\n[DOCUMENT CONTENT EXCERPT (first 80,000 chars)]:\n${documentText.slice(0, 80000)}`
        : '\n\n[No document loaded]';
      
      const systemInstruction = `You are a helpful AI reading assistant. Below is the document context being read. Respond to the user's questions or request based on this context. Be concise, insightful, and structure your responses with clean, readable sections.`;
      
      // Map message history to Gemini API format
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

      // Convert conversation messages to Gemini history
      messages.forEach(msg => {
        geminiHistory.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });

      // Add the latest message
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
        prompt = 'Generate 4 high-quality Q&A cards (questions followed by answers) that test key understandings of this document. Format them clearly.';
        break;
    }

    handleSend(prompt);
  };

  // Helper to parse basic markdown elements (bold, bullets, code blocks, italics) to HTML tags
  const renderMarkdown = (text: string) => {
    // Escape HTML tags to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italics
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Line breaks
    html = html.replace(/\n/g, '<br />');

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
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>Summarize Document</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Get main points and takeaways</div>
            </div>
          </button>

          <button
            onClick={() => runPresetPrompt('concept')}
            className="hover-scale"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
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
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Understand core technical terms</div>
            </div>
          </button>

          <button
            onClick={() => runPresetPrompt('qa')}
            className="hover-scale"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
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
                color: msg.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                fontSize: '0.875rem',
                lineHeight: '1.45',
              }}
            >
              {msg.sender === 'user' ? msg.text : renderMarkdown(msg.text)}
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
            placeholder="Ask AI about this document..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'var(--background)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '10px 42px 10px 14px',
              color: 'var(--text-primary)',
              fontSize: '0.875rem',
              outline: 'none',
              transition: 'border-color var(--transition-fast)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: 'none',
              background: inputText.trim() ? 'var(--accent-gradient)' : 'transparent',
              color: inputText.trim() ? '#ffffff' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Send size={14} />
          </button>
        </form>
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
