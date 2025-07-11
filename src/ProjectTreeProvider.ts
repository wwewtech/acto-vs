import * as vscode from 'vscode';
import * as path from 'path';
import { FileNode } from './core/types';

export class ProjectTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined | null | void> = new vscode.EventEmitter<FileNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private checkedItems = new Set<string>();

  constructor(private workspaceRoot: string | undefined) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.name, element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    
    treeItem.resourceUri = vscode.Uri.file(element.path);
    treeItem.id = element.path;

    // Самое важное: устанавливаем состояние чекбокса
    treeItem.checkboxState = this.checkedItems.has(element.path) 
        ? vscode.TreeItemCheckboxState.Checked 
        : vscode.TreeItemCheckboxState.Unchecked;

    return treeItem;
  }

  async getChildren(element?: FileNode): Promise<FileNode[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('Нет открытой папки в рабочем пространстве');
      return [];
    }

    const currentPath = element ? element.path : this.workspaceRoot;
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    
    const nodes: FileNode[] = [];
    for (const [name, type] of entries) {
        const fullPath = path.join(currentPath, name);
        nodes.push({
            name,
            path: fullPath,
            isDirectory: type === vscode.FileType.Directory,
        });
    }
    return nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));
  }

  // Новые методы для работы с чекбоксами
  toggleCheckbox(item: FileNode): void {
    if (this.checkedItems.has(item.path)) {
        this.checkedItems.delete(item.path);
    } else {
        this.checkedItems.add(item.path);
    }
    this._onDidChangeTreeData.fire();
  }

  getCheckedItems(): string[] {
    return Array.from(this.checkedItems);
  }

  public async selectAll() {
    if (!this.workspaceRoot) return;
    const walk = async (dir: string) => {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
      for (const [name, type] of entries) {
        const fullPath = path.join(dir, name);
        if (type === vscode.FileType.Directory) {
          await walk(fullPath);
        } else {
          this.checkedItems.add(fullPath);
        }
      }
    };
    await walk(this.workspaceRoot);
    this.refresh();
  }

  public deselectAll() {
    this.checkedItems.clear();
    this.refresh();
  }
} 