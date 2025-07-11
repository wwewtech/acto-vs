import { ParseProgress } from '../types';

/**
 * Сервис для парсинга проекта через Electron API.
 * Позволяет запускать парсинг, отменять его и подписываться на прогресс.
 * Добавлена обработка ошибок и кэширование результатов.
 */
class ParseService {
  private cache = new Map<string, { result: string; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 минут

  /**
   * Получить кэшированный результат
   */
  private getCachedResult(key: string): string | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }
    return null;
  }

  /**
   * Сохранить результат в кэш
   */
  private setCachedResult(key: string, result: string): void {
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Очистить кэш
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Создать ключ кэша для парсинга
   */
  private createCacheKey(rootPath: string, selectedPaths: string[]): string {
    const sortedPaths = [...selectedPaths].sort();
    return `${rootPath}:${sortedPaths.join(',')}`;
  }

  /**
   * Запустить парсинг проекта с прогрессом.
   */
  async parseProjectWithProgress(args: { rootPath: string; selectedPaths: string[] }): Promise<string> {
    try {
      
      // Для parseProjectWithProgress НЕ используем кэш, чтобы всегда отправлялись события прогресса
      // Кэширование может привести к тому, что UI не получит события прогресса
      
      // Очищаем кэш для данного проекта перед парсингом
      this.invalidateCacheForProject(args.rootPath);
      
      const result = await window.electronAPI.parseProjectWithProgress(args);
      
      // Сохраняем в кэш для parseProject (без прогресса)
      const cacheKey = this.createCacheKey(args.rootPath, args.selectedPaths);
      this.setCachedResult(cacheKey, result);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка парсинга';
      // Пробрасываем ошибку как есть, чтобы UI мог её правильно обработать
      throw new Error(errorMessage);
    }
  }

  /**
   * Запустить парсинг проекта без прогресса (для совместимости).
   */
  async parseProject(args: { rootPath: string; selectedPaths: string[] }): Promise<string> {
    try {
      // Проверяем кэш
      const cacheKey = this.createCacheKey(args.rootPath, args.selectedPaths);
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      const result = await window.electronAPI.parseProject(args);
      
      // Сохраняем в кэш
      this.setCachedResult(cacheKey, result);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка парсинга';
      // Пробрасываем ошибку как есть, чтобы UI мог её правильно обработать
      throw new Error(errorMessage);
    }
  }

  /**
   * Отменить парсинг.
   */
  async stopParsing(): Promise<void> {
    try {
      await window.electronAPI.stopParsing();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при отмене парсинга';
      // Пробрасываем ошибку как есть, чтобы UI мог её правильно обработать
      throw new Error(errorMessage);
    }
  }

  /**
   * Приостановить парсинг.
   */
  async pauseParsing(): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electronAPI.pauseParsing();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при паузе парсинга';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Возобновить парсинг.
   */
  async resumeParsing(): Promise<{ success: boolean; error?: string }> {
    try {
      return await window.electronAPI.resumeParsing();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при возобновлении парсинга';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Получить статус парсинга.
   */
  async getParsingStatus(): Promise<{ status: 'idle' | 'running' | 'paused' | 'cancelled' }> {
    try {
      return await window.electronAPI.getParsingStatus();
    } catch (error) {
      return { status: 'idle' };
    }
  }

  /**
   * Подписаться на обновления прогресса парсинга.
   * @deprecated Используйте window.electronAPI.onParseProgressUpdate напрямую
   */
  onParseProgressUpdate(callback: (progress: ParseProgress) => void): void {
    try {
      window.electronAPI.onParseProgressUpdate(callback);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Неизвестная ошибка при настройке слушателя прогресса');
    }
  }

  /**
   * Удалить слушатель прогресса парсинга.
   * @deprecated Используйте window.electronAPI.removeParseProgressListener напрямую
   */
  removeParseProgressListener(): void {
    try {
      window.electronAPI.removeParseProgressListener();
    } catch (error) {
    }
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): { size: number; entries: number } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.values()).length,
    };
  }

  /**
   * Инвалидировать кэш для конкретного проекта
   */
  invalidateCacheForProject(rootPath: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(rootPath));
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

export const parseService = new ParseService(); 