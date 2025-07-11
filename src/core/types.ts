export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface ParseProgress {
  isRunning: boolean;
  isPaused?: boolean;
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
  startTime: number;
}

export interface FileAnalysisResult {
  isBinary: boolean;
  encoding: string;
  hasAmbiguousUnicode: boolean;
  ambiguousChars: string[];
  canDisplay: boolean;
  reason?: string;
} 