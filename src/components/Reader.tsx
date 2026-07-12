import React, { useState, useEffect, useRef } from 'react';
import { Play, Sparkles, MessageSquare, ZoomIn, ZoomOut, Eye, BookOpen, Highlighter, Trash2, Copy } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import { renderAsync as renderDocxVisual } from 'docx-preview';
import { PdfPage } from './PdfPage';
import type { Highlight, Flashcard } from '../App';

const cleanDocText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\u00ad/g, '') // Remove soft hyphens to join words
    // Convert newlines, vertical tabs (000B), form feeds (000C), carriage returns, and ASCII file/group/record/unit separators (001C-001F) to standard newlines
    .replace(/[\u000a-\u000d\u001c-\u001f\u2028\u2029]/g, '\n')
    // Replace any remaining non-printable C0/C1 control characters with space
    .replace(/[\u0000-\u0009\u000e-\u001b\u007f-\u009f]/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ') // Collapse horizontal spacing (spaces, tabs)
    .replace(/\n\s*\n+/g, '\n\n') // Max 2 consecutive line breaks
    .trim();
};

interface Section {
  id: number;
  text: string;
}

interface ReaderProps {
  fileType: 'pdf' | 'docx' | 'pptx' | null;
  documentData: any; // HTML string for DOCX, { pages: Section[] } for PDF, { slides: Section[] } for PPTX
  file?: File; // Raw PDF/DOCX/PPTX file for visual rendering
  currentWordIndex: number;
  activeSectionId: number | null;
  isPlaying: boolean;
  onSpeakText: (text: string, sectionId: number | null) => void;
  onAiAction: (actionType: 'explain' | 'summarize' | 'chat', text: string) => void;
  documentHighlights: Highlight[];
  onSaveHighlights: (highlights: Highlight[]) => void;
  
  // Left side view state properties
  viewMode: 'document' | 'cards' | 'highlights';
  onViewModeChange: (mode: 'document' | 'cards' | 'highlights') => void;
  flashcards: Flashcard[];
  currentCardIndex: number;
  isCardFlipped: boolean;
  masteredCount: number;
  onCardStateChange: (updates: { currentCardIndex?: number; isCardFlipped?: boolean; masteredCount?: number }) => void;
  onDeleteHighlight: (id: string) => void;
}

// Helper to verify that f is a real File or Blob
const isRealFile = (f: any): f is File => {
  return f instanceof File || f instanceof Blob;
};

// Custom components to embed DOCX and PPTX visuals
const DocxVisual: React.FC<{ file: File }> = ({ file }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && file) {
      renderDocxVisual(file, containerRef.current).catch(err => {
        console.error('docx-preview rendering error:', err);
      });
    }
  }, [file]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', overflowY: 'auto' }} />;
};

const PptxVisual: React.FC<{ file: File }> = ({ file }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && file) {
      // Basic fallback PPTX list using slide structures
      const reader = new FileReader();
      reader.onload = () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<div style="padding: 24px; color: var(--text-secondary); text-align: center;">PPTX Document loaded: ${file.name}</div>`;
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [file]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

export const Reader: React.FC<ReaderProps> = ({
  fileType,
  documentData,
  file,
  currentWordIndex,
  activeSectionId,
  isPlaying,
  onSpeakText,
  onAiAction,
  documentHighlights,
  onSaveHighlights,
  viewMode,
  onViewModeChange,
  flashcards,
  currentCardIndex,
  isCardFlipped,
  masteredCount,
  onCardStateChange,
  onDeleteHighlight,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<number>(1);
  const [toolbarCoords, setToolbarCoords] = useState<{ top: number; left: number } | null>(null);
  const [fontSize, setFontSize] = useState<number>(18); // Default 18px

  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pdfScale, setPdfScale] = useState<number>(1.2);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Set up PDF.js worker
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  }, []);

  // Load PDF document visually if pdf file is available
  useEffect(() => {
    if (fileType === 'pdf' && file && isRealFile(file)) {
      setIsPdfLoading(true);
      const fileReader = new FileReader();
      
      fileReader.onload = async (e) => {
        const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
        try {
          const loadingTask = pdfjs.getDocument({ data: typedarray });
          const pdf = await loadingTask.promise;
          setPdfDoc(pdf);
        } catch (err) {
          console.error('Error parsing visual PDF:', err);
        } finally {
          setIsPdfLoading(false);
        }
      };
      
      fileReader.readAsArrayBuffer(file);
    } else {
      setPdfDoc(null);
    }
  }, [file, fileType]);

  // Listen for selection completion events inside the document reader
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setToolbarCoords(null);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        let parentEl = selection.anchorNode?.parentElement;
        let sectionId = 1;
        while (parentEl) {
          if (parentEl.id && parentEl.id.startsWith('section-')) {
            sectionId = parseInt(parentEl.id.replace('section-', ''));
            break;
          }
          parentEl = parentEl.parentElement;
        }
        
        if (containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          
          setToolbarCoords({
            top: rect.top - containerRect.top + containerRef.current.scrollTop - 48,
            left: rect.left - containerRect.left + rect.width / 2,
          });
          setSelectedText(text);
          setSelectedSectionId(sectionId);
        }
      } catch (err) {
        console.error('Error calculating selection coords:', err);
      }
    };

    // Trigger floating menu only after mouse selection is complete (prevents popup jumping while dragging)
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    document.addEventListener('keyup', handleSelection);

    // Dismiss floating toolbar instantly if selection is cleared (collapsed)
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

  // Auto-scroll the active spoken word in the main document reader view
  useEffect(() => {
    if (isPlaying && activeSectionId !== null && currentWordIndex !== -1) {
      const activeSpan = containerRef.current?.querySelector('.speaking-highlight');
      if (activeSpan) {
        activeSpan.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }, [currentWordIndex, activeSectionId, isPlaying]);

  const handleZoom = (type: 'in' | 'out') => {
    if (fileType === 'pdf') {
      setPdfScale(prev => {
        if (type === 'in') return Math.min(prev + 0.15, 2.5);
        return Math.max(prev - 0.15, 0.6);
      });
    } else {
      setFontSize(prev => {
        if (type === 'in') return Math.min(prev + 2, 28);
        return Math.max(prev - 2, 14);
      });
    }
  };

  const speakSection = (section: Section) => {
    onSpeakText(section.text, section.id);
  };

  const applyHighlight = (color: 'yellow' | 'blue' | 'purple', note?: string) => {
    if (!selectedText) return;

    const cleanedText = cleanDocText(selectedText);

    const newHighlight: Highlight = {
      id: `${Date.now()}`,
      text: cleanedText,
      color,
      note,
      sectionId: selectedSectionId,
    };

    const updated = [...documentHighlights, newHighlight];
    onSaveHighlights(updated);

    window.getSelection()?.removeAllRanges();
  };

  const renderInteractiveText = (section: Section, isSectionActive: boolean) => {
    const words = section.text.split(/\s+/);
    const sectionHighlights = documentHighlights.filter(h => h.sectionId === section.id);
    const wordHighlightColors = new Array(words.length).fill(null);

    sectionHighlights.forEach(highlight => {
      const hlWords = highlight.text.trim().split(/\s+/);
      if (hlWords.length === 0) return;

      for (let i = 0; i <= words.length - hlWords.length; i++) {
        let match = true;
        for (let j = 0; j < hlWords.length; j++) {
          const wordA = words[i + j].toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "");
          const wordB = hlWords[j].toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "");
          if (wordA !== wordB) {
            match = false;
            break;
          }
        }
        if (match) {
          for (let j = 0; j < hlWords.length; j++) {
            wordHighlightColors[i + j] = highlight.color;
          }
        }
      }
    });

    return (
      <p style={{ margin: 0 }}>
        {words.map((word, index) => {
          const isHighlighted = isSectionActive && isPlaying && currentWordIndex === index;
          const hlColor = wordHighlightColors[index];
          
          let backgroundColor = 'transparent';
          if (isHighlighted) {
            backgroundColor = 'var(--accent-soft)';
          } else if (hlColor === 'yellow') {
            backgroundColor = 'rgba(251, 191, 36, 0.45)';
          } else if (hlColor === 'blue') {
            backgroundColor = 'rgba(59, 130, 246, 0.45)';
          } else if (hlColor === 'purple') {
            backgroundColor = 'rgba(168, 85, 247, 0.45)';
          }

          return (
            <span
              key={index}
              className={isHighlighted ? 'speaking-highlight' : ''}
              style={{
                transition: 'background-color 0.15s ease',
                display: 'inline-block',
                marginRight: '0.28em',
                backgroundColor,
                borderRadius: '2px',
                padding: '0 1px',
              }}
            >
              {word}
            </span>
          );
        })}
      </p>
    );
  };

  if (!fileType || !documentData) return null;

  const sections: Section[] = 
    fileType === 'pdf' ? documentData.pages : 
    fileType === 'pptx' ? documentData.slides : [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Tab Switcher controls header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {viewMode === 'cards' ? 'Study Mode' :
             viewMode === 'highlights' ? 'Saved Notes' :
             fileType === 'pdf' ? `${sections.length} Pages` : 
             fileType === 'pptx' ? `${sections.length} Slides` : 
             'Document View'}
          </span>

          {/* Upgraded Left Tab Switcher */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => onViewModeChange('document')}
              style={{
                background: viewMode === 'document' ? 'var(--accent-soft)' : 'transparent',
                border: 'none',
                padding: '6px 10px',
                color: viewMode === 'document' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                transition: 'all var(--transition-fast)',
              }}
              className="hover-scale"
            >
              <Eye size={13} />
              Document
            </button>
            <button
              onClick={() => onViewModeChange('cards')}
              style={{
                background: viewMode === 'cards' ? 'var(--accent-soft)' : 'transparent',
                border: 'none',
                padding: '6px 10px',
                color: viewMode === 'cards' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                transition: 'all var(--transition-fast)',
              }}
              className="hover-scale"
            >
              <BookOpen size={13} />
              Cards {flashcards.length > 0 && `(${flashcards.length})`}
            </button>
            <button
              onClick={() => onViewModeChange('highlights')}
              style={{
                background: viewMode === 'highlights' ? 'var(--accent-soft)' : 'transparent',
                border: 'none',
                padding: '6px 10px',
                color: viewMode === 'highlights' ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                transition: 'all var(--transition-fast)',
              }}
              className="hover-scale"
            >
              <Highlighter size={13} />
              Highlights {documentHighlights.length > 0 && `(${documentHighlights.length})`}
            </button>
          </div>
        </div>

        {/* Toolbar adjustment controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {viewMode === 'document' && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <button
                onClick={() => handleZoom('out')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <ZoomOut size={14} />
              </button>
              <div style={{ alignSelf: 'center', fontSize: '0.75rem', padding: '0 4px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {fileType === 'pdf' && file && isRealFile(file) ? `${Math.round(pdfScale * 100)}%` : `${fontSize}px`}
              </div>
              <button
                onClick={() => handleZoom('in')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                <ZoomIn size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main scrolling reader container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          position: 'relative',
          display: 'flex',
          backgroundColor: fileType === 'pdf' && file && isRealFile(file) && viewMode === 'document' ? 'var(--background)' : 'transparent',
        }}
      >
        {/* Floating selection helper widget */}
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
              gap: '4px',
              padding: '6px',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 1000,
            }}
          >
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSpeakText(selectedText, null);
                window.getSelection()?.removeAllRanges();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              className="hover-scale"
            >
              <Play size={12} style={{ color: 'var(--accent)' }} /> Read
            </button>
            
            <div style={{ width: '1px', background: 'var(--border)', margin: '4px 0', alignSelf: 'stretch' }} />
            
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAiAction('explain', selectedText);
                window.getSelection()?.removeAllRanges();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              className="hover-scale"
            >
              <Sparkles size={12} style={{ color: '#a855f7' }} /> Explain
            </button>
            
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onAiAction('chat', selectedText);
                window.getSelection()?.removeAllRanges();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              className="hover-scale"
            >
              <MessageSquare size={12} style={{ color: '#3b82f6' }} /> Ask
            </button>

            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                navigator.clipboard.writeText(selectedText);
                setIsCopied(true);
                setTimeout(() => {
                  setIsCopied(false);
                  window.getSelection()?.removeAllRanges();
                }, 800);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              className="hover-scale"
            >
              <Copy size={12} style={{ color: '#10b981' }} /> {isCopied ? 'Copied!' : 'Copy'}
            </button>

            <div style={{ width: '1px', background: 'var(--border)', margin: '4px 0', alignSelf: 'stretch' }} />

            {/* Colors picker */}
            <div style={{ display: 'flex', gap: '6px', padding: '0 4px', alignItems: 'center' }}>
              <button
                onClick={() => applyHighlight('yellow')}
                style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fbbf24', border: 'none', cursor: 'pointer' }}
                title="Yellow Highlight"
                className="hover-scale"
              />
              <button
                onClick={() => applyHighlight('blue')}
                style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#3b82f6', border: 'none', cursor: 'pointer' }}
                title="Blue Highlight"
                className="hover-scale"
              />
              <button
                onClick={() => applyHighlight('purple')}
                style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#a855f7', border: 'none', cursor: 'pointer' }}
                title="Purple Highlight"
                className="hover-scale"
              />
            </div>

            <div style={{ width: '1px', background: 'var(--border)', margin: '4px 0', alignSelf: 'stretch' }} />

            <button
              onClick={() => {
                const note = prompt('Enter a margin note for this highlight:');
                if (note !== null) {
                  applyHighlight('yellow', note);
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              className="hover-scale"
            >
              Note
            </button>
          </div>
        )}

        {/* Left Navigator Pane (for slides or pages) */}
        {sections.length > 1 && viewMode === 'document' && !(file && isRealFile(file)) && (
          <div
            style={{
              width: '120px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '16px',
              borderRight: '1px solid var(--border)',
              marginRight: '24px',
              flexShrink: 0,
            }}
          >
            <p style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              {fileType === 'pdf' ? 'Pages' : 'Slides'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', maxHeight: '75vh' }}>
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => {
                    const el = document.getElementById(`section-${sec.id}`);
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  style={{
                    padding: '6px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: activeSectionId === sec.id ? 'var(--accent-soft)' : 'var(--surface)',
                    color: activeSectionId === sec.id ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {fileType === 'pdf' ? `Page ${sec.id}` : `Slide ${sec.id}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content Viewport */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: `${fontSize}px`,
          }}
        >
          <div style={{ maxWidth: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            
            {/* Cards Study view */}
            {viewMode === 'cards' && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '550px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  padding: '20px',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen size={18} style={{ color: '#3b82f6' }} /> Interactive Flashcards
                  </h3>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Mastered: {masteredCount} / {flashcards.length}
                  </span>
                </div>

                {flashcards.length === 0 ? (
                  <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                    <BookOpen size={48} />
                    <p style={{ fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                      No flashcards loaded yet.<br />
                      Ask the AI Assistant on the right to <strong>"Generate Q&A Cards"</strong> to start practicing!
                    </p>
                  </div>
                ) : currentCardIndex >= flashcards.length ? (
                  <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <Sparkles size={48} style={{ color: '#f59e0b' }} />
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>Amazing Job! 🎉</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '300px' }}>
                      You have mastered all {flashcards.length} flashcards in this deck!
                    </p>
                    <button
                      onClick={() => {
                        onCardStateChange({ currentCardIndex: 0, masteredCount: 0, isCardFlipped: false });
                      }}
                      style={{
                        background: 'var(--accent-gradient)',
                        color: 'var(--accent-contrast)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 20px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      className="hover-scale"
                    >
                      Reset and Study Again
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* 3D Flippable Card */}
                    <div
                      className={`flashcard-container ${isCardFlipped ? 'flipped' : ''}`}
                      onClick={() => onCardStateChange({ isCardFlipped: !isCardFlipped })}
                      style={{ height: '240px' }}
                    >
                      <div className="flashcard-inner">
                        <div className="flashcard-front" style={{ padding: '24px' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Question {currentCardIndex + 1} of {flashcards.length}</span>
                          <p style={{ fontSize: '1.05rem', fontWeight: 500, textAlign: 'center', margin: 0, lineHeight: '1.5' }}>
                            {flashcards[currentCardIndex].question}
                          </p>
                          <span style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 'auto', fontWeight: 500 }}>Click card to reveal answer</span>
                        </div>
                        <div className="flashcard-back" style={{ padding: '24px' }}>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Answer</span>
                          <p style={{ fontSize: '1.05rem', textAlign: 'center', margin: 0, lineHeight: '1.5' }}>
                            {flashcards[currentCardIndex].answer}
                          </p>
                          <span style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 'auto', fontWeight: 500 }}>Click to view question</span>
                        </div>
                      </div>
                    </div>

                    {/* Study Response Buttons */}
                    <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
                      <button
                        onClick={() => {
                          onCardStateChange({ isCardFlipped: false });
                          setTimeout(() => {
                            onCardStateChange({ currentCardIndex: currentCardIndex + 1 });
                          }, 200);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 'var(--radius-md)',
                          color: '#ef4444',
                          padding: '12px',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        className="hover-scale"
                      >
                        Still Learning ❌
                      </button>
                      <button
                        onClick={() => {
                          onCardStateChange({ isCardFlipped: false });
                          setTimeout(() => {
                            onCardStateChange({ 
                              currentCardIndex: currentCardIndex + 1,
                              masteredCount: masteredCount + 1 
                            });
                          }, 200);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          borderRadius: 'var(--radius-md)',
                          color: '#10b981',
                          padding: '12px',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        className="hover-scale"
                      >
                        Got it! ✅
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Highlights Review view */}
            {viewMode === 'highlights' && (
              <div
                style={{
                  width: '100%',
                  maxWidth: '850px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Highlighter size={18} style={{ color: '#a855f7' }} /> Document Highlights & Notes
                  </h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Total Saved: {documentHighlights.length}
                  </span>
                </div>

                {documentHighlights.length === 0 ? (
                  <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                    <Highlighter size={48} />
                    <p style={{ fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                      No highlights saved yet.<br />
                      Select text in the reader mode and choose a color to highlight important parts!
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', width: '100%' }}>
                    {documentHighlights.map((hl) => (
                      <div
                        key={hl.id}
                        onClick={() => {
                          onViewModeChange('document');
                          setTimeout(() => {
                            const targetEl = document.getElementById(`section-${hl.sectionId}`);
                            if (targetEl && containerRef.current) {
                              const containerRect = containerRef.current.getBoundingClientRect();
                              const targetRect = targetEl.getBoundingClientRect();
                              containerRef.current.scrollTo({
                                top: targetRect.top - containerRect.top + containerRef.current.scrollTop - 20,
                                behavior: 'smooth'
                              });
                            }
                          }, 100);
                        }}
                        className="glass-panel hover-scale"
                        style={{
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          borderLeft: `4px solid ${
                            hl.color === 'yellow' ? '#fbbf24' :
                            hl.color === 'blue' ? '#3b82f6' : '#a855f7'
                          }`,
                          background: 'var(--surface)',
                        }}
                      >
                        <div 
                          style={{ 
                            fontSize: '0.85rem', 
                            margin: 0, 
                            color: 'var(--text-primary)', 
                            lineHeight: '1.5',
                            textAlign: 'justify',
                            fontFamily: 'var(--font-sans)',
                            whiteSpace: 'pre-wrap',
                            userSelect: 'text',
                          }}
                        >
                          {cleanDocText(hl.text)}
                        </div>
                        
                        {hl.note && (
                          <div style={{ fontSize: '0.8rem', padding: '8px 10px', background: 'var(--background)', borderRadius: '4px', borderLeft: '2px solid var(--text-muted)' }}>
                            <strong>Note:</strong> {hl.note}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '8px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Page / Section {hl.sectionId}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteHighlight(hl.id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            className="hover-scale"
                          >
                            <Trash2 size={14} className="hover-red" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Standard document contents */}
            {viewMode === 'document' && (
              <>
                {/* 1. PDF Renderer */}
                {fileType === 'pdf' && (
                  file && isRealFile(file) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
                      {isPdfLoading && (
                        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                          Loading PDF high-fidelity view...
                        </div>
                      )}
                      {Array.from({ length: pdfDoc?.numPages || 0 }, (_, idx) => {
                        const pageNum = idx + 1;
                        const isSectionActive = activeSectionId === pageNum;
                        const pageTextData = sections.find(s => s.id === pageNum);
                        
                        return (
                          <div
                            key={pageNum}
                            id={`section-${pageNum}`}
                            className="glass-panel"
                            style={{
                              padding: '16px',
                              borderRadius: 'var(--radius-md)',
                              border: isSectionActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                              boxShadow: isSectionActive ? '0 0 16px rgba(99, 102, 241, 0.15)' : 'var(--shadow-sm)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px',
                              alignItems: 'center',
                            }}
                          >
                            <div
                              style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                borderBottom: '1px solid var(--border)',
                                paddingBottom: '6px',
                                marginBottom: '4px',
                              }}
                            >
                              <span>Page {pageNum}</span>
                              {pageTextData && (
                                <button
                                  onClick={() => speakSection(pageTextData)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: isSectionActive && isPlaying ? 'var(--accent)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  className="hover-scale"
                                >
                                  <Play size={12} /> Read Page
                                </button>
                              )}
                            </div>
                            {pdfDoc && (
                              <PdfPage 
                                pdfDoc={pdfDoc} 
                                pageNumber={pageNum} 
                                scale={pdfScale} 
                                isActive={isSectionActive} 
                                highlights={documentHighlights.filter(h => h.sectionId === pageNum)}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Reader View Fallback if no raw visual file is loaded
                    <div style={{ maxWidth: 'var(--reader-width)', width: '100%' }}>
                      {sections.map((sec) => {
                        const isSectionActive = activeSectionId === sec.id;
                        return (
                          <div
                            key={sec.id}
                            id={`section-${sec.id}`}
                            className="glass-panel"
                            style={{
                              marginBottom: '24px',
                              padding: '24px',
                              borderRadius: 'var(--radius-md)',
                              border: isSectionActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                              boxShadow: isSectionActive ? '0 0 16px rgba(99, 102, 241, 0.15)' : 'var(--shadow-sm)',
                              position: 'relative',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Page {sec.id}</span>
                              <button onClick={() => speakSection(sec)} style={{ background: 'transparent', border: 'none', color: isSectionActive && isPlaying ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }} className="hover-scale">
                                <Play size={12} /> Read Page
                              </button>
                            </div>
                            <div style={{ lineHeight: '1.7', textAlign: 'justify', color: 'var(--text-primary)' }}>
                              {renderInteractiveText(sec, isSectionActive)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* 2. DOCX Word Renderer */}
                {fileType === 'docx' && (
                  file && isRealFile(file) ? (
                    <DocxVisual file={file} />
                  ) : (
                    <div 
                      className="reader-content animate-fade-in"
                      dangerouslySetInnerHTML={{ __html: documentData }}
                      style={{ fontSize: `${fontSize}px` }}
                    />
                  )
                )}

                {/* 3. PPTX Slides Renderer */}
                {fileType === 'pptx' && (
                  file && isRealFile(file) ? (
                    <PptxVisual file={file} />
                  ) : (
                    <div style={{ maxWidth: 'var(--reader-width)', width: '100%' }}>
                      {sections.map((sec) => {
                        const isSectionActive = activeSectionId === sec.id;
                        return (
                          <div
                            key={sec.id}
                            id={`section-${sec.id}`}
                            className="glass-panel"
                            style={{
                              marginBottom: '24px',
                              padding: '24px',
                              borderRadius: 'var(--radius-md)',
                              border: isSectionActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                              boxShadow: isSectionActive ? '0 0 16px rgba(99, 102, 241, 0.15)' : 'var(--shadow-sm)',
                              position: 'relative',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Slide {sec.id}</span>
                              <button onClick={() => speakSection(sec)} style={{ background: 'transparent', border: 'none', color: isSectionActive && isPlaying ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }} className="hover-scale">
                                <Play size={12} /> Read Slide
                              </button>
                            </div>
                            <div style={{ lineHeight: '1.7', textAlign: 'justify', color: 'var(--text-primary)' }}>
                              {renderInteractiveText(sec, isSectionActive)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
};
