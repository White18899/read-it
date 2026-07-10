import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Presentation, File } from 'lucide-react';

interface UploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export const Uploader: React.FC<UploaderProps> = ({ onFileSelect, isLoading }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndProcess(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndProcess(e.target.files[0]);
    }
  };

  const validateAndProcess = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || ext === 'docx' || ext === 'pptx') {
      onFileSelect(file);
    } else {
      alert('Unsupported file format. Please upload a PDF, DOCX, or PPTX file.');
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`glass-panel animate-fade-in`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3.5rem 2.5rem',
        borderRadius: 'var(--radius-lg)',
        border: isDragActive ? '2px dashed var(--accent)' : '1px dashed var(--border)',
        backgroundColor: isDragActive ? 'var(--surface-hover)' : 'var(--surface)',
        transition: 'all var(--transition-normal)',
        maxWidth: '560px',
        width: '100%',
        margin: 'auto',
        boxShadow: 'var(--shadow-md)',
        cursor: 'pointer',
      }}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={triggerFileInput}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleFileInput}
        style={{ display: 'none' }}
        disabled={isLoading}
      />

      <div
        className="hover-scale"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: isDragActive ? 'var(--accent-gradient)' : 'var(--accent-soft)',
          color: isDragActive ? '#fff' : 'var(--accent)',
          marginBottom: '1.5rem',
          transition: 'all var(--transition-normal)',
        }}
      >
        <UploadCloud size={32} className={isLoading ? 'animate-pulse' : ''} />
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-title)',
          fontSize: '1.25rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
          color: 'var(--text-primary)',
          textAlign: 'center',
        }}
      >
        {isLoading ? 'Processing document...' : 'Drag & drop your document'}
      </h3>
      
      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          marginBottom: '1.5rem',
          textAlign: 'center',
        }}
      >
        Supports PDF, DOCX (Word), and PPTX (PowerPoint)
      </p>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.15)',
          }}
        >
          <File size={12} /> PDF
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#3b82f6',
            border: '1px solid rgba(59, 130, 246, 0.15)',
          }}
        >
          <FileText size={12} /> DOCX
        </span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.15)',
          }}
        >
          <Presentation size={12} /> PPTX
        </span>
      </div>

      <button
        style={{
          padding: '0.625rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--accent-gradient)',
          color: '#ffffff',
          fontFamily: 'var(--font-title)',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          transition: 'all var(--transition-fast)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          triggerFileInput();
        }}
        disabled={isLoading}
      >
        Browse Files
      </button>
    </div>
  );
};
