// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ProjectTreeProvider } from './ProjectTreeProvider';
import { FileNode } from './core/types';
import { ActoParser } from './core/parser';

let globalParser: ActoParser | null = null;

export function activate(context: vscode.ExtensionContext) {

    console.log('Расширение "ACTO" активировано!');

    // 1. Создаем и регистрируем TreeDataProvider
    const rootPath = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : undefined;

    const projectTreeProvider = new ProjectTreeProvider(rootPath);
    const treeView = vscode.window.createTreeView('acto-project-tree', {
        treeDataProvider: projectTreeProvider,
        canSelectMany: true
    });

    let pauseCmdDisposable: vscode.Disposable | null = null;
    let resumeCmdDisposable: vscode.Disposable | null = null;
    let stopCmdDisposable: vscode.Disposable | null = null;

    // 2. Регистрируем команду для парсинга
    const parseCommand = vscode.commands.registerCommand('acto.parseSelected', async () => {
        const checkedFiles = projectTreeProvider.getCheckedItems();

        if (checkedFiles.length === 0) {
            vscode.window.showInformationMessage('Не выбрано ни одного файла для парсинга.');
            return;
        }

        if (!rootPath) {
            vscode.window.showErrorMessage('Не удалось определить корневую папку проекта.');
            return;
        }

        // === Регистрируем команды паузы/остановки только на время парсинга ===
        pauseCmdDisposable = vscode.commands.registerCommand('acto.pauseParsing', () => {
            if (globalParser) {
                vscode.window.showInformationMessage('Парсинг приостановлен (заглушка, функция не реализована).');
            }
        });
        resumeCmdDisposable = vscode.commands.registerCommand('acto.resumeParsing', () => {
            if (globalParser) {
                vscode.window.showInformationMessage('Парсинг возобновлен (заглушка, функция не реализована).');
            }
        });
        stopCmdDisposable = vscode.commands.registerCommand('acto.stopParsing', () => {
            if (globalParser) {
                vscode.window.showInformationMessage('Парсинг остановлен (заглушка, функция не реализована).');
            }
        });
        context.subscriptions.push(pauseCmdDisposable, resumeCmdDisposable, stopCmdDisposable);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'ACTO: Запущен парсинг...',
            cancellable: false
        }, async (progress) => {
            globalParser = new ActoParser(checkedFiles, rootPath);
            const result = await globalParser.run((message) => {
                progress.report({ message: String(message) });
            });

            // === Сохраняем результат в output.txt ===
            const outputPath = require('path').join(rootPath, 'output.txt');
            const fs = require('fs');
            fs.writeFileSync(outputPath, result, { encoding: 'utf8' });

            // Открываем сохранённый файл в редакторе
            const doc = await vscode.workspace.openTextDocument(outputPath);
            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
            globalParser = null;
        });

        // === После завершения парсинга удаляем команды ===
        pauseCmdDisposable?.dispose();
        resumeCmdDisposable?.dispose();
        stopCmdDisposable?.dispose();
        pauseCmdDisposable = null;
        resumeCmdDisposable = null;
        stopCmdDisposable = null;

        vscode.window.showInformationMessage('Парсинг успешно завершен!');
    });
    
    // 3. Регистрируем команду для клика по чекбоксу
    const toggleCommand = vscode.commands.registerCommand('acto.toggleCheckbox', (item: FileNode) => {
        projectTreeProvider.toggleCheckbox(item);
    });

    // 4. Регистрируем команды для выделения/снятия всех файлов
    const selectAllCmd = vscode.commands.registerCommand('acto.selectAll', async () => {
        await projectTreeProvider.selectAll();
    });
    const deselectAllCmd = vscode.commands.registerCommand('acto.deselectAll', () => {
        projectTreeProvider.deselectAll();
    });

    context.subscriptions.push(treeView, parseCommand, toggleCommand, selectAllCmd, deselectAllCmd);
}

export function deactivate() {}
