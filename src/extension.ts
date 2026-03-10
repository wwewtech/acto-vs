import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectTreeProvider } from './ProjectTreeProvider';
import { FileNode, ParseResult } from './core/types';
import { ActoParser, formatTokenCount } from './core/parser';

let globalParser: ActoParser | null = null;

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: unknown[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}

export function activate(context: vscode.ExtensionContext) {

    console.log('Расширение "ACTO" активировано!');

    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const projectTreeProvider = new ProjectTreeProvider(rootPath);
    const treeView = vscode.window.createTreeView('acto-project-tree', {
        treeDataProvider: projectTreeProvider,
        canSelectMany: false,
        showCollapseAll: true,
    });

    // --- Status bar ---
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    statusBar.command = 'acto.parseSelected';
    statusBar.name = 'ACTO';

    function updateStatusBar(fileCount: number): void {
        if (fileCount === 0) {
            statusBar.text = '$(file-code) ACTO';
            statusBar.tooltip = 'ACTO: нет выбранных файлов';
            statusBar.backgroundColor = undefined;
        } else {
            statusBar.text = `$(file-code) ACTO  $(check) ${fileCount}`;
            statusBar.tooltip = `ACTO: выбрано файлов — ${fileCount}\nНажмите для парсинга`;
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.activeBackground');
        }
        treeView.badge = fileCount > 0
            ? { value: fileCount, tooltip: `${fileCount} файл(ов) выбрано` }
            : undefined;
        vscode.commands.executeCommand('setContext', 'acto.hasSelection', fileCount > 0);
    }

    statusBar.show();
    updateStatusBar(0);

    // Обновляем статус-бар при изменении выбора
    context.subscriptions.push(
        projectTreeProvider.onSelectionChanged(count => updateStatusBar(count))
    );

    // --- Авто-обновление дерева при изменении ФС ---
    if (rootPath) {
        const fsWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(rootPath, '**/*')
        );
        const debouncedRefresh = debounce(() => projectTreeProvider.refresh(), 600);
        context.subscriptions.push(
            fsWatcher,
            fsWatcher.onDidCreate(debouncedRefresh),
            fsWatcher.onDidDelete(debouncedRefresh),
        );
    }

    // --- Вспомогательная функция запуска парсера ---
    async function runParser(
        progress: vscode.Progress<{ message?: string }>,
        checkedFiles: string[],
        ignoredNames: string[]
    ): Promise<ParseResult> {
        if (!rootPath) { throw new Error('Корневая папка не определена'); }
        globalParser = new ActoParser(checkedFiles, rootPath, ignoredNames);
        const result = await globalParser.run(p => progress.report({ message: p.message }));
        globalParser = null;
        return result;
    }

    // --- Обрабатываем нативные клики по чекбоксам VS Code ---
    treeView.onDidChangeCheckboxState(async (e) => {
        for (const [item, state] of e.items) {
            const checked = state === vscode.TreeItemCheckboxState.Checked;
            await projectTreeProvider.setCascade(item as FileNode, checked);
        }
    });

    // --- Команда: парсить и сохранить в файл ---
    const parseCommand = vscode.commands.registerCommand('acto.parseSelected', async () => {
        const checkedFiles = projectTreeProvider.getCheckedItems();

        if (checkedFiles.length === 0) {
            vscode.window.showWarningMessage('Не выбрано ни одного файла. Отметьте нужные файлы в дереве.');
            return;
        }
        if (!rootPath) {
            vscode.window.showErrorMessage('Не удалось определить корневую папку проекта.');
            return;
        }

        const ignoredNames: string[] = vscode.workspace.getConfiguration('acto').get('ignoredNames') ?? [];
        await vscode.commands.executeCommand('setContext', 'acto.isParsing', true);

        let parseResult: ParseResult | undefined;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'ACTO',
                cancellable: false,
            }, async (progress) => {
                parseResult = await runParser(progress, checkedFiles, ignoredNames);
            });
        } finally {
            await vscode.commands.executeCommand('setContext', 'acto.isParsing', false);
            globalParser = null;
        }

        if (!parseResult) { return; }
        const { report, stats, cancelled } = parseResult;

        const outputPath = path.join(rootPath, 'output.txt');
        fs.writeFileSync(outputPath, report, { encoding: 'utf8' });

        const doc = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });

        if (cancelled) {
            vscode.window.showWarningMessage('Парсинг остановлен. Частичный результат сохранён в output.txt.');
        } else {
            const msg = `$(check-all) ${stats.processedFiles} файл(ов)  ·  ~${formatTokenCount(stats.estimatedTokens)} токенов`;
            vscode.window.showInformationMessage(msg, 'Скопировать').then(action => {
                if (action === 'Скопировать') {
                    vscode.env.clipboard.writeText(report);
                    vscode.window.showInformationMessage('$(clippy) Скопировано в буфер обмена!');
                }
            });
        }
    });

    // --- Команда: скопировать отчёт в буфер обмена ---
    const copyToClipboardCmd = vscode.commands.registerCommand('acto.copyToClipboard', async () => {
        const checkedFiles = projectTreeProvider.getCheckedItems();

        if (checkedFiles.length === 0) {
            vscode.window.showWarningMessage('Не выбрано ни одного файла.');
            return;
        }
        if (!rootPath) { return; }

        const ignoredNames: string[] = vscode.workspace.getConfiguration('acto').get('ignoredNames') ?? [];
        await vscode.commands.executeCommand('setContext', 'acto.isParsing', true);

        let parseResult: ParseResult | undefined;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'ACTO: Копирование...',
                cancellable: false,
            }, async (progress) => {
                parseResult = await runParser(progress, checkedFiles, ignoredNames);
            });
        } finally {
            await vscode.commands.executeCommand('setContext', 'acto.isParsing', false);
            globalParser = null;
        }

        if (!parseResult) { return; }
        const { report, stats } = parseResult;
        await vscode.env.clipboard.writeText(report);
        vscode.window.showInformationMessage(
            `$(clippy) Скопировано: ${stats.processedFiles} файл(ов)  ·  ~${formatTokenCount(stats.estimatedTokens)} токенов`
        );
    });

    // --- Команда: остановить парсинг ---
    const stopCommand = vscode.commands.registerCommand('acto.stopParsing', () => {
        globalParser?.cancel();
    });

    // --- Команда: переключить чекбокс (legacy) ---
    const toggleCommand = vscode.commands.registerCommand('acto.toggleCheckbox', (item: FileNode) => {
        projectTreeProvider.toggleCheckbox(item);
    });

    // --- Команда: выделить все ---
    const selectAllCmd = vscode.commands.registerCommand('acto.selectAll', async () => {
        await projectTreeProvider.selectAll();
    });

    // --- Команда: снять выделение ---
    const deselectAllCmd = vscode.commands.registerCommand('acto.deselectAll', () => {
        projectTreeProvider.deselectAll();
    });

    // --- Команда: открыть настройки ---
    const openSettingsCmd = vscode.commands.registerCommand('acto.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'acto');
    });

    // --- Команда: обновить дерево ---
    const refreshTreeCmd = vscode.commands.registerCommand('acto.refreshTree', () => {
        projectTreeProvider.refresh();
    });

    // --- Команда: показать в проводнике VS Code ---
    const revealInExplorerCmd = vscode.commands.registerCommand('acto.revealInExplorer', (item: FileNode) => {
        if (item) {
            vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(item.path));
        }
    });

    // --- Команда: добавить в игнорируемые ---
    const addToIgnoredCmd = vscode.commands.registerCommand('acto.addToIgnored', async (item: FileNode) => {
        if (!item) { return; }
        const name = path.basename(item.path);
        const config = vscode.workspace.getConfiguration('acto');
        const current: string[] = config.get('ignoredNames') ?? [];
        if (current.includes(name)) {
            vscode.window.showInformationMessage(`"${name}" уже в списке игнорируемых.`);
            return;
        }
        const target = vscode.workspace.workspaceFolders
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
        await config.update('ignoredNames', [...current, name], target);
        vscode.window.showInformationMessage(`$(eye-closed) "${name}" добавлен в игнорируемые.`);
    });

    // Обновляем дерево при изменении настроек
    const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('acto.ignoredNames')) {
            projectTreeProvider.refresh();
        }
    });

    context.subscriptions.push(
        treeView,
        statusBar,
        parseCommand,
        copyToClipboardCmd,
        stopCommand,
        toggleCommand,
        selectAllCmd,
        deselectAllCmd,
        openSettingsCmd,
        refreshTreeCmd,
        revealInExplorerCmd,
        addToIgnoredCmd,
        configWatcher,
    );
}

export function deactivate() {}


