import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, FileText, Presentation, File, Trash2, Sun, Moon, ArrowLeft, Heart, MoonStar } from 'lucide-react';
import { Uploader } from './components/Uploader';
import { Reader } from './components/Reader';
import { TTSPlayer } from './components/TTSPlayer';
import { Sidebar } from './components/Sidebar';
import { parsePdf, parseDocx, parsePptx } from './utils/parsers';

interface DocumentSection {
  id: number;
  text: string;
}

interface RecentDocument {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'pptx';
  data: any; // HTML string or { pages/slides: DocumentSection[] }
  timestamp: number;
}

export default function App() {
  const [activeDoc, setActiveDoc] = useState<RecentDocument | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');

  // TTS Synchronization State
  const [textToSpeak, setTextToSpeak] = useState<string>('');
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [sidebarTriggerText, setSidebarTriggerText] = useState<string>(''); // For floating toolbar AI triggers

  // Load theme, API key, and recent docs on mount
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem('readit-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // API Key
    const savedKey = localStorage.getItem('readit-gemini-key') || '';
    setApiKey(savedKey);

    // Recent Docs
    const savedDocs = localStorage.getItem('readit-recent-docs');
    if (savedDocs) {
      try {
        setRecentDocs(JSON.parse(savedDocs));
      } catch (e) {
        console.error('Error parsing recent documents:', e);
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('readit-theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const handleApiKeyChange = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem('readit-gemini-key', newKey);
  };

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    try {
      let parsedData: any = null;
      let type: 'pdf' | 'docx' | 'pptx' | null = null;

      if (ext === 'pdf') {
        parsedData = await parsePdf(file);
        type = 'pdf';
      } else if (ext === 'docx') {
        parsedData = await parseDocx(file);
        type = 'docx';
      } else if (ext === 'pptx') {
        parsedData = await parsePptx(file);
        type = 'pptx';
      }

      if (parsedData && type) {
        const newDoc: RecentDocument = {
          id: `${Date.now()}`,
          name: file.name,
          type,
          data: parsedData,
          timestamp: Date.now(),
        };

        setActiveDoc(newDoc);
        
        // Add to history
        const updatedRecent = [
          newDoc,
          ...recentDocs.filter(d => d.name !== file.name)
        ].slice(0, 5); // Cache top 5 docs

        setRecentDocs(updatedRecent);
        
        // Try saving, handle storage limit gracefully
        try {
          localStorage.setItem('readit-recent-docs', JSON.stringify(updatedRecent));
        } catch (storageErr) {
          // If quota exceeded, save just the latest metadata (without full document contents)
          console.warn('LocalStorage limit exceeded, saving list metadata only.');
          const metadataDocs = updatedRecent.map(d => ({ ...d, data: d.type === 'docx' ? '[HTML]' : { pages: [], slides: [] } }));
          localStorage.setItem('readit-recent-docs', JSON.stringify(metadataDocs));
        }
      }
    } catch (error) {
      console.error('File parsing error:', error);
      alert('Error parsing document file. Make sure it is not password protected or corrupted.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecentDoc = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = recentDocs.filter(d => d.id !== id);
    setRecentDocs(updated);
    localStorage.setItem('readit-recent-docs', JSON.stringify(updated));
    if (activeDoc?.id === id) {
      setActiveDoc(null);
      handleStopSpeak();
    }
  };

  // TTS Event Handlers
  const handleSpeakText = useCallback((text: string, sectionId: number | null) => {
    setTextToSpeak(text);
    setActiveSectionId(sectionId);
    setCurrentWordIndex(-1);
  }, []);

  const handleWordBoundary = useCallback((_charIndex: number, wordIndex: number) => {
    setCurrentWordIndex(wordIndex);
  }, []);

  const handleStopSpeak = useCallback(() => {
    setTextToSpeak('');
    setCurrentWordIndex(-1);
    setActiveSectionId(null);
    setIsPlaying(false);
  }, []);

  // Floating toolbar actions to sidebar bridge
  const handleAiAction = (actionType: 'explain' | 'summarize' | 'chat', text: string) => {
    setIsSidebarOpen(true);
    let prompt = '';
    if (actionType === 'explain') {
      prompt = `Explain the following term/sentence in simple, clear language: "${text}"`;
    } else if (actionType === 'summarize') {
      prompt = `Provide a very brief, bulleted summary of this selected text: "${text}"`;
    } else {
      prompt = `Regarding this passage: "${text}"\n\n[My question]: `;
    }
    setSidebarTriggerText(prompt);
  };

  // Build a plain text version of the active document for Gemini context
  const getDocumentPlainText = (): string => {
    if (!activeDoc) return '';
    if (activeDoc.type === 'docx') {
      // Clean HTML tags for context
      return activeDoc.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const sections: DocumentSection[] = 
      activeDoc.type === 'pdf' ? activeDoc.data.pages : activeDoc.data.slides;
    return sections.map(s => s.text).join('\n\n');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* Sleek Minimal Header */}
      <header
        className="glass-panel"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {activeDoc && (
            <button
              onClick={() => {
                setActiveDoc(null);
                handleStopSpeak();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
              className="hover-scale"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              }}
            >
              <BookOpen size={16} />
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-title)',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              read<span className="gradient-text">.it</span>
            </h1>
          </div>
        </div>

        {/* Text-to-Speech controller inline in header if document is loaded */}
        {activeDoc && textToSpeak && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', margin: '0 16px' }}>
            <TTSPlayer
              text={textToSpeak}
              onWordBoundary={handleWordBoundary}
              onEnd={handleStopSpeak}
              onPlayingStateChange={setIsPlaying}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={toggleTheme}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            className="hover-scale"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <MoonStar size={16} />}
          </button>

          {activeDoc && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{
                background: isSidebarOpen ? 'var(--accent-gradient)' : 'var(--surface)',
                border: isSidebarOpen ? 'none' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 14px',
                color: isSidebarOpen ? '#ffffff' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all var(--transition-fast)',
                boxShadow: isSidebarOpen ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none',
              }}
              className="hover-scale"
            >
              <Sparkles size={14} />
              <span>AI Assistant</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* Dashboard / Welcome Screen (if no doc loaded) */}
        {!activeDoc ? (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '4rem 2rem',
              alignItems: 'center',
              gap: '3rem',
            }}
          >
            <div style={{ textAlign: 'center', maxWidth: '500px' }} className="animate-fade-in">
              <h2
                style={{
                  fontFamily: 'var(--font-title)',
                  fontSize: '2.5rem',
                  fontWeight: 700,
                  marginBottom: '1rem',
                  lineHeight: '1.2',
                }}
              >
                A minimal reader for <br />
                <span className="gradient-text">productive minds.</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.975rem', lineHeight: '1.6' }}>
                Open documents directly in your browser. Read with audio-highlighting and discuss details with your personal Gemini AI assistant.
              </p>
            </div>

            <Uploader onFileSelect={handleFileSelect} isLoading={isLoading} />

            {/* Recent Files Panel */}
            {recentDocs.length > 0 && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '560px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
                className="animate-fade-in"
              >
                <p
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    marginBottom: '4px',
                  }}
                >
                  Recent Documents
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentDocs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setActiveDoc(doc)}
                      className="glass-panel hover-scale"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                        <div
                          style={{
                            padding: '8px',
                            borderRadius: '6px',
                            background: 
                              doc.type === 'pdf' ? 'rgba(239, 68, 68, 0.1)' : 
                              doc.type === 'docx' ? 'rgba(59, 130, 246, 0.1)' : 
                              'rgba(245, 158, 11, 0.1)',
                            color: 
                              doc.type === 'pdf' ? '#ef4444' : 
                              doc.type === 'docx' ? '#3b82f6' : 
                              '#f59e0b',
                          }}
                        >
                          {doc.type === 'pdf' ? <File size={16} /> : 
                           doc.type === 'docx' ? <FileText size={16} /> : 
                           <Presentation size={16} />}
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.name}
                        </span>
                      </div>
                      <button
                        onClick={(e) => deleteRecentDoc(e, doc.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        className="hover-scale"
                      >
                        <Trash2 size={14} className="hover-red" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <span>Made with</span> <Heart size={10} style={{ color: 'var(--accent)' }} /> <span>for elegant reading.</span>
            </div>
          </div>
        ) : (
          // Active Document Split Viewer
          <>
            <Reader
              fileType={activeDoc.type}
              documentData={activeDoc.data}
              currentWordIndex={currentWordIndex}
              activeSectionId={activeSectionId}
              isPlaying={isPlaying}
              onSpeakText={handleSpeakText}
              onAiAction={handleAiAction}
            />

            <Sidebar
              documentText={getDocumentPlainText()}
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
              apiKey={apiKey}
              onApiKeyChange={handleApiKeyChange}
            />
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .hover-red:hover {
          color: #ef4444 !important;
        }
      `}} />
    </div>
  );
}
