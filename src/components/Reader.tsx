import React, { useState, useEffect, useRef } from 'react';
import { Play, Sparkles, MessageSquare, ZoomIn, ZoomOut, Type } from 'lucide-react';

interface Section {
  id: number;
  text: string;
}

interface ReaderProps {
  fileType: 'pdf' | 'docx' | 'pptx' | null;
  documentData: any; // HTML string for DOCX, { pages: Section[] } for PDF, { slides: Section[] } for PPTX
  currentWordIndex: number;
  activeSectionId: number | null;
  isPlaying: boolean;
  onSpeakText: (text: string, sectionId: number | null) => void;
  onAiAction: (actionType: 'explain' | 'summarize' | 'chat', text: string) => void;
}

export const Reader: React.FC<ReaderProps> = ({
  fileType,
  documentData,
  currentWordIndex,
  activeSectionId,
  isPlaying,
  onSpeakText,
  onAiAction,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [toolbarCoords, setToolbarCoords] = useState<{ top: number; left: number } | null>(null);
  const [readerTheme, setReaderTheme] = useState<'sans' | 'serif'>('sans');
  const [fontSize, setFontSize] = useState<number>(18); // Default 18px

  const containerRef = useRef<HTMLDivElement>(null);

  // Listen for selection changes inside the document reader
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setToolbarCoords(null);
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      
      // Get position coordinates of the text selection
      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Find reader scroll container offset
        if (containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          
          // Position bubble above the selection center
          setToolbarCoords({
            top: rect.top - containerRect.top + containerRef.current.scrollTop - 48,
            left: rect.left - containerRect.left + rect.width / 2,
          });
          setSelectedText(text);
        }
      } catch (err) {
        console.error('Error calculating selection coords:', err);
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => {
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, []);

  const handleZoom = (type: 'in' | 'out') => {
    setFontSize(prev => {
      if (type === 'in') return Math.min(prev + 2, 28);
      return Math.max(prev - 2, 14);
    });
  };

  const speakSection = (section: Section) => {
    onSpeakText(section.text, section.id);
  };

  // Renders a page or slide, breaking it up into individual words so we can highlight spoken words in real time
  const renderInteractiveText = (section: Section, isSectionActive: boolean) => {
    const words = section.text.split(/\s+/);
    
    return (
      <p style={{ margin: 0 }}>
        {words.map((word, index) => {
          const isHighlighted = isSectionActive && isPlaying && currentWordIndex === index;
          return (
            <span
              key={index}
              className={isHighlighted ? 'speaking-highlight' : ''}
              style={{
                transition: 'background-color 0.1s ease',
                display: 'inline-block',
                marginRight: '0.28em',
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
      {/* Zoom / Font controls header */}
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
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {fileType === 'pdf' ? `${sections.length} Pages` : 
           fileType === 'pptx' ? `${sections.length} Slides` : 
           'Document View'}
        </span>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setReaderTheme(prev => prev === 'sans' ? 'serif' : 'sans')}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 10px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.8rem',
            }}
          >
            <Type size={14} />
            {readerTheme === 'sans' ? 'Sans-Serif' : 'Serif'}
          </button>
          
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
              {fontSize}px
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
        </div>
      </div>

      {/* Main scrolling reader */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          position: 'relative',
          display: 'flex',
        }}
      >
        {/* Floating toolbar helper */}
        {toolbarCoords && selectedText && (
          <div
            className="glass-panel animate-scale-up"
            style={{
              position: 'absolute',
              top: `${toolbarCoords.top}px`,
              left: `${toolbarCoords.left}px`,
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '4px',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 1000,
            }}
          >
            <button
              onClick={() => {
                onSpeakText(selectedText, null);
                // Clear selection
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
            
            <div style={{ width: '1px', background: 'var(--border)', margin: '4px 0' }} />
            
            <button
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
          </div>
        )}

        {/* Left Navigator (Side pane within viewer) */}
        {fileType !== 'docx' && sections.length > 1 && (
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

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            fontFamily: readerTheme === 'sans' ? 'var(--font-sans)' : 'Georgia, serif',
            fontSize: `${fontSize}px`,
          }}
        >
          <div style={{ maxWidth: 'var(--reader-width)', width: '100%' }}>
            
            {/* Word DOCX rendering */}
            {fileType === 'docx' && (
              <div 
                className="reader-content animate-fade-in"
                dangerouslySetInnerHTML={{ __html: documentData }}
                style={{ fontSize: `${fontSize}px` }}
              />
            )}

            {/* PDF / PPTX Slide View */}
            {fileType !== 'docx' && sections.map((sec) => {
              const isSectionActive = activeSectionId === sec.id;
              return (
                <div
                  key={sec.id}
                  id={`section-${sec.id}`}
                  className="glass-panel animate-fade-in"
                  style={{
                    marginBottom: '24px',
                    padding: '24px',
                    borderRadius: 'var(--radius-md)',
                    border: isSectionActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    boxShadow: isSectionActive ? '0 0 16px rgba(99, 102, 241, 0.15)' : 'var(--shadow-sm)',
                    position: 'relative',
                    transition: 'all var(--transition-normal)',
                  }}
                >
                  {/* Badge & Quick play button */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                      borderBottom: '1px solid var(--border)',
                      paddingBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      {fileType === 'pdf' ? `Page ${sec.id}` : `Slide ${sec.id}`}
                    </span>
                    <button
                      onClick={() => speakSection(sec)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isSectionActive && isPlaying ? 'var(--accent)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.75rem',
                      }}
                      className="hover-scale"
                    >
                      <Play size={12} /> Read Page
                    </button>
                  </div>

                  {/* Page contents */}
                  <div style={{ lineHeight: '1.7', textAlign: 'justify', color: 'var(--text-primary)' }}>
                    {renderInteractiveText(sec, isSectionActive)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
