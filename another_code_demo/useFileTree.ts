import { useState, useCallback, useMemo } from 'react';
import { FileNode } from '../types';
import { fileService } from '../services/fileService';

/**
 * Хук для работы с деревом файлов проекта.
 * Инкапсулирует загрузку, выбор, чекбоксы, expand/collapse.
 * Позволяет открывать папку, отмечать/снимать чекбоксы, разворачивать/сворачивать папки.
 */
export function useFileTree() {
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Функция для нормализации путей (всегда используем прямые слэши)
  const normalizePath = useCallback((path: string) => path.replace(/\\/g, '/'), []);

  /**
   * Получить все пути файлов в дереве (рекурсивно) - мемоизировано
   */
  const getAllFilePaths = useCallback((node: FileNode): string[] => {
    let paths: string[] = [];
    if (node.isDirectory && node.children) {
      for (const child of node.children) {
        paths = paths.concat(getAllFilePaths(child));
      }
    } else {
      paths.push(normalizePath(node.path));
    }
    return paths;
  }, [normalizePath]);

  /**
   * Получить все пути папок в дереве (рекурсивно) - мемоизировано
   */
  const getAllFolderPaths = useCallback((node: FileNode): string[] => {
    let paths: string[] = [];
    if (node.isDirectory) {
      paths.push(normalizePath(node.path));
      if (node.children) {
        for (const child of node.children) {
          paths = paths.concat(getAllFolderPaths(child));
        }
      }
    }
    return paths;
  }, [normalizePath]);

  // Мемоизируем вычисления для оптимизации производительности
  const allFilePaths = useMemo(() => {
    return fileTree ? getAllFilePaths(fileTree) : [];
  }, [fileTree, getAllFilePaths]);

  const allFolderPaths = useMemo(() => {
    return fileTree ? getAllFolderPaths(fileTree) : [];
  }, [fileTree, getAllFolderPaths]);

  /**
   * Открыть папку и загрузить дерево файлов.
   * Если path не передан — показать диалог выбора папки.
   * Если path передан — открыть дерево по этому пути.
   */
  const openFolder = useCallback(async (path?: string) => {
    let tree: FileNode | null = null;
    if (path) {
      // Открываем дерево по переданному пути
      tree = await fileService.refreshFolderTree(path);
    } else {
      // Показываем диалог
      tree = await fileService.getFolderTree();
    }
    if (tree === null) {
      return;
    }
    setFileTree(tree);
    if (tree) {
      // Автоматически выделяем только файлы при открытии папки
      const allFilePaths = getAllFilePaths(tree);
      setCheckedPaths(new Set(allFilePaths));
      setExpandedFolders(new Set([normalizePath(tree.path)]));
    }
  }, [getAllFilePaths, normalizePath]);

  /**
   * Получить все пути потомков папки (рекурсивно)
   */
  const getAllDescendantPaths = useCallback((node: FileNode): string[] => {
    let paths: string[] = [];
    if (node.isDirectory && node.children) {
      for (const child of node.children) {
        paths.push(normalizePath(child.path));
        paths.push(...getAllDescendantPaths(child));
      }
    }
    return paths;
  }, [normalizePath]);

  /**
   * Проверить, есть ли хоть один выделенный потомок
   */
  const areAnyDescendantsChecked = useCallback((node: FileNode, checkedPaths: Set<string>): boolean => {
    if (!node.isDirectory || !node.children) return false;
    
    return node.children.some(child => {
      const normalizedChildPath = normalizePath(child.path);
      if (child.isDirectory) {
        return checkedPaths.has(normalizedChildPath) || areAnyDescendantsChecked(child, checkedPaths);
      } else {
        return checkedPaths.has(normalizedChildPath);
      }
    });
  }, [normalizePath]);

  /**
   * Проверить, все ли потомки папки выделены
   */
  const areAllDescendantsChecked = useCallback((node: FileNode, checkedPaths: Set<string>): boolean => {
    if (!node.isDirectory || !node.children) return true;
    
    return node.children.every(child => {
      const normalizedChildPath = normalizePath(child.path);
      if (child.isDirectory) {
        return checkedPaths.has(normalizedChildPath) && areAllDescendantsChecked(child, checkedPaths);
      } else {
        return checkedPaths.has(normalizedChildPath);
      }
    });
  }, [normalizePath]);

  /**
   * Рекурсивно обновляет состояние выделения для всех папок в дереве.
   * - Папка считается выделенной, только если выделены все её потомки.
   * - Если у папки нет выделенных потомков — выделение снимается.
   * - Пустые папки не трогаются (их можно выделять вручную).
   * Вызывается после любого изменения выделения файлов/папок.
   */
  const updateParentFolders = useCallback((node: FileNode, checkedPaths: Set<string>) => {
    if (!node.isDirectory) return;
    if (!node.children || node.children.length === 0) return; // Пустая папка — не трогаем её выделение

    const normalizedNodePath = normalizePath(node.path);

    // Есть ли хоть один выделенный потомок?
    const anyDescendantChecked = node.children.some(child => {
      const normalizedChildPath = normalizePath(child.path);
      if (child.isDirectory) {
        return checkedPaths.has(normalizedChildPath) || areAnyDescendantsChecked(child, checkedPaths);
      } else {
        return checkedPaths.has(normalizedChildPath);
      }
    });

    // Все ли потомки выделены?
    const allDescendantsChecked = node.children.every(child => {
      const normalizedChildPath = normalizePath(child.path);
      if (child.isDirectory) {
        return checkedPaths.has(normalizedChildPath) && areAllDescendantsChecked(child, checkedPaths);
      } else {
        return checkedPaths.has(normalizedChildPath);
      }
    });

    // Если нет ни одного выделенного потомка — папка не выделяется
    if (!anyDescendantChecked) {
      checkedPaths.delete(normalizedNodePath);
    } else if (allDescendantsChecked) {
      checkedPaths.add(normalizedNodePath);
    } else {
      checkedPaths.delete(normalizedNodePath);
    }

    // Рекурсивно обновляем для всех дочерних папок
    for (const child of node.children) {
      if (child.isDirectory) {
        updateParentFolders(child, checkedPaths);
      }
    }
  }, [areAnyDescendantsChecked, areAllDescendantsChecked, normalizePath]);

  /**
   * Обработка выделения/снятия выделения для файлов и папок.
   * - Для файлов: выделяется/снимается только сам файл.
   * - Для папок с потомками: выделяется/снимается папка и все её потомки.
   * - Для пустых папок: выделяется/снимается только сама папка (можно выделять вручную).
   * После любого изменения выделения пересчитывается состояние родительских папок.
   */
  const checkPath = useCallback((path: string, checked: boolean, node: FileNode) => {
    setCheckedPaths(prev => {
      const newSet = new Set(prev);
      const normalizedPath = normalizePath(path);
      
      if (node.isDirectory) {
        const descendantPaths = getAllDescendantPaths(node);
        if (descendantPaths.length === 0) {
          // === ПУСТАЯ ПАПКА ===
          // Можно выделять/снимать вручную, влияет только на саму папку
          if (checked) {
            newSet.add(normalizedPath);
          } else {
            newSet.delete(normalizedPath);
          }
        } else {
          // === ПАПКА С ПОТОМКАМИ ===
          // Выделение: выделяем папку и всех потомков
          // Снятие: снимаем выделение с папки и всех потомков
          if (checked) {
            newSet.add(normalizedPath);
            descendantPaths.forEach(p => newSet.add(p));
          } else {
            newSet.delete(normalizedPath);
            descendantPaths.forEach(p => newSet.delete(p));
          }
        }
      } else {
        // === ФАЙЛ ===
        // Выделяем/снимаем только сам файл
        if (checked) {
          newSet.add(normalizedPath);
        } else {
          newSet.delete(normalizedPath);
        }
      }
      // После любого изменения выделения пересчитываем состояние родительских папок
      if (fileTree) {
        updateParentFolders(fileTree, newSet);
      }
      return newSet;
    });
  }, [fileTree, getAllDescendantPaths, updateParentFolders, normalizePath]);

  // Вспомогательная функция для поиска узла по пути
  const findNodeByPath = useCallback((node: FileNode, targetPath: string): FileNode | null => {
    if (normalizePath(node.path) === normalizePath(targetPath)) {
      return node;
    }
    if (node.isDirectory && node.children) {
      for (const child of node.children) {
        const found = findNodeByPath(child, targetPath);
        if (found) return found;
      }
    }
    return null;
  }, [normalizePath]);

  /**
   * Развернуть или свернуть папку.
   */
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      const normalizedPath = normalizePath(path);
      if (newSet.has(normalizedPath)) {
        newSet.delete(normalizedPath);
      } else {
        newSet.add(normalizedPath);
      }
      return newSet;
    });
  }, [normalizePath]);

  /**
   * Отметить все элементы (файлы и папки).
   */
  const selectAll = useCallback(() => {
    if (!fileTree) return;
    setCheckedPaths(new Set([...allFilePaths, ...allFolderPaths]));
  }, [fileTree, allFilePaths, allFolderPaths]);

  /**
   * Снять все отметки.
   */
  const deselectAll = useCallback(() => {
    setCheckedPaths(new Set());
  }, []);

  /**
   * Развернуть все папки.
   */
  const expandAll = useCallback(() => {
    if (!fileTree) return;
    setExpandedFolders(new Set(allFolderPaths));
  }, [fileTree, allFolderPaths]);

  /**
   * Свернуть все папки.
   */
  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  // Добавляю функцию для обновления дерева без диалога
  const refreshTree = useCallback(async (path: string) => {
    try {
      const tree = await fileService.refreshFolderTree(path);
      setFileTree(tree);
    } catch (error) {
    }
  }, []);

  /**
   * Обновляет checkedPaths после переименования файла
   * Удаляет старый путь и добавляет новый, затем пересчитывает состояние папок
   */
  const updateCheckedPathsAfterRename = useCallback((oldPath: string, newPath: string) => {
    const normalizedOldPath = normalizePath(oldPath);
    const normalizedNewPath = normalizePath(newPath);
    
    setCheckedPaths(prev => {
      const newSet = new Set(prev);
      let hasChanges = false;
      
      // Проверяем, был ли старый путь в checkedPaths
      const hadOldPath = newSet.has(normalizedOldPath);
      
      // Удаляем старый путь
      if (hadOldPath) {
        newSet.delete(normalizedOldPath);
        hasChanges = true;
      }
      
      // Добавляем новый путь (всегда, если старый был, или если нужно сохранить выделение)
      if (!newSet.has(normalizedNewPath)) {
        newSet.add(normalizedNewPath);
        hasChanges = true;
      }
      
      // Если старый путь не был в checkedPaths, но файл был выделен через папку,
      // то нужно проверить, была ли выделена родительская папка
      if (!hadOldPath && fileTree) {
        const oldParentPath = normalizedOldPath.substring(0, normalizedOldPath.lastIndexOf('/'));
        const newParentPath = normalizedNewPath.substring(0, normalizedNewPath.lastIndexOf('/'));
        
        // Если родительская папка была выделена, то новый файл тоже должен быть выделен
        if (newSet.has(oldParentPath) && oldParentPath === newParentPath) {
          if (!newSet.has(normalizedNewPath)) {
            newSet.add(normalizedNewPath);
            hasChanges = true;
          }
        }
      }
      
      // Если были изменения, пересчитываем состояние папок
      if (hasChanges && fileTree) {
        updateParentFolders(fileTree, newSet);
      }
      
      return newSet;
    });
  }, [fileTree, updateParentFolders, normalizePath]);

  return {
    fileTree,
    checkedPaths,
    expandedFolders,
    openFolder,
    checkPath,
    toggleFolder,
    selectAll,
    deselectAll,
    expandAll,
    collapseAll,
    setFileTree, // для прямого обновления (например, после удаления)
    setCheckedPaths,
    setExpandedFolders,
    refreshTree,
    updateCheckedPathsAfterRename, // новая функция для обновления после переименования
    // Экспортируем мемоизированные значения для оптимизации
    allFilePaths,
    allFolderPaths,
  };
} 