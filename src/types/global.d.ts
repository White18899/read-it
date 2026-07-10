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
