import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js Worker to use a reliable CDN worker matching our dependency version
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

/**
 * Parses a Word document (.docx) client-side and returns the content as clean HTML.
 */
export async function parseDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value; // Returns HTML string
}

/**
 * Parses a PowerPoint presentation (.pptx) client-side and returns structured text slide by slide.
 */
export async function parsePptx(file: File): Promise<{ title: string; slides: { id: number; text: string }[] }> {
  const zip = await JSZip.loadAsync(file);
  const slides: { id: number; text: string }[] = [];
  
  // Find all XML slides in the slides folder
  const slideFiles = Object.keys(zip.files).filter(path => 
    path.startsWith('ppt/slides/slide') && path.endsWith('.xml')
  ).sort((a, b) => {
    // Extract slide numbers to sort numerically (slide1.xml, slide2.xml, slide10.xml...)
    const numA = parseInt(a.match(/\d+/)![0], 10);
    const numB = parseInt(b.match(/\d+/)![0], 10);
    return numA - numB;
  });
  
  const parser = new DOMParser();
  
  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.files[slidePath].async('string');
    const doc = parser.parseFromString(slideXml, 'text/xml');
    
    // In pptx XML structure, text content lies in <a:t> elements inside shapes
    const tElements = doc.getElementsByTagName('a:t');
    const slideTextParts: string[] = [];
    
    for (let j = 0; j < tElements.length; j++) {
      const text = tElements[j].textContent;
      if (text && text.trim()) {
        slideTextParts.push(text.trim());
      }
    }
    
    slides.push({
      id: i + 1,
      text: slideTextParts.join(' ')
    });
  }
  
  return {
    title: file.name,
    slides
  };
}

/**
 * Parses a PDF document client-side and returns structured text page by page.
 */
export async function parsePdf(file: File): Promise<{ title: string; pages: { id: number; text: string }[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages: { id: number; text: string }[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    pages.push({
      id: i,
      text: pageText
    });
  }
  
  return {
    title: file.name,
    pages
  };
}
