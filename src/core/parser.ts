import * as vscode from 'vscode';
import * as path from 'path';
import { ParseResult, ParseStats } from './types';

// --- Вспомогательные функции для построения дерева ---

function buildFileTree(paths: string[], rootPath: string): { [key: string]: any } {
    const tree: { [key: string]: any } = {};
    for (const p of paths) {
        const relativePath = path.relative(rootPath, p);
        const parts = relativePath.split(path.sep);
        let currentLevel = tree;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            if (!currentLevel[part]) {
                currentLevel[part] = isLast ? null : {};
            }
            if (!isLast) {
                currentLevel = currentLevel[part];
            }
        }
    }
    return tree;
}

function generateAsciiTree(node: { [key: string]: any }, prefix = ''): string {
    let result = '';
    const entries = Object.keys(node);
    entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        result += prefix + connector + entry + '\n';
        if (node[entry] !== null) {
            result += generateAsciiTree(node[entry], newPrefix);
        }
    });
    return result;
}

function formatDateTime(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatNumber(n: number): string {
    return n.toLocaleString('ru-RU');
}

export function formatTokenCount(n: number): string {
    if (n >= 1_000_000) { return `${(n / 1_000_000).toFixed(1)}M`; }
    if (n >= 1_000) { return `${(n / 1_000).toFixed(1)}k`; }
    return String(n);
}

export function getLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
        '.mjs': 'javascript', '.cjs': 'javascript',
        '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
        '.cs': 'csharp', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
        '.c': 'c', '.h': 'c', '.hpp': 'cpp',
        '.json': 'json', '.jsonc': 'jsonc',
        '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
        '.md': 'markdown', '.mdx': 'mdx',
        '.html': 'html', '.htm': 'html',
        '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
        '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
        '.ps1': 'powershell', '.psm1': 'powershell',
        '.sql': 'sql', '.xml': 'xml', '.svg': 'xml',
        '.vue': 'vue', '.svelte': 'svelte',
        '.php': 'php', '.rb': 'ruby', '.swift': 'swift',
        '.kt': 'kotlin', '.kts': 'kotlin',
        '.dart': 'dart', '.r': 'r', '.lua': 'lua',
        '.tf': 'hcl', '.hcl': 'hcl',
        '.dockerfile': 'dockerfile', '.env': 'properties',
        '.ini': 'ini', '.cfg': 'ini', '.conf': 'properties',
    };
    const base = path.basename(filePath).toLowerCase();
    if (base === 'dockerfile') { return 'dockerfile'; }
    if (base === 'makefile' || base === 'makefile.am') { return 'makefile'; }
    return map[ext] || '';
}

// --- Основной класс парсера ---

export class ActoParser {
    private _cancelled = false;

    constructor(
        private filesToParse: string[],
        private workspaceRoot: string,
        private ignoredPatterns: string[] = [
            '__pycache__', '.git', 'node_modules', '.vscode',
            'dist', 'out', 'output.txt', '.DS_Store', '.next',
            'build', 'coverage', '.nyc_output', '.turbo'
        ]
    ) {}

    cancel(): void {
        this._cancelled = true;
    }

    /** Проверяет бинарность по первым байтам (null-byte heuristic). */
    private isBinaryContent(bytes: Uint8Array): boolean {
        const sampleSize = Math.min(bytes.length, 512);
        let nullCount = 0;
        for (let i = 0; i < sampleSize; i++) {
            if (bytes[i] === 0) { nullCount++; }
        }
        return sampleSize > 0 && nullCount / sampleSize >= 0.1;
    }

    private filterFiles(files: string[]): string[] {
        return files.filter(file => {
            const parts = file.split(path.sep);
            return !parts.some(part => this.ignoredPatterns.includes(part));
        });
    }

    async run(onProgress: (progress: { message: string }) => void): Promise<ParseResult> {
        const startTime = Date.now();
        onProgress({ message: 'Фильтрация файлов...' });

        // Убираем директории и игнорируемые пути
        const allPaths = this.filterFiles(this.filesToParse);
        const filePathsOnly: string[] = [];
        for (const p of allPaths) {
            try {
                const stat = await vscode.workspace.fs.stat(vscode.Uri.file(p));
                if (stat.type === vscode.FileType.File) {
                    filePathsOnly.push(p);
                }
            } catch { /* пропускаем недоступные пути */ }
        }

        const totalFiles = filePathsOnly.length;
        const projectName = path.basename(this.workspaceRoot);
        const now = new Date();
        const divider = '═'.repeat(72);
        const thinDivider = '─'.repeat(72);

        // --- 1. Построение дерева ---
        onProgress({ message: 'Построение дерева файлов...' });
        const fileTree = buildFileTree(filePathsOnly, this.workspaceRoot);

        // --- 2. Сбор содержимого файлов ---
        let filesSection = '';
        let totalChars = 0;
        let skippedBinary = 0;
        let processedFiles = 0;
        let cancelled = false;

        for (let i = 0; i < totalFiles; i++) {
            if (this._cancelled) {
                cancelled = true;
                filesSection += `\n[!] Сбор прерван пользователем на файле ${i + 1} из ${totalFiles}\n`;
                break;
            }

            const filePath = filePathsOnly[i];
            const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
            onProgress({ message: `(${i + 1}/${totalFiles}) ${relativePath}` });

            try {
                const uri = vscode.Uri.file(filePath);
                const contentBytes = await vscode.workspace.fs.readFile(uri);

                if (this.isBinaryContent(contentBytes)) {
                    skippedBinary++;
                    continue;
                }

                const content = new TextDecoder('utf-8').decode(contentBytes);
                const lang = getLanguageId(relativePath);
                totalChars += content.length;
                processedFiles++;

                filesSection += `${thinDivider}\n`;
                filesSection += `  📄 ${relativePath}\n`;
                filesSection += `${thinDivider}\n`;
                filesSection += `\`\`\`${lang}\n`;
                filesSection += content;
                if (!content.endsWith('\n')) { filesSection += '\n'; }
                filesSection += '```\n\n';

            } catch (error: any) {
                filesSection += `${thinDivider}\n`;
                filesSection += `  ⚠ ${relativePath}\n`;
                filesSection += `${thinDivider}\n`;
                filesSection += `[ОШИБКА ЧТЕНИЯ: ${error.message}]\n\n`;
            }
        }

        const elapsedMs = Date.now() - startTime;
        const estimatedTokens = Math.round(totalChars / 4);

        // --- Заголовок ---
        const binaryNote = skippedBinary > 0 ? ` · бинарных пропущено: ${skippedBinary}` : '';
        const header = [
            divider,
            `  ██████╗  ACTO SNAPSHOT`,
            `  ██╔══██╗ ${formatDateTime(now)}`,
            `  ██████╔╝`,
            `  ██╔══██╗ Проект : ${projectName}`,
            `  ██║  ██║ Файлов : ${processedFiles} из ${totalFiles}${binaryNote}`,
            `  ╚═════╝  Токенов: ~${formatTokenCount(estimatedTokens)}  (символов: ${formatNumber(totalChars)})`,
            divider,
            '',
        ].join('\n');

        // --- Структура ---
        const structureSection = [
            'СТРУКТУРА ПРОЕКТА',
            divider,
            `${projectName}/`,
            generateAsciiTree(fileTree).trimEnd(),
            '',
        ].join('\n');

        // --- Содержимое ---
        const contentHeader = [
            '',
            'СОДЕРЖИМОЕ ФАЙЛОВ',
            divider,
            '',
        ].join('\n');

        // --- Подвал ---
        const footer = cancelled ? '' : [
            '',
            divider,
            `  Итого: ${processedFiles} файл(ов)  ·  ${formatNumber(totalChars)} символов  ·  ~${formatTokenCount(estimatedTokens)} токенов`,
            divider,
        ].join('\n');

        const report = header + structureSection + contentHeader + filesSection + footer;

        const stats: ParseStats = {
            totalFiles,
            processedFiles,
            skippedBinary,
            totalChars,
            estimatedTokens,
            elapsedMs,
        };

        return { report: report.trimEnd() + '\n', stats, cancelled };
    }
}
