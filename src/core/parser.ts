import * as vscode from 'vscode';
import * as path from 'path';

// --- Вспомогательные функции для построения дерева ---

/**
 * Преобразует плоский список путей в иерархическую структуру.
 */
function buildFileTree(paths: string[], rootPath: string): any {
    const tree: { [key: string]: any } = {};

    for (const p of paths) {
        // Получаем относительный путь и разбиваем на части
        const relativePath = path.relative(rootPath, p);
        const parts = relativePath.split(path.sep);
        
        let currentLevel = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;

            if (!currentLevel[part]) {
                currentLevel[part] = isLast ? null : {}; // null для файлов, {} для папок
            }
            currentLevel = currentLevel[part];
        }
    }
    return tree;
}

/**
 * Рекурсивно генерирует ASCII-представление дерева.
 */
function generateAsciiTree(node: { [key: string]: any }, prefix = ''): string {
    let result = '';
    const entries = Object.keys(node);
    entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        
        result += prefix + connector + entry + '\n';

        if (node[entry] !== null) { // Если это папка (не null)
            result += generateAsciiTree(node[entry], newPrefix);
        }
    });
    return result;
}

// --- Основной класс парсера ---

export class ActoParser {
    // Список расширений, которые считаем текстовыми. Можно расширить.
    private textFileExtensions = new Set([
        '.py', '.html', '.css', '.js', '.json', '.txt', '.md', '.xml', '.yml', '.yaml', '.toml', '.ini',
        '.gitignore', '.dockerfile' 
    ]);

    // Папки и файлы, которые нужно полностью игнорировать
    private ignorePatterns = ['__pycache__', '.git', 'node_modules', '.vscode', 'dist', 'out', 'output.txt', '.DS_Store'];

    constructor(private filesToParse: string[], private workspaceRoot: string) {}

    /**
     * Проверяет, является ли файл текстовым на основе расширения.
     * Это простая, но быстрая проверка.
     */
    private isTextFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        // Файлы без расширения (like Dockerfile) тоже считаем текстовыми
        return ext === '' || this.textFileExtensions.has(ext);
    }
    
    /**
     * Фильтрует файлы по ignore-листу.
     */
    private filterFiles(files: string[]): string[] {
        return files.filter(file => {
            const parts = file.split(path.sep);
            return !parts.some(part => this.ignorePatterns.includes(part));
        });
    }

    async run(onProgress: (progress: { message: string }) => void): Promise<string> {
        onProgress({ message: 'Фильтрация файлов...' });
        const filteredFiles = this.filterFiles(this.filesToParse);

        // --- 1. Секция "СТРУКТУРА ПРОЕКТА" ---
        onProgress({ message: 'Построение дерева файлов...' });
        const fileTree = buildFileTree(filteredFiles, this.workspaceRoot);
        const projectName = path.basename(this.workspaceRoot);
        let report = `СТРУКТУРА ПРОЕКТА\n===================\n`;
        report += `${projectName}\n`;
        report += generateAsciiTree(fileTree);
        
        report += `\n\nСОДЕРЖИМОЕ ФАЙЛОВ\n===================\n\n`;

        // --- 2. Секция "СОДЕРЖИМОЕ ФАЙЛОВ" ---
        const totalFiles = filteredFiles.length;
        for (let i = 0; i < totalFiles; i++) {
            const filePath = filteredFiles[i];
            const relativePath = path.relative(this.workspaceRoot, filePath);
            
            onProgress({ message: `Чтение файла: ${relativePath} (${i + 1}/${totalFiles})` });

            if (!this.isTextFile(filePath)) {
                // Можно добавить запись о пропуске, но для чистоты отчета лучше просто проигнорировать.
                continue;
            }

            try {
                const uri = vscode.Uri.file(filePath);
                const contentBytes = await vscode.workspace.fs.readFile(uri);
                const content = new TextDecoder('utf-8').decode(contentBytes);
                
                report += `--- Файл: ${relativePath.replace(/\\/g, '/') } ---\n`;
                report += "```\n";
                report += content;
                if (!content.endsWith('\n')) {
                    report += '\n';
                }
                report += "```\n\n";

            } catch (error: any) {
                report += `--- Файл: ${relativePath.replace(/\\/g, '/') } ---\n`;
                report += `[НЕ УДАЛОСЬ ПРОЧИТАТЬ ФАЙЛ: ${error.message}]\n\n`;
            }
        }
        
        // Удаляем лишние переводы строк в конце
        return report.trimEnd() + '\n';
    }
} 