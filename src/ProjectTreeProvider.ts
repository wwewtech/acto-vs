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

  private checkedFiles = new Set<string>();
  private dirTotalFiles = new Map<string, number>();
  private dirCheckedFiles = new Map<string, number>();
  private dirStatsBuilt = false;

  constructor(private workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private _fireSelectionChanged(): void {
    this._onSelectionChanged.fire(this.checkedFiles.size);
  }

  /** Returns the number of checked files (directories excluded). */
  getCheckedFilesCount(): number {
    return this.checkedFiles.size;
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
    if (element.isDirectory) {
      const { checked, total } = this._getDirCounts(element.path);
      treeItem.checkboxState = this._getDirCheckboxState(element.path);
      if (total > 0 && checked > 0 && checked < total) {
        treeItem.description = `${checked}/${total}`;
      }
    } else {
      treeItem.checkboxState = this.checkedFiles.has(element.path)
        ? vscode.TreeItemCheckboxState.Checked
        : vscode.TreeItemCheckboxState.Unchecked;
    }

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

  async toggleCheckbox(item: FileNode): Promise<void> {
    await this.ensureDirStats();
    const isChecked = item.isDirectory
        ? this._getDirCheckboxState(item.path) === vscode.TreeItemCheckboxState.Checked
        : this.checkedFiles.has(item.path);
    await this.setCascade(item, !isChecked);
  }

  /** Каскадно устанавливает чекбокс для элемента и всех его дочерних файлов. */
  async setCascade(item: FileNode, checked: boolean): Promise<void> {
    await this.ensureDirStats();
    if (item.isDirectory) {
      const result = await this._walkAndSet(item.path, checked);
      const delta = checked ? result.changedFiles : -result.changedFiles;
      if (delta !== 0) { this._updateAncestorCheckedCounts(item.path, delta); }
    } else {
      const delta = this._setFileChecked(item.path, checked);
      if (delta !== 0) { this._updateAncestorCheckedCounts(item.path, delta); }
    }
    this._onDidChangeTreeData.fire();
    this._fireSelectionChanged();
  }

    private async _walkAndSet(dir: string, checked: boolean): Promise<{ totalFiles: number; changedFiles: number }> {
    const ignoredNames = getIgnoredNames();
    let totalFiles = 0;
    let changedFiles = 0;
    let entries: [string, vscode.FileType][] = [];
    try {
      entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    } catch {
      return { totalFiles, changedFiles };
    }

    for (const [name, type] of entries) {
      if (ignoredNames.has(name)) { continue; }
      const fullPath = path.join(dir, name);
      if (type === vscode.FileType.Directory) {
        const result = await this._walkAndSet(fullPath, checked);
        totalFiles += result.totalFiles;
        changedFiles += result.changedFiles;
        this.dirTotalFiles.set(fullPath, result.totalFiles);
        this.dirCheckedFiles.set(fullPath, checked ? result.totalFiles : 0);
      } else if (type === vscode.FileType.File) {
        totalFiles++;
        const delta = this._setFileChecked(fullPath, checked);
        if (delta !== 0) { changedFiles += 1; }
      }
    }

    this.dirTotalFiles.set(dir, totalFiles);
    this.dirCheckedFiles.set(dir, checked ? totalFiles : 0);
    return { totalFiles, changedFiles };
  }

  getCheckedItems(): string[] {
    return Array.from(this.checkedFiles);
  }

  public async selectAll(): Promise<void> {
    if (!this.workspaceRoot) { return; }
    await this.ensureDirStats();
    await this._walkAndSet(this.workspaceRoot, true);
    this.refresh();
    this._fireSelectionChanged();
  }

  public deselectAll(): void {
    this.checkedFiles.clear();
    if (this.dirCheckedFiles.size > 0) {
        for (const key of this.dirCheckedFiles.keys()) {
            this.dirCheckedFiles.set(key, 0);
        }
    }
    this.refresh();
    this._fireSelectionChanged();
  }

  public invalidateDirStats(): void {
    this.dirTotalFiles.clear();
    this.dirCheckedFiles.clear();
    this.dirStatsBuilt = false;
  }

  private _getDirCheckboxState(dirPath: string): vscode.TreeItemCheckboxState {
    const total = this.dirTotalFiles.get(dirPath) ?? 0;
    const checked = this.dirCheckedFiles.get(dirPath) ?? 0;
    if (total === 0 || checked === 0) { return vscode.TreeItemCheckboxState.Unchecked; }
    if (checked >= total) { return vscode.TreeItemCheckboxState.Checked; }
    return vscode.TreeItemCheckboxState.Unchecked;
  }

  private _getDirCounts(dirPath: string): { checked: number; total: number } {
    return {
        checked: this.dirCheckedFiles.get(dirPath) ?? 0,
        total: this.dirTotalFiles.get(dirPath) ?? 0,
    };
  }

  private async ensureDirStats(): Promise<void> {
    if (this.dirStatsBuilt || !this.workspaceRoot) { return; }
    await this._buildDirStats(this.workspaceRoot);
    this.dirStatsBuilt = true;
  }

  private async _buildDirStats(dir: string): Promise<{ totalFiles: number; checkedFiles: number }> {
    const ignoredNames = getIgnoredNames();
    let entries: [string, vscode.FileType][] = [];
    try {
        entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    } catch {
        this.dirTotalFiles.set(dir, 0);
        this.dirCheckedFiles.set(dir, 0);
        return { totalFiles: 0, checkedFiles: 0 };
    }

    let totalFiles = 0;
    let checkedFiles = 0;
    for (const [name, type] of entries) {
        if (ignoredNames.has(name)) { continue; }
        const fullPath = path.join(dir, name);
        if (type === vscode.FileType.Directory) {
            const result = await this._buildDirStats(fullPath);
            totalFiles += result.totalFiles;
            checkedFiles += result.checkedFiles;
        } else if (type === vscode.FileType.File) {
            totalFiles++;
            if (this.checkedFiles.has(fullPath)) { checkedFiles++; }
        }
    }
    this.dirTotalFiles.set(dir, totalFiles);
    this.dirCheckedFiles.set(dir, checkedFiles);
    return { totalFiles, checkedFiles };
  }

  private _setFileChecked(filePath: string, checked: boolean): number {
    const hasFile = this.checkedFiles.has(filePath);
    if (checked && !hasFile) {
        this.checkedFiles.add(filePath);
        return 1;
    }
    if (!checked && hasFile) {
        this.checkedFiles.delete(filePath);
        return -1;
    }
    return 0;
  }

  private _updateAncestorCheckedCounts(startPath: string, delta: number): void {
    if (!this.workspaceRoot || delta === 0) { return; }
    let current = path.dirname(startPath);
    while (true) {
        const rel = path.relative(this.workspaceRoot, current);
        if (rel.startsWith('..') || path.isAbsolute(rel)) { break; }
        const total = this.dirTotalFiles.get(current);
        if (typeof total === 'number') {
            const prev = this.dirCheckedFiles.get(current) ?? 0;
            const next = Math.max(0, Math.min(total, prev + delta));
            this.dirCheckedFiles.set(current, next);
        }
        if (current === this.workspaceRoot) { break; }
        const parent = path.dirname(current);
        if (parent === current) { break; }
        current = parent;
    }
  }
}