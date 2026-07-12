import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, FileText, Presentation, File, Trash2, Sun, ArrowLeft, Heart, MoonStar, BookOpen, SkipBack, SkipForward, Pause, Play, Square } from 'lucide-react';
import { Uploader } from './components/Uploader';
import { Reader } from './components/Reader';
import { TTSPlayer } from './components/TTSPlayer';
import { Sidebar } from './components/Sidebar';
import { parsePdf, parseDocx, parsePptx } from './utils/parsers';
import { getRecentDocuments, saveDocument, deleteDocument } from './utils/db';
import { PomodoroTimer } from './components/PomodoroTimer';

interface DocumentSection {
  id: number;
  text: string;
}

export interface Highlight {
  id: string;
  text: string;
  note?: string;
  color: 'yellow' | 'blue' | 'purple';
  sectionId: number;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

interface RecentDocument {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'pptx';
  data: any; // HTML string or { pages/slides: DocumentSection[] }
  timestamp: number;
  file?: File; // Store raw File for high-fidelity rendering
  highlights?: Highlight[];
}

export default function App() {
  const [activeDoc, setActiveDoc] = useState<RecentDocument | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>('');

  // Lifted ViewMode and Flashcards states
  const [viewMode, setViewMode] = useState<'document' | 'cards' | 'highlights'>('document');
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [masteredCount, setMasteredCount] = useState(0);

  // TTS Synchronization State
  const [textToSpeak, setTextToSpeak] = useState<string>('');
  const [playTrigger, setPlayTrigger] = useState<number>(0);
  const [currentWordIndex, setCurrentWordIndex] = useState<number>(-1);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isTtsPaused, setIsTtsPaused] = useState<boolean>(false);
  const [sidebarTriggerText, setSidebarTriggerText] = useState<string>(''); // For floating toolbar AI triggers

  const subtitleContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the active highlighted word in the live subtitles caption widget
  useEffect(() => {
    if (isPlaying && textToSpeak && currentWordIndex !== -1) {
      const container = subtitleContainerRef.current;
      if (container) {
        const activeWordSpan = container.querySelector('.subtitle-highlight');
        if (activeWordSpan) {
          activeWordSpan.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }
    }
  }, [currentWordIndex, isPlaying, textToSpeak]);

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

    // Recent Docs (loaded from IndexedDB to restore File blobs)
    getRecentDocuments()
      .then((docs) => {
        setRecentDocs(docs);
      })
      .catch((e) => {
        console.error('Error loading recent documents from database:', e);
      });
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
          file,
        };

        setActiveDoc(newDoc);
        setViewMode('document');
        setFlashcards([]);
        setCurrentCardIndex(0);
        setIsCardFlipped(false);
        setMasteredCount(0);

        // Pre-populate default speech text to the first section/page
        let firstText = '';
        let firstId: number | null = null;
        if (newDoc.type === 'docx') {
          firstText = newDoc.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          firstId = 0;
        } else {
          const sections = newDoc.type === 'pdf' ? newDoc.data.pages : newDoc.data.slides;
          if (sections && sections.length > 0) {
            firstText = sections[0].text;
            firstId = sections[0].id;
          }
        }
        setTextToSpeak(firstText);
        setActiveSectionId(firstId);
        setCurrentWordIndex(-1);
        
        // Save to IndexedDB (preserves raw File blobs)
        try {
          await saveDocument(newDoc);
          const docs = await getRecentDocuments();
          
          // Limit cache history list to top 5 documents
          if (docs.length > 5) {
            for (let i = 5; i < docs.length; i++) {
              await deleteDocument(docs[i].id);
            }
            setRecentDocs(docs.slice(0, 5));
          } else {
            setRecentDocs(docs);
          }
        } catch (dbErr) {
          console.error('Failed to save document to IndexedDB:', dbErr);
          // Fallback to in-memory state update
          const updatedRecent = [
            newDoc,
            ...recentDocs.filter(d => d.name !== file.name)
          ].slice(0, 5);
          setRecentDocs(updatedRecent);
        }
      }
    } catch (error) {
      console.error('File parsing error:', error);
      alert('Error parsing document file. Make sure it is not password protected or corrupted.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteRecentDoc = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDocument(id);
      const docs = await getRecentDocuments();
      setRecentDocs(docs);
    } catch (dbErr) {
      console.error('Failed to delete document from database:', dbErr);
      const updated = recentDocs.filter(d => d.id !== id);
      setRecentDocs(updated);
    }
    if (activeDoc?.id === id) {
      setActiveDoc(null);
      handleStopSpeak();
    }
  };

  // TTS Event Handlers
  const handleSpeakText = useCallback((text: string, sectionId: number | null) => {
    console.log("App handleSpeakText: setting text = '" + text + "'");
    setTextToSpeak(text);
    setActiveSectionId(sectionId);
    setCurrentWordIndex(-1);
    setIsTtsPaused(false);
    setPlayTrigger(prev => {
      console.log("App handleSpeakText: incrementing playTrigger to ", prev + 1);
      return prev + 1;
    });
  }, []);

  const handleTtsBackward = useCallback(() => {
    if (!activeDoc || !activeSectionId) return;
    const sections = activeDoc.type === 'pdf' ? activeDoc.data.pages : activeDoc.data.slides;
    if (!sections || sections.length === 0) return;
    
    const currentIndex = sections.findIndex((s: any) => s.id === activeSectionId);
    if (currentIndex > 0) {
      const prevSection = sections[currentIndex - 1];
      handleSpeakText(prevSection.text, prevSection.id);
      
      // Auto-scroll PDF page into view in the document list if visual PDF is loaded
      setTimeout(() => {
        document.getElementById(`section-${prevSection.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [activeDoc, activeSectionId, handleSpeakText]);

  const handleTtsForward = useCallback(() => {
    if (!activeDoc || !activeSectionId) return;
    const sections = activeDoc.type === 'pdf' ? activeDoc.data.pages : activeDoc.data.slides;
    if (!sections || sections.length === 0) return;
    
    const currentIndex = sections.findIndex((s: any) => s.id === activeSectionId);
    if (currentIndex !== -1 && currentIndex < sections.length - 1) {
      const nextSection = sections[currentIndex + 1];
      handleSpeakText(nextSection.text, nextSection.id);
      
      // Auto-scroll PDF page into view in the document list if visual PDF is loaded
      setTimeout(() => {
        document.getElementById(`section-${nextSection.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }, [activeDoc, activeSectionId, handleSpeakText]);

  const handleWordBoundary = useCallback((_charIndex: number, wordIndex: number) => {
    setCurrentWordIndex(wordIndex);
  }, []);

  const handleStopSpeak = useCallback(() => {
    setCurrentWordIndex(-1);
    setActiveSectionId(null);
    setIsPlaying(false);
    setIsTtsPaused(false);
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
  };  // Highlights Persistence & Navigation Handlers
  const handleSaveHighlights = async (highlights: Highlight[]) => {
    if (!activeDoc) return;
    const updatedDoc = {
      ...activeDoc,
      highlights,
    };
    setActiveDoc(updatedDoc);
    try {
      await saveDocument(updatedDoc);
      setRecentDocs(recentDocs.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    } catch (e) {
      console.error('Error saving highlights:', e);
    }
  };



  const handleDeleteHighlight = async (id: string) => {
    if (!activeDoc) return;
    const highlights = (activeDoc.highlights || []).filter(h => h.id !== id);
    const updatedDoc = {
      ...activeDoc,
      highlights,
    };
    setActiveDoc(updatedDoc);
    try {
      await saveDocument(updatedDoc);
      setRecentDocs(recentDocs.map(d => d.id === updatedDoc.id ? updatedDoc : d));
    } catch (e) {
      console.error('Error deleting highlight:', e);
    }
  };

  const handleSelectRecentDoc = (doc: RecentDocument) => {
    setActiveDoc(doc);
    setViewMode('document');
    setFlashcards([]);
    setCurrentCardIndex(0);
    setIsCardFlipped(false);
    setMasteredCount(0);

    // Pre-populate default speech text to the first section/page
    let firstText = '';
    let firstId: number | null = null;
    if (doc.type === 'docx') {
      firstText = doc.data.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      firstId = 0;
    } else {
      const sections = doc.type === 'pdf' ? doc.data.pages : doc.data.slides;
      if (sections && sections.length > 0) {
        firstText = sections[0].text;
        firstId = sections[0].id;
      }
    }
    setTextToSpeak(firstText);
    setActiveSectionId(firstId);
    setCurrentWordIndex(-1);
  };

  const handleCardStateChange = (updates: { currentCardIndex?: number; isCardFlipped?: boolean; masteredCount?: number }) => {
    if (updates.currentCardIndex !== undefined) setCurrentCardIndex(updates.currentCardIndex);
    if (updates.isCardFlipped !== undefined) setIsCardFlipped(updates.isCardFlipped);
    if (updates.masteredCount !== undefined) setMasteredCount(updates.masteredCount);
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
                color: 'var(--accent-contrast)',
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
        {activeDoc && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', margin: '0 16px' }}>
            <TTSPlayer
              text={textToSpeak}
              onWordBoundary={handleWordBoundary}
              onEnd={handleStopSpeak}
              onPlayingStateChange={setIsPlaying}
              onBackward={handleTtsBackward}
              onForward={handleTtsForward}
              playTrigger={playTrigger}
              isPausedProp={isTtsPaused}
              onPausedChange={setIsTtsPaused}
            />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <PomodoroTimer />
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
                color: isSidebarOpen ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all var(--transition-fast)',
                boxShadow: isSidebarOpen ? 'var(--shadow-sunken-sm)' : 'var(--shadow-raised-sm)',
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
                      onClick={() => handleSelectRecentDoc(doc)}
                      className="glass-panel hover-scale"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        boxShadow: 'var(--shadow-raised-sm)',
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
              file={activeDoc.file}
              currentWordIndex={currentWordIndex}
              activeSectionId={activeSectionId}
              isPlaying={isPlaying}
              onSpeakText={handleSpeakText}
              onAiAction={handleAiAction}
              documentHighlights={activeDoc.highlights || []}
              onSaveHighlights={handleSaveHighlights}
              
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              flashcards={flashcards}
              currentCardIndex={currentCardIndex}
              isCardFlipped={isCardFlipped}
              masteredCount={masteredCount}
              onCardStateChange={handleCardStateChange}
              onDeleteHighlight={handleDeleteHighlight}
            />

            <Sidebar
              documentText={getDocumentPlainText()}
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
              apiKey={apiKey}
              onApiKeyChange={handleApiKeyChange}
              triggerPrompt={sidebarTriggerText}
              onLoadFlashcards={(cards) => {
                setFlashcards(cards);
                setCurrentCardIndex(0);
                setIsCardFlipped(false);
                setMasteredCount(0);
                setViewMode('cards');
              }}
              onSpeakText={handleSpeakText}
              currentWordIndex={currentWordIndex}
              textToSpeak={textToSpeak}
              isPlaying={isPlaying}
            />

            {/* Floating Live Subtitles Caption Overlay Bar */}
            {isPlaying && textToSpeak && (
              <div
                className="glass-panel animate-fade-in"
                style={{
                  position: 'fixed',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: '700px',
                  padding: '16px 24px',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 10px 20px -10px rgba(0, 0, 0, 0.4)',
                  zIndex: 2000,
                  background: 'rgba(15, 23, 42, 0.88)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.3s ease',
                  pointerEvents: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isTtsPaused ? '#f59e0b' : 'var(--accent)', animation: isTtsPaused ? 'none' : 'pulse 1.5s infinite ease-in-out' }} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {isTtsPaused ? 'Speech Paused' : 'Currently Reading'} • Page {activeSectionId || 1}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      onClick={handleTtsBackward}
                      style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', transition: 'all 0.2s' }}
                      className="hover-scale"
                      title="Previous page"
                    >
                      <SkipBack size={12} />
                    </button>
                    
                    <button
                      onClick={() => setIsTtsPaused(!isTtsPaused)}
                      style={{ background: 'var(--accent-gradient)', border: 'none', color: 'var(--accent-contrast)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', transition: 'all 0.2s' }}
                      className="hover-scale"
                      title={isTtsPaused ? "Resume" : "Pause"}
                    >
                      {isTtsPaused ? <Play size={14} style={{ marginLeft: '1px' }} /> : <Pause size={14} />}
                    </button>

                    <button
                      onClick={handleTtsForward}
                      style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', transition: 'all 0.2s' }}
                      className="hover-scale"
                      title="Next page"
                    >
                      <SkipForward size={12} />
                    </button>
                    
                    <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

                    <button
                      onClick={handleStopSpeak}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '50%', transition: 'all 0.2s' }}
                      className="hover-scale"
                      title="Stop reading"
                    >
                      <Square size={10} fill="#ef4444" style={{ border: 'none' }} />
                    </button>
                  </div>
                </div>
                
                <div
                  ref={subtitleContainerRef}
                  style={{
                    fontSize: '1rem',
                    lineHeight: '1.65',
                    color: '#e2e8f0',
                    maxHeight: '110px',
                    overflowY: 'auto',
                    textAlign: 'justify',
                    fontFamily: 'var(--font-sans)',
                    padding: '2px 4px',
                  }}
                >
                  {(() => {
                    const words = textToSpeak.split(/\s+/);
                    return words.map((word, idx) => {
                      const isCurrent = currentWordIndex === idx;
                      const cleaned = word.replace(/\*\*|#|--|\*|_/g, '');
                      if (!cleaned.trim()) return null;
                      return (
                        <span
                          key={idx}
                          className={isCurrent ? 'subtitle-highlight' : ''}
                          style={{
                            marginRight: '0.28em',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            backgroundColor: isCurrent ? 'var(--accent)' : 'transparent',
                            color: isCurrent ? 'var(--accent-contrast)' : 'inherit',
                            fontWeight: isCurrent ? 700 : 400,
                            transition: 'all 0.1s ease',
                            display: 'inline-block',
                          }}
                        >
                          {cleaned}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
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
