import React, { useEffect, useRef } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import type { Highlight } from '../App';

interface PdfPageProps {
  pdfDoc: pdfjs.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  isActive: boolean;
  highlights?: Highlight[];
}

export const PdfPage: React.FC<PdfPageProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  isActive,
  highlights = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (!active) return;

        const viewport = page.getViewport({ scale });
        
        // Render Canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Cancel any ongoing rendering tasks
            if (renderTaskRef.current) {
              renderTaskRef.current.cancel();
            }

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            
            renderTaskRef.current = page.render(renderContext);
            await renderTaskRef.current.promise;
          }
        }

        // Render Text Layer
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;

          const textContent = await page.getTextContent();
          if (!active) return;

          const textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
          });

          await textLayer.render();
          
          // Apply highlights color overlays to rendered textLayer span divs using sequential character offset mapping
          if (highlights.length > 0) {
            const spans = Array.from(textLayerDiv.querySelectorAll('span'));
            
            // 1. Build text sequence and keep track of span ranges
            let fullText = '';
            const spanRanges: { span: HTMLSpanElement; start: number; end: number }[] = [];
            
            spans.forEach(span => {
              const text = span.textContent || '';
              const start = fullText.length;
              fullText += text;
              const end = fullText.length;
              spanRanges.push({ span, start, end });
            });

            // 2. Build normalized character map (alphanumeric only) back to original fullText positions
            let normalizedFull = '';
            const indexMap: number[] = [];
            
            for (let i = 0; i < fullText.length; i++) {
              const char = fullText[i].toLowerCase();
              if (/[a-z0-9]/.test(char)) {
                indexMap.push(i);
                normalizedFull += char;
              }
            }

            const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

            // 3. For each highlight, search contiguous text segments in the normalized character layout
            highlights.forEach(hl => {
              const normalizedHl = normalize(hl.text);
              if (!normalizedHl) return;
              
              let idx = normalizedFull.indexOf(normalizedHl);
              while (idx !== -1) {
                // Map back to original fullText character boundaries
                const startInFull = indexMap[idx];
                const endInFull = indexMap[idx + normalizedHl.length - 1] + 1;
                
                // Color all textLayer spans intersecting with this match boundary
                spanRanges.forEach(({ span, start, end }) => {
                  const overlap = Math.max(0, Math.min(end, endInFull) - Math.max(start, startInFull));
                  if (overlap > 0) {
                    let bgColor = 'rgba(251, 191, 36, 0.4)';
                    if (hl.color === 'blue') bgColor = 'rgba(59, 130, 246, 0.4)';
                    if (hl.color === 'purple') bgColor = 'rgba(168, 85, 247, 0.4)';
                    
                    span.style.backgroundColor = bgColor;
                    span.style.borderRadius = '2px';
                  }
                });
                
                idx = normalizedFull.indexOf(normalizedHl, idx + 1);
              }
            });
          }
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };

    renderPage();

    return () => {
      active = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-block',
        boxShadow: 'var(--shadow-md)',
        border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: '#ffffff',
        overflow: 'hidden',
        transition: 'all var(--transition-fast)',
        margin: '0 auto',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
};
