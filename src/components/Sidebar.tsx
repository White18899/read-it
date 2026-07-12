import React, { useState, useEffect, useRef } from 'react';
import { Send, Key, Sparkles, HelpCircle, BookOpen, AlertCircle, X, Mic, Play, Volume2, MessageSquare, Copy } from 'lucide-react';
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
  onSpeakText?: (text: string, sectionId: number | null) => void;
  currentWordIndex?: number;
  textToSpeak?: string;
  isPlaying?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  documentText,
  isOpen,
  onClose,
  apiKey,
  onApiKeyChange,
  triggerPrompt,
  onLoadFlashcards,
  onSpeakText,
  currentWordIndex = -1,
  textToSpeak = '',
  isPlaying = false,
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

  // Chat text selection reading states
  const [selectedText, setSelectedText] = useState<string>('');
  const [toolbarCoords, setToolbarCoords] = useState<{ top: number; left: number } | null>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);

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

  // Listen for selection completion events inside the chat messages area
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setToolbarCoords(null);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      console.log("Sidebar handleSelection: selected text = '" + text + "'");
      
      try {
        const range = selection.getRangeAt(0);
        const container = messageContainerRef.current;
        const contains = container && (
          container.contains(selection.anchorNode) ||
          container.contains(selection.focusNode)
        );
        console.log("Sidebar handleSelection: container contains selection? ", contains);
        
        if (contains) {
          const rect = range.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          setToolbarCoords({
            top: rect.top - containerRect.top + container.scrollTop - 40,
            left: rect.left - containerRect.left + rect.width / 2,
          });
          setSelectedText(text);
        }
      } catch (err) {
        console.error('Error calculating selection coords:', err);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    document.addEventListener('keyup', handleSelection);

    const handleSelectionCollapse = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setToolbarCoords(null);
        setSelectedText('');
      }
    };
    document.addEventListener('selectionchange', handleSelectionCollapse);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
      document.removeEventListener('keyup', handleSelection);
      document.removeEventListener('selectionchange', handleSelectionCollapse);
    };
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

    // Append an empty AI message that we will populate via streaming chunks
    const chatWithAiPlaceholder = [...newMessages, { sender: 'ai', text: '' } as const];
    setMessages(chatWithAiPlaceholder);

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
      // Clean previous thought markers before sending history back
      const cleanText = msg.text.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '');
      geminiHistory.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: cleanText }]
      });
    });

    geminiHistory.push({
      role: 'user',
      parts: [{ text }]
    });

    const models = [
      'gemini-2.0-flash-thinking-exp-01-21',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash-8b',
    ];

    let success = false;
    let streamThoughts = '';
    let streamText = '';

    for (const model of models) {
      if (success) break;
      try {
        const isThinkingModel = model.includes('thinking');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        
        const requestPayload = {
          contents: geminiHistory,
          generationConfig: {
            temperature: isThinkingModel ? 0.7 : 0.4,
            ...(isThinkingModel ? {
              thinkingConfig: {
                thinkingBudget: -1
              }
            } : {})
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errMsg = errorData.error?.message || `HTTP error ${response.status}`;
          if (errMsg.toLowerCase().includes('key') || response.status === 400) {
            throw new Error(errMsg);
          }
          throw new Error(errMsg);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable.');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        success = true; // Mark as successful since stream opened

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine || !cleanLine.startsWith('data: ')) continue;
            
            const rawData = cleanLine.slice(6);
            try {
              const chunkJson = JSON.parse(rawData);
              const parts = chunkJson.candidates?.[0]?.content?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.thought || part.thoughtSignature) {
                    streamThoughts += part.text || '';
                  } else {
                    streamText += part.text || '';
                  }
                }

                // Update UI in real-time with thoughts and answers
                let updatedOutput = '';
                if (streamThoughts.trim()) {
                  updatedOutput = `:::thought\n${streamThoughts.trim()}\n:::\n\n${streamText}`;
                } else {
                  updatedOutput = streamText;
                }

                setMessages(prev => {
                  const copy = [...prev];
                  if (copy.length > 0) {
                    copy[copy.length - 1] = { sender: 'ai', text: updatedOutput };
                  }
                  return copy;
                });
              }
            } catch (jsonErr) {
              // Ignore partial parsing failures
            }
          }
        }
      } catch (err: any) {
        console.warn(`Model ${model} streaming failed:`, err.message);
        if (err.message.toLowerCase().includes('key not valid') || err.message.toLowerCase().includes('api key')) {
          setErrorMessage(err.message);
          setIsLoading(false);
          // Remove the empty placeholder if key is invalid
          setMessages(newMessages);
          return;
        }
        // Fall back to next model
      }
    }

    if (!success) {
      setErrorMessage('Failed to connect to Gemini API fallback models.');
      setMessages(newMessages);
    }
    setIsLoading(false);
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

  const tokenizeAndHighlight = (htmlText: string, activeIndex: number) => {
    // Regex to match HTML tags vs text content
    const tagOrWordRegex = /(<[^>]+>|[^<>\s]+|\s+)/g;
    const tokens = htmlText.match(tagOrWordRegex) || [];
    
    let wordCounter = 0;
    const result = tokens.map((token) => {
      if (token.startsWith('<') && token.endsWith('>')) {
        return token;
      }
      if (token.trim() === '') {
        return token;
      }
      
      const isCurrent = wordCounter === activeIndex;
      wordCounter++;
      
      return `<span style="background-color: ${isCurrent ? 'var(--accent)' : 'transparent'}; color: ${isCurrent ? 'var(--accent-contrast)' : 'inherit'}; font-weight: ${isCurrent ? '700' : 'inherit'}; padding: 0 2px; border-radius: 3px; transition: all 0.1s ease;" class="${isCurrent ? 'chat-word-highlight' : ''}">${token}</span>`;
    });
    
    return result.join('');
  };

  const isMessagePlaying = (msgText: string) => {
    if (!isPlaying || !textToSpeak) return false;
    const cleanSpeak = textToSpeak.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '').trim();
    const cleanMsg = msgText.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '').trim();
    return cleanSpeak === cleanMsg;
  };

  const renderMarkdown = (text: string, isCurrentMsg?: boolean) => {
    // Extract thoughts block if present
    let thoughtHtml = '';
    let mainText = text;

    const thoughtMatch = text.match(/:::thought\n([\s\S]*?)\n:::/);
    if (thoughtMatch) {
      const thoughtContent = thoughtMatch[1]
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />');
      
      thoughtHtml = `
        <details class="thought-process-container" style="margin-bottom: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--background);">
          <summary class="thought-process-header" style="cursor: pointer; padding: 6px 10px; font-size: 0.75rem; font-weight: 600; color: var(--accent); display: flex; align-items: center; gap: 6px; outline: none; user-select: none;">
            <span>🧠 Thinking Process</span>
          </summary>
          <div class="thought-process-content" style="padding: 10px 12px; font-size: 0.8rem; border-top: 1px solid var(--border); color: var(--text-secondary); max-height: 200px; overflow-y: auto; line-height: 1.45; font-style: italic;">
            ${thoughtContent}
          </div>
        </details>
      `;
      mainText = text.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '');
    }

    // Escape HTML FIRST to prevent custom tags from being escaped
    let escaped = mainText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Convert horizontal rules (e.g. ---, ***, ___ or ** by itself on a line) on escaped text
    escaped = escaped.replace(/^(?:---|===|\*\*\*|\*\*|___)\s*$/gm, '<hr />');

    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Clean up any remaining raw formatting marks
    escaped = escaped.replace(/\*\*/g, '').replace(/\*/g, '');

    const lines = escaped.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();

      if (trimmed === '<hr />') {
        return trimmed;
      }
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
        return `<li class="ul-item">${trimmed.slice(2)}</li>`;
      }

      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        return `<li class="ol-item">${numberedMatch[2]}</li>`;
      }

      if (trimmed.startsWith('&gt; ') || trimmed.startsWith('> ')) {
        const quoteText = trimmed.startsWith('&gt; ') ? trimmed.slice(5) : trimmed.slice(2);
        return `<blockquote>${quoteText}</blockquote>`;
      }

      if (trimmed === '') {
        return '';
      }

      // If it's a regular text line (not inside a pre block)
      if (!trimmed.startsWith('<pre>') && !trimmed.startsWith('<code>') && !trimmed.endsWith('</code>') && !trimmed.endsWith('</pre>')) {
        return `<p>${line}</p>`;
      }

      return line;
    });

    let html = '';
    let currentListType = ''; // 'ul', 'ol', or ''

    processedLines.forEach(line => {
      if (!line) return;

      const isUnordered = line.startsWith('<li class="ul-item">');
      const isOrdered = line.startsWith('<li class="ol-item">');

      if (isUnordered) {
        if (currentListType !== 'ul') {
          if (currentListType) html += `</${currentListType}>`;
          html += '<ul>';
          currentListType = 'ul';
        }
        const content = line.substring(20, line.length - 5);
        html += `<li>${content}</li>`;
      } else if (isOrdered) {
        if (currentListType !== 'ol') {
          if (currentListType) html += `</${currentListType}>`;
          html += '<ol>';
          currentListType = 'ol';
        }
        const content = line.substring(20, line.length - 5);
        html += `<li>${content}</li>`;
      } else {
        if (currentListType) {
          html += `</${currentListType}>`;
          currentListType = '';
        }
        html += line;
      }
    });

    if (currentListType) {
      html += `</${currentListType}>`;
    }

    let bodyHtml = html;
    if (isCurrentMsg && currentWordIndex !== undefined && currentWordIndex !== -1) {
      bodyHtml = tokenizeAndHighlight(html, currentWordIndex);
    }

    // Prepend the thought bubble if it was generated
    const combinedHtml = thoughtHtml + bodyHtml;

    return <div dangerouslySetInnerHTML={{ __html: combinedHtml }} className="markdown-body" />;
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
          ref={messageContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            position: 'relative',
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
                {msg.sender === 'user' ? msg.text : renderMarkdown(msg.text, isMessagePlaying(msg.text))}
                
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
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  marginTop: '2px'
                }}
              >
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  {msg.sender === 'user' ? 'You' : 'Gemini'}
                </span>
                
                {onSpeakText && (
                  <button
                    onClick={() => {
                      const cleanMsg = msg.text.replace(/:::thought\n([\s\S]*?)\n:::\n\n?/, '').trim();
                      console.log("Sidebar Speaker Button clicked: calling onSpeakText with: ", cleanMsg);
                      onSpeakText(cleanMsg, null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                    }}
                    className="hover-scale"
                    title="Read aloud"
                  >
                    <Volume2 size={12} />
                  </button>
                )}
              </div>
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
          {toolbarCoords && selectedText && (
            <div
              className="glass-panel animate-scale-up"
              style={{
                position: 'absolute',
                top: `${toolbarCoords.top}px`,
                left: `${toolbarCoords.left}px`,
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px 6px',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                zIndex: 1000,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                pointerEvents: 'auto',
                gap: '4px',
              }}
            >
              {/* Read button */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  console.log("Sidebar Read Aloud click: calling onSpeakText with selectedText = '" + selectedText + "'");
                  if (onSpeakText && selectedText) {
                    onSpeakText(selectedText, null);
                  }
                  window.getSelection()?.removeAllRanges();
                  setToolbarCoords(null);
                  setSelectedText('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                className="hover-scale"
                title="Read aloud"
              >
                <Play size={11} style={{ color: 'var(--accent)' }} />
                <span>Read</span>
              </button>
              
              <div style={{ width: '1px', height: '14px', background: 'var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />

              {/* Explain button */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  handleSend(`Explain this part: "${selectedText}"`);
                  window.getSelection()?.removeAllRanges();
                  setToolbarCoords(null);
                  setSelectedText('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                className="hover-scale"
                title="Explain"
              >
                <Sparkles size={11} style={{ color: '#a855f7' }} />
                <span>Explain</span>
              </button>

              <div style={{ width: '1px', height: '14px', background: 'var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />

              {/* Ask button */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setInputText(`Regarding "${selectedText}": `);
                  window.getSelection()?.removeAllRanges();
                  setToolbarCoords(null);
                  setSelectedText('');
                  setTimeout(() => {
                    const inputEl = document.querySelector('input[placeholder="Ask AI about this document..."]') as HTMLInputElement;
                    if (inputEl) inputEl.focus();
                  }, 50);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                className="hover-scale"
                title="Ask about this"
              >
                <MessageSquare size={11} style={{ color: '#3b82f6' }} />
                <span>Ask</span>
              </button>

              <div style={{ width: '1px', height: '14px', background: 'var(--border)', alignSelf: 'stretch', margin: '0 2px' }} />

              {/* Copy button */}
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  navigator.clipboard.writeText(selectedText);
                  window.getSelection()?.removeAllRanges();
                  setToolbarCoords(null);
                  setSelectedText('');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                className="hover-scale"
                title="Copy selection"
              >
                <Copy size={11} style={{ color: '#10b981' }} />
                <span>Copy</span>
              </button>
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
        .markdown-body {
          line-height: 1.6;
          color: var(--text-primary);
          font-size: 0.875rem;
        }
        .markdown-body p {
          margin: 6px 0 10px 0;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          color: var(--text-primary);
          font-weight: 600;
          margin: 14px 0 6px 0;
        }
        .markdown-body h1 { font-size: 1.2rem; }
        .markdown-body h2 { font-size: 1.05rem; }
        .markdown-body h3 { font-size: 0.95rem; }
        .markdown-body ul, .markdown-body ol {
          margin: 6px 0 10px 0;
          padding-left: 20px;
        }
        .markdown-body li {
          margin-bottom: 4px;
          list-style-type: disc;
        }
        .markdown-body li li {
          list-style-type: circle;
        }
        .markdown-body strong {
          color: var(--accent);
          font-weight: 600;
        }
        .markdown-body em {
          font-style: italic;
          color: var(--text-secondary);
        }
        .markdown-body hr {
          border: 0;
          border-top: 1px solid var(--border);
          margin: 14px 0;
        }
        .markdown-body blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 12px;
          color: var(--text-secondary);
          font-style: italic;
          margin: 6px 0 10px 0;
        }
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
