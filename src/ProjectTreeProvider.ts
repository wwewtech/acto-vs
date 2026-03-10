import * as vscode from 'vscode';
import * as path from 'path';
import { FileNode } from './core/types';

function getIgnoredNames(): Set<string> {
    const cfg = vscode.workspace.getConfiguration('acto');
    const list: string[] = cfg.get('ignoredNames') ?? [];
    return new Set(list);
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Fires with the current total count of checked items whenever selection changes. */
  private _onSelectionChanged = new vscode.EventEmitter<number>();
  readonly onSelectionChanged = this._onSelectionChanged.event;

  private checkedItems = new Set<string>();
  private checkedDirs = new Set<string>();

  constructor(private workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private _fireSelectionChanged(): void {
    // Count only files (total minus dirs)
    this._onSelectionChanged.fire(this.checkedItems.size - this.checkedDirs.size);
  }

  /** Returns the number of checked files (directories excluded). */
  getCheckedFilesCount(): number {
    return this.checkedItems.size - this.checkedDirs.size;
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
        element.name,
        element.isDirectory
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
    );
    treeItem.resourceUri = vscode.Uri.file(element.path);
    treeItem.id = element.path;
    treeItem.contextValue = element.isDirectory ? 'folder' : 'file';
    treeItem.checkboxState = this.checkedItems.has(element.path)
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;

    const relativePath = this.workspaceRoot
        ? path.relative(this.workspaceRoot, element.path).replace(/\\/g, '/')
        : element.path;

    if (!element.isDirectory) {
        // Single-click opens the file in editor
        treeItem.command = {
            command: 'vscode.open',
            title: 'Открыть файл',
            arguments: [vscode.Uri.file(element.path)],
        };
        const tooltip = new vscode.MarkdownString(`**${element.name}**\n\n$(file) \`${relativePath}\``, true);
        tooltip.isTrusted = true;
        treeItem.tooltip = tooltip;
    } else {
        const tooltip = new vscode.MarkdownString(`**${element.name}/**\n\n$(folder) \`${relativePath}/\``, true);
        tooltip.isTrusted = true;
        treeItem.tooltip = tooltip;
    }

    return treeItem;
  }

  async getChildren(element?: FileNode): Promise<FileNode[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('Нет открытой папки в рабочем пространстве');
      return [];
    }

    const currentPath = element ? element.path : this.workspaceRoot;
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    const ignoredNames = getIgnoredNames();

    const nodes: FileNode[] = [];
    for (const [name, type] of entries) {
        if (ignoredNames.has(name)) { continue; }
        const fullPath = path.join(currentPath, name);
        nodes.push({
            name,
            path: fullPath,
            isDirectory: type === vscode.FileType.Directory,
        });
    }
    return nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));
  }

  toggleCheckbox(item: FileNode): void {
    if (this.checkedItems.has(item.path)) {
        this.checkedItems.delete(item.path);
        if (item.isDirectory) { this.checkedDirs.delete(item.path); }
    } else {
        this.checkedItems.add(item.path);
        if (item.isDirectory) { this.checkedDirs.add(item.path); }
    }
    this._onDidChangeTreeData.fire();
    this._fireSelectionChanged();
  }

  /** Каскадно устанавливает чекбокс для элемента и всех его дочерних файлов. */
  async setCascade(item: FileNode, checked: boolean): Promise<void> {
    if (item.isDirectory) {
        await this._walkAndSet(item.path, checked);
        if (checked) {
            this.checkedItems.add(item.path);
            this.checkedDirs.add(item.path);
        } else {
            this.checkedItems.delete(item.path);
            this.checkedDirs.delete(item.path);
        }
    } else {
        if (checked) {
            this.checkedItems.add(item.path);
        } else {
            this.checkedItems.delete(item.path);
        }
    }
    this._onDidChangeTreeData.fire();
    this._fireSelectionChanged();
  }

  private async _walkAndSet(dir: string, checked: boolean): Promise<void> {
    const ignoredNames = getIgnoredNames();
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [name, type] of entries) {
        if (ignoredNames.has(name)) { continue; }
        const fullPath = path.join(dir, name);
        if (type === vscode.FileType.Directory) {
            if (checked) {
                this.checkedItems.add(fullPath);
                this.checkedDirs.add(fullPath);
            } else {
                this.checkedItems.delete(fullPath);
                this.checkedDirs.delete(fullPath);
            }
            await this._walkAndSet(fullPath, checked);
        } else {
            if (checked) { this.checkedItems.add(fullPath); } else { this.checkedItems.delete(fullPath); }
        }
    }
  }

  getCheckedItems(): string[] {
    return Array.from(this.checkedItems);
  }

  public async selectAll(): Promise<void> {
    if (!this.workspaceRoot) { return; }
    await this._walkAndSet(this.workspaceRoot, true);
    this.refresh();
    this._fireSelectionChanged();
  }

  public deselectAll(): void {
    this.checkedItems.clear();
    this.checkedDirs.clear();
    this.refresh();
    this._fireSelectionChanged();
  }
}