import fs from 'fs';
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

/**
 * Проверяет, является ли файл двоичным
 */
function isBinaryFile(buffer: Buffer): boolean {
  // Проверяем первые 1024 байта на наличие null bytes
  const sampleSize = Math.min(buffer.length, 1024);
  const sample = buffer.subarray(0, sampleSize);
  
  // Считаем null bytes
  let nullCount = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      nullCount++;
    }
  }
  
  // Если больше 10% null bytes, считаем файл двоичным
  const nullPercentage = (nullCount / sample.length) * 100;
  const isBinary = nullPercentage > 10;
  
  return isBinary;
}

/**
 * Определяет кодировку файла
 */
function detectEncoding(buffer: Buffer): string {
  // Проверяем BOM (Byte Order Mark)
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8-bom';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'utf-16le';
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'utf-16be';
  }
  
  // Пытаемся декодировать как UTF-8
  try {
    const text = buffer.toString('utf-8');
    // Проверяем, что декодирование прошло успешно
    Buffer.from(text, 'utf-8');
    return 'utf-8';
  } catch {
    // Если UTF-8 не работает, пробуем другие кодировки
    const encodings = ['windows-1251', 'cp866', 'koi8-r', 'iso-8859-5', 'latin1'];
    
    for (const encoding of encodings) {
      try {
        let text: string;
        if (encoding === 'latin1') {
          text = buffer.toString('latin1');
        } else {
          text = iconv.decode(buffer, encoding);
        }
        // Проверяем, что в тексте есть осмысленные символы
        if (text.length > 0 && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
          return encoding;
        }
      } catch {
        continue;
      }
    }
    
    // Если ничего не подошло, возвращаем latin1 как fallback
    return 'latin1';
  }
}

/**
 * Пробует разные кодировки и выбирает лучшую
 */
function tryDifferentEncodings(buffer: Buffer): { encoding: string; text: string; score: number } {
  const encodings = ['windows-1251', 'cp866', 'koi8-r', 'iso-8859-5'];
  let bestResult = { encoding: 'utf-8', text: buffer.toString('utf-8'), score: 0 };
  
  for (const encoding of encodings) {
    try {
      const text = iconv.decode(buffer, encoding);
      let score = 0;
      
      // Бонус за наличие кириллических символов
      const cyrillicCount = (text.match(/[а-яё]/gi) || []).length;
      score += cyrillicCount * 2;
      
      // Бонус за отсутствие "мусорных" символов
      if (!/Ð|Ñ|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð|Ð/.test(text)) {
        score += 15;
      }
      
      // Бонус за читаемые символы
      const readableChars = text.replace(/[^\w\sа-яё.,!?;:(){}[\]"'`~@#$%^&*+=|\\/<>-]/g, '').length;
      score += readableChars / text.length * 10;
      
      if (score > bestResult.score) {
        bestResult = { encoding, text, score };
      }
    } catch {
      continue;
    }
  }
  
  return bestResult;
}

/**
 * Проверяет наличие неоднозначных символов Юникода
 */
function checkAmbiguousUnicode(text: string): { hasAmbiguous: boolean; chars: string[] } {
  const ambiguousChars: string[] = [];
  
  // Символы, которые могут быть неоднозначными
  const ambiguousPatterns = [
    /[\u200B-\u200D\uFEFF]/g, // Zero-width characters
    /[\u2028\u2029]/g, // Line/paragraph separators
    /[\u2060-\u2064\u206A-\u206F]/g, // Format characters
    /[\uFFF0-\uFFFF]/g, // Special purpose characters
    /[\u0000-\u001F\u007F-\u009F]/g, // Control characters
  ];
  
  for (const pattern of ambiguousPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      ambiguousChars.push(...matches);
    }
  }
  
  // Проверяем на смешанные символы из разных языков
  const mixedScriptPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g; // CJK characters
  const hasMixedScript = mixedScriptPattern.test(text);
  
  if (hasMixedScript) {
    ambiguousChars.push('mixed-scripts');
  }
  
  return {
    hasAmbiguous: ambiguousChars.length > 0,
    chars: [...new Set(ambiguousChars)] // Убираем дубликаты
  };
}

/**
 * Анализирует файл и определяет его тип и возможность отображения
 */
export async function analyzeFile(filePath: string): Promise<FileAnalysisResult> {
  try {
    // Читаем только первые 1024 байта для анализа
    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
    await fd.close();
    
    const sampleBuffer = buffer.subarray(0, bytesRead);
    
    // Проверяем, является ли файл двоичным
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
    
    // Всегда используем UTF-8 для текстовых файлов
    const encoding = 'utf-8';
    
    // Декодируем текст как UTF-8
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
    
    // Проверяем на неоднозначные символы Юникода, но не блокируем файл
    const { hasAmbiguous, chars } = checkAmbiguousUnicode(text);
    
    return {
      isBinary: false,
      encoding,
      hasAmbiguousUnicode: hasAmbiguous,
      ambiguousChars: chars,
      canDisplay: true, // Всегда разрешаем отображение, если файл не двоичный
      reason: undefined // Убираем предупреждение о неоднозначных символов
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

/**
 * Читает файл с учетом его типа и кодировки
 */
export async function readFileWithAnalysis(filePath: string): Promise<{
  success: boolean;
  content?: string;
  analysis?: FileAnalysisResult;
  error?: string;
}> {
  try {
    const analysis = await analyzeFile(filePath);
    
    // Для бинарных файлов читаем содержимое как "мусорные" символы
    if (analysis.isBinary) {
      const buffer = await fs.promises.readFile(filePath);
      // Преобразуем бинарные данные в строку, заменяя непечатные символы
      const binaryContent = buffer.toString('latin1')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Заменяем control characters на
        .replace(/\x00/g, ''); // Заменяем null bytes на
      
      return {
        success: true,
        content: binaryContent,
        analysis: {
          ...analysis,
          canDisplay: true, // Разрешаем отображение бинарных файлов
          reason: 'Бинарный файл отображается как текст (непечатные символы заменены на)'
        }
      };
    }
    
    if (!analysis.canDisplay) {
      return {
        success: false,
        analysis,
        error: analysis.reason || 'Файл не может быть отображен'
      };
    }
    
    // Проверяем размер файла
    const stats = await fs.promises.stat(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    let content: string;
    
    // Для больших файлов используем потоковое чтение
    if (fileSizeMB > 10) {
      content = await readLargeFileStream(filePath);
    } else {
      // Для небольших файлов читаем как обычно
      try {
        content = await fs.promises.readFile(filePath, 'utf-8');
      } catch (error) {
        // Если UTF-8 не работает, пробуем другие кодировки
        const buffer = await fs.promises.readFile(filePath);
        const result = tryDifferentEncodings(buffer);
        content = result.text;
      }
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

/**
 * Потоковое чтение больших файлов
 */
async function readLargeFileStream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const stream = fs.createReadStream(filePath, { 
      encoding: 'utf8',
      highWaterMark: 64 * 1024 // 64KB чанки
    });
    
    stream.on('data', (chunk: string) => {
      chunks.push(chunk);
    });
    
    stream.on('end', () => {
      const content = chunks.join('');
      resolve(content);
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Очищает текст от неоднозначных символов Юникода
 */
export function cleanAmbiguousUnicode(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
    .replace(/[\u2028\u2029]/g, '\n') // Line/paragraph separators -> newlines
    .replace(/[\u2060-\u2064\u206A-\u206F]/g, '') // Format characters
    .replace(/[\uFFF0-\uFFFF]/g, '') // Special purpose characters
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Control characters (кроме \n, \r, \t)
} 