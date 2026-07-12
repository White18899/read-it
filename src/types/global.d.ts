declare module 'mammoth' {
  export interface ConvertToHtmlResult {
    value: string;
    messages: any[];
  }

  export interface ConvertToHtmlOptions {
    arrayBuffer: ArrayBuffer;
  }

  export function convertToHtml(options: ConvertToHtmlOptions): Promise<ConvertToHtmlResult>;
}

declare module 'docx-preview' {
  export interface Options {
    className?: string;
    inWrapper?: boolean;
    ignoreWidth?: boolean;
    ignoreHeight?: boolean;
    ignoreFonts?: boolean;
    breakPages?: boolean;
    debug?: boolean;
  }
  export function renderAsync(
    data: ArrayBuffer | Blob,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement | null,
    options?: Options
  ): Promise<any>;
}

declare module 'pptx-viewer' {
  export class PPTXViewer {
    constructor(container: string | HTMLElement, options?: any);
    load(file: File | Blob | string): Promise<void>;
    next(): void;
    prev(): void;
    goToSlide(slideIndex: number): void;
    getSlidesCount(): number;
    destroy(): void;
  }
}
