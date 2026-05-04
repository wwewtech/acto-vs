import * as vscode from 'vscode';
import path from 'path';
import iconv from 'iconv-lite';

export interface FileAnalysisResult {
  isBinary: boolean;
  encoding: string;
  hasAmbiguousUnicode: boolean;
  ambiguousChars: string[];
  canDisplay: boolean;
  reason?: string;
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff', '.ico', '.icns',
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac',
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.zst', '.tgz',
  '.pdf', '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.iso', '.jar',
  '.class', '.pyc', '.pyo', '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.psd', '.ai', '.sketch', '.fig'
]);

function hasBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext.length > 0 && BINARY_EXTENSIONS.has(ext);
}

function isBinaryFile(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 1024);
  const sample = buffer.subarray(0, sampleSize);
  let nullCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {nullCount++;}
  }
  const nullPercentage = (nullCount / sample.length) * 100;
  return nullPercentage > 10;
}

function tryDifferentEncodings(buffer: Buffer): { encoding: string; text: string; score: number } {
  const encodings = ['windows-1251', 'cp866', 'koi8-r', 'iso-8859-5'];
  let bestResult = { encoding: 'utf-8', text: buffer.toString('utf-8'), score: 0 };
  for (const encoding of encodings) {
    try {
      const text = iconv.decode(buffer, encoding);
      let score = 0;
      const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
      score += cyrillicCount * 2;
      if (!/Ð|Ñ|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð/.test(text)) {
        score += 15;}
      score += 0;
      if (score > bestResult.score) {
        bestResult = { encoding, text, score };
      }
    } catch { continue; }
  }
  return bestResult;
}

function checkAmbiguousUnicode(text: string): { hasAmbiguous: boolean; chars: string[] } {
  const ambiguousChars: string[] = [];
  const ambiguousPatterns = [
    /[\u200B-\u200D\uFEFF]/g,
    /[\u2028\u2029]/g,
    /[\u2060-\u2064\u206A-\u206F]/g,
    /[\uFFF0-\uFFFF]/g,
    /[\u0000-\u001F\u007F-\u009F]/g,
  ];
  for (const pattern of ambiguousPatterns) {
    const matches = text.match(pattern);
    if (matches) {ambiguousChars.push(...matches);}
  }
  const mixedScriptPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g;
  const hasMixedScript = mixedScriptPattern.test(text);
  if (hasMixedScript) {ambiguousChars.push('mixed-scripts');}
  return {
    hasAmbiguous: ambiguousChars.length > 0,
    chars: [...new Set(ambiguousChars)]
  };
}

export async function analyzeFile(filePath: string): Promise<FileAnalysisResult> {
  try {
    if (hasBinaryExtension(filePath)) {
      return {
        isBinary: true,
        encoding: 'binary',
        hasAmbiguousUnicode: false,
        ambiguousChars: [],
        canDisplay: false,
        reason: 'Файл имеет бинарное расширение и пропущен'
      };
    }
    const uri = vscode.Uri.file(filePath);
    const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const sampleBuffer = buffer.subarray(0, Math.min(buffer.length, 1024));
    const isBinary = isBinaryFile(sampleBuffer);
    if (isBinary) {
      return {
        isBinary: true,
        encoding: 'binary',
        hasAmbiguousUnicode: false,
        ambiguousChars: [],
        canDisplay: false,
        reason: 'Файл является двоичным и не может быть отображен в текстовом редакторе'
      };
    }
    const encoding = 'utf-8';
    let text: string;
    try {
      text = sampleBuffer.toString('utf-8');
    } catch (error) {
      return {
        isBinary: false,
        encoding: 'utf-8',
        hasAmbiguousUnicode: false,
        ambiguousChars: [],
        canDisplay: false,
        reason: `Ошибка декодирования UTF-8: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
    const { hasAmbiguous, chars } = checkAmbiguousUnicode(text);
    return {
      isBinary: false,
      encoding,
      hasAmbiguousUnicode: hasAmbiguous,
      ambiguousChars: chars,
      canDisplay: true,
      reason: undefined
    };
  } catch (error) {
    return {
      isBinary: false,
      encoding: 'unknown',
      hasAmbiguousUnicode: false,
      ambiguousChars: [],
      canDisplay: false,
      reason: `Ошибка чтения файла: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
    };
  }
}

export async function readFileWithAnalysis(filePath: string): Promise<{
  success: boolean;
  content?: string;
  analysis?: FileAnalysisResult;
  error?: string;
}> {
  try {
    const analysis = await analyzeFile(filePath);
    const uri = vscode.Uri.file(filePath);
    if (analysis.isBinary) {
      return {
        success: false,
        analysis,
        error: analysis.reason || 'Бинарный файл пропущен'
      };
    }
    if (!analysis.canDisplay) {
      return {
        success: false,
        analysis,
        error: analysis.reason || 'Файл не может быть отображен'
      };
    }
    let content: string;
    try {
      content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
    } catch (error) {
      const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
      const result = tryDifferentEncodings(buffer);
      content = result.text;
    }
    return {
      success: true,
      content,
      analysis: {
        ...analysis,
        encoding: 'utf-8',
        reason: 'Файл прочитан как UTF-8'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

export function cleanAmbiguousUnicode(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/[\u2060-\u2064\u206A-\u206F]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
} 