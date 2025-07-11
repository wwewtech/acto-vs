// src/types.d.ts

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface TabItem {
  id: string;
  name: string;
  content: string;
  isModified?: boolean;
  projectRoot?: string;
  fileAnalysis?: FileAnalysisResult;
}

export interface SettingsStore {
  showUnicodeWarnings?: boolean;
  fixedLineWidth?: boolean; // Новая настройка для фиксированной ширины строки
}

// Новые типы для прогресс-бара и статуса
export interface ParseProgress {
  isRunning: boolean;
  isPaused?: boolean;
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
  startTime: number;
}

export interface FileInfo {
  characters: number;
  tokens: number;
  size: string;
}

// Новые типы для анализа файлов
export interface FileAnalysisResult {
  isBinary: boolean;
  encoding: string;
  hasAmbiguousUnicode: boolean;
  ambiguousChars: string[];
  canDisplay: boolean;
  reason?: string;
}

export interface FileReadResult {
  success: boolean;
  content?: string;
  analysis?: FileAnalysisResult;
  error?: string;
}

// Разбиваем большой интерфейс на более мелкие
export interface IFileSystemAPI {
  getFolderTree: () => Promise<FileNode | null>;
  readFile: (filePath: string) => Promise<FileReadResult>;
  saveFile: (args: { filePath: string, content: string }) => Promise<{ success: boolean; error?: string }>;
  createFile: (args: { dirPath: string; name: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  createFolder: (args: { dirPath: string; name: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  deletePath: (args: { targetPath: string }) => Promise<{ success: boolean; error?: string }>;
  renamePath: (args: { oldPath: string; newName: string }) => Promise<{ success: boolean; newPath?: string; error?: string }>;
  copyPath: (args: { path: string }) => Promise<{ success: boolean }>;
  cutPath: (args: { path: string }) => Promise<{ success: boolean }>;
  pastePath: (args: { targetDir: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  refreshFolderTree: (path: string) => Promise<FileNode | null>;
  analyzeFile: (filePath: string) => Promise<FileAnalysisResult>;
  cleanUnicode: (text: string) => string;
}

export interface IParseAPI {
  parseProject: (args: { rootPath: string; selectedPaths: string[] }) => Promise<string>;
  parseProjectWithProgress: (args: { rootPath: string; selectedPaths: string[] }) => Promise<string>;
  stopParsing: () => void;
  pauseParsing: () => Promise<{ success: boolean; error?: string }>;
  resumeParsing: () => Promise<{ success: boolean; error?: string }>;
  getParsingStatus: () => Promise<{ status: 'idle' | 'running' | 'paused' | 'cancelled' }>;
  onParseProgressUpdate: (callback: (progress: ParseProgress) => void) => void;
  removeParseProgressListener: () => void;
}

export interface ISettingsAPI {
  getSetting: (key: keyof SettingsStore) => Promise<unknown>;
  setSetting: (args: { key: keyof SettingsStore; value: unknown }) => void;
}

export interface IWindowAPI {
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  onWindowMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => void;
  setZoom: (factor: number) => void;
}

export interface IExternalAPI {
  showInExplorer: (filePath: string) => void;
  openExternal: (url: string) => void;
  openInTerminal: (args: { dirPath: string }) => Promise<{ success: boolean; error?: string }>;
  findInFolder: (args: { dirPath: string }) => Promise<{ success: boolean; error?: string }>;
  showConfirmDialog: (message: string) => Promise<number>; // 0 = Отмена, 1 = Сохранить все, 2 = Закрыть без сохранения
}

// Объединяем все API в один интерфейс
interface IElectronAPI {
  getFolderTree: () => Promise<FileNode | null>;
  parseProject: (args: { rootPath: string; selectedPaths: string[] }) => Promise<string>;
  parseProjectWithProgress: (args: { rootPath: string; selectedPaths: string[] }) => Promise<string>;
  stopParsing: () => Promise<void>;
  pauseParsing: () => Promise<{ success: boolean; error?: string }>;
  resumeParsing: () => Promise<{ success: boolean; error?: string }>;
  getParsingStatus: () => Promise<{ status: 'idle' | 'running' | 'paused' | 'cancelled' }>;
  readFile: (filePath: string) => Promise<FileReadResult>;
  saveFile: (args: { filePath: string; content: string }) => Promise<void>;
  analyzeFile: (filePath: string) => Promise<FileAnalysisResult>;
  cleanUnicode: (text: string) => Promise<string>;
  getSetting: (key: string) => Promise<unknown>;
  setSetting: (args: { key: string; value: unknown }) => void;
  showConfirmDialog: (message: string) => Promise<number>; // 0 = Отмена, 1 = Сохранить все, 2 = Закрыть без сохранения
  showInExplorer: (filePath: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  createFile: (args: { dirPath: string; name: string }) => Promise<void>;
  createFolder: (args: { dirPath: string; name: string }) => Promise<void>;
  deletePath: (args: { targetPath: string }) => Promise<void>;
  renamePath: (args: { oldPath: string; newName: string }) => Promise<void>;
  copyPath: (args: { path: string }) => Promise<void>;
  cutPath: (args: { path: string }) => Promise<void>;
  pastePath: (args: { targetDir: string }) => Promise<void>;
  openInTerminal: (args: { dirPath: string }) => Promise<void>;
  findInFolder: (args: { dirPath: string }) => Promise<void>;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  onParseProgressUpdate: (callback: (progress: any) => void) => void;
  removeParseProgressListener: () => void;
  onWindowMaximizedStateChanged: (callback: (isMaximized: boolean) => void) => void;
  refreshFolderTree: (path: string) => Promise<FileNode | null>;
  setZoom: (factor: number) => void;
  handleDroppedFolder: (filePaths: string[]) => Promise<{ success: boolean; folderPath?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}