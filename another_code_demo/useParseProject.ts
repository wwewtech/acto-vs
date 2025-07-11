import { useState, useCallback, useEffect, useRef } from 'react';
import { ParseProgress } from '../types';
import { parseService } from '../services/parseService';

/**
 * Хук для управления процессом парсинга проекта.
 * Инкапсулирует запуск, отмену, прогресс и результат парсинга.
 * Добавлена улучшенная обработка ошибок и оптимизация производительности.
 */
export function useParseProject(onParseComplete?: () => void) {
  const [parseProgress, setParseProgress] = useState<ParseProgress | undefined>(undefined);
  const [parseResult, setParseResult] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isParsing, setIsParsing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Используем ref для хранения состояния парсинга, чтобы избежать замыканий
  const isParsingRef = useRef(false);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  const progressListenerRef = useRef<((progress: ParseProgress) => void) | null>(null);
  const lastProcessedProgressRef = useRef<ParseProgress | null>(null);
  const timeoutsSetRef = useRef(false);

  /**
   * Очистка всех таймаутов
   */
  const clearTimeouts = useCallback(() => {
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current = [];
    timeoutsSetRef.current = false;
  }, []);

  // Выносим handleProgressUpdate в отдельную функцию
  const handleProgressUpdate = useCallback((progress: ParseProgress) => {
    
    
    // Защита от дублирования событий
    const lastProgress = lastProcessedProgressRef.current;
    if (lastProgress && 
        lastProgress.isRunning === progress.isRunning &&
        lastProgress.isPaused === progress.isPaused &&
        lastProgress.currentFile === progress.currentFile &&
        lastProgress.totalFiles === progress.totalFiles &&
        lastProgress.processedFiles === progress.processedFiles &&
        lastProgress.startTime === progress.startTime) {
      return;
    }
    
    // Сохраняем обработанное событие
    lastProcessedProgressRef.current = progress;
    
    // Дополнительная защита от множественных вызовов с одинаковыми данными
    setParseProgress(prev => {
      // Проверяем, действительно ли нужно обновлять состояние
      if (!prev || 
          prev.isRunning !== progress.isRunning ||
          prev.isPaused !== progress.isPaused ||
          prev.currentFile !== progress.currentFile ||
          prev.totalFiles !== progress.totalFiles ||
          prev.processedFiles !== progress.processedFiles) {
        return progress;
      }
      return prev;
    });

    // Обновляем состояние паузы
    setIsPaused(progress.isPaused || false);
    
    // Если парсинг завершен, сбрасываем прогресс через небольшую задержку
    if (!progress.isRunning && !timeoutsSetRef.current) {
      // Очищаем старые таймауты перед установкой новых
      clearTimeouts();
      
      // Устанавливаем флаг, чтобы предотвратить множественные вызовы
      timeoutsSetRef.current = true;
      
      const timeout1 = setTimeout(() => {
        setParseProgress(undefined);
      }, 1000); // Задержка 1 секунда для показа финального состояния

      const timeout2 = setTimeout(() => {
        setParseResult(undefined);
      }, 1100); // Сбрасываем результат парсинга

      const timeout3 = setTimeout(() => {
        if (onParseComplete) {
          onParseComplete();
        }
      }, 1600); // Вызываем колбэк для обновления файлового дерева

      timeoutRefs.current.push(timeout1, timeout2, timeout3);
    }
  }, [clearTimeouts, onParseComplete]);

  /**
   * Установка обработчика прогресса с защитой от дублирования
   */
  const setupProgressListener = useCallback(() => {
    // Удаляем предыдущий обработчик если он существует
    if (progressListenerRef.current) {
      try {
        window.electronAPI.removeParseProgressListener();
      } catch (e) {
      }
    }
    
    // Устанавливаем новый обработчик
    progressListenerRef.current = handleProgressUpdate;
    try {
      window.electronAPI.onParseProgressUpdate(handleProgressUpdate);
    } catch (e) {
    }
  }, [handleProgressUpdate]);

  /**
   * Удаление обработчика прогресса
   */
  const removeProgressListener = useCallback(() => {
    if (progressListenerRef.current) {
      try {
        window.electronAPI.removeParseProgressListener();
        progressListenerRef.current = null;
      } catch (e) {
      }
    }
  }, []);

  /**
   * Запустить парсинг проекта.
   */
  const startParse = useCallback(async (rootPath: string, selectedPaths: string[]) => {
    if (isParsingRef.current) {
      return;
    }

    try {
      isParsingRef.current = true;
      setIsParsing(true);
      setError(undefined);
      setParseResult(undefined);

      setParseProgress({
        isRunning: true,
        currentFile: 'Инициализация...',
        totalFiles: 0,
        processedFiles: 0,
        startTime: Date.now(),
      });

      const result = await parseService.parseProjectWithProgress({ rootPath, selectedPaths });
      setParseResult(prev => prev !== result ? result : prev);
      
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Неизвестная ошибка';
      
      // Проверяем, является ли это ошибкой отмены парсинга
      if (errorMessage.includes('Парсинг отменен пользователем')) {
        // Это не ошибка, а нормальное завершение
        setError(undefined);
        // Сбрасываем прогресс сразу при отмене
        setParseProgress(undefined);
      } else {
        setError(prev => prev !== errorMessage ? errorMessage : prev);
        setParseProgress(undefined);
      }
    } finally {
      isParsingRef.current = false;
      setIsParsing(false);
    }
  }, []);

  /**
   * Отменить парсинг.
   */
  const stopParse = useCallback(async () => {
    if (!isParsingRef.current) {
      return;
    }

    try {
      await parseService.stopParsing();
      setParseProgress(undefined);
      isParsingRef.current = false;
      setIsParsing(false);
      setIsPaused(false);
      clearTimeouts();
      // Очищаем ошибку при успешной отмене
      setError(undefined);
    } catch (e) {
      setError(prev => prev !== 'Ошибка при отмене парсинга' ? 'Ошибка при отмене парсинга' : prev);
    }
  }, [clearTimeouts]);

  /**
   * Приостановить парсинг.
   */
  const pauseParse = useCallback(async () => {
    if (!isParsingRef.current) {
      return;
    }

    try {
      const result = await parseService.pauseParsing();
      if (result.success) {
        setIsPaused(true);
      } else {
        setError(prev => prev !== result.error ? result.error : prev);
      }
    } catch (e) {
      setError(prev => prev !== 'Ошибка при паузе парсинга' ? 'Ошибка при паузе парсинга' : prev);
    }
  }, []);

  /**
   * Возобновить парсинг.
   */
  const resumeParse = useCallback(async () => {
    if (!isParsingRef.current) {
      return;
    }

    try {
      const result = await parseService.resumeParsing();
      if (result.success) {
        setIsPaused(false);
      } else {
        setError(prev => prev !== result.error ? result.error : prev);
      }
    } catch (e) {
      setError(prev => prev !== 'Ошибка при возобновлении парсинга' ? 'Ошибка при возобновлении парсинга' : prev);
    }
  }, []);

  /**
   * Сбросить состояние парсинга.
   */
  const resetParse = useCallback(() => {
    setParseProgress(undefined);
    setParseResult(undefined);
    setError(undefined);
    setIsParsing(false);
    isParsingRef.current = false;
    clearTimeouts();
    // Очищаем отслеживание последнего прогресса
    lastProcessedProgressRef.current = null;
    // Сбрасываем флаг таймаутов
    timeoutsSetRef.current = false;
    // НЕ удаляем обработчик событий здесь, так как он может понадобиться для следующего парсинга
  }, [clearTimeouts]);

  // Подписка на прогресс с правильным управлением жизненным циклом
  useEffect(() => {
    setupProgressListener();

    // Cleanup function to remove listener when component unmounts
    return () => {
      clearTimeouts();
      removeProgressListener();
    };
  }, [setupProgressListener, removeProgressListener, clearTimeouts]);

  // Очистка при размонтировании компонента
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  // Мемоизируем состояние для оптимизации
  const parseState = {
    isRunning: parseProgress?.isRunning || false,
    progress: parseProgress ? Math.round((parseProgress.processedFiles / parseProgress.totalFiles) * 100) : 0,
    currentFile: parseProgress?.currentFile || '',
    totalFiles: parseProgress?.totalFiles || 0,
    processedFiles: parseProgress?.processedFiles || 0,
    elapsedTime: parseProgress ? Date.now() - parseProgress.startTime : 0,
  };

  // Мемоизированные функции для безопасного обновления состояния
  const safeSetParseResult = useCallback((result: string | undefined) => {
    setParseResult(prev => prev !== result ? result : prev);
  }, []);

  const safeSetError = useCallback((error: string | undefined) => {
    // Проверяем, является ли это ошибкой отмены парсинга
    if (error && error.includes('Парсинг отменен пользователем')) {
      setError(undefined); // Не показываем ошибку при отмене
    } else {
      setError(prev => prev !== error ? error : prev);
    }
  }, []);

  return {
    parseProgress,
    parseResult,
    error,
    isParsing,
    isPaused,
    parseState,
    startParse,
    stopParse,
    pauseParse,
    resumeParse,
    resetParse,
    setParseResult: safeSetParseResult,
    setError: safeSetError,
  };
} 