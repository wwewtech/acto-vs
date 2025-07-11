"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode3 = __toESM(require("vscode"));

// src/ProjectTreeProvider.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var ProjectTreeProvider = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  checkedItems = /* @__PURE__ */ new Set();
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    const treeItem = new vscode.TreeItem(element.name, element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = vscode.Uri.file(element.path);
    treeItem.id = element.path;
    treeItem.checkboxState = this.checkedItems.has(element.path) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    return treeItem;
  }
  async getChildren(element) {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("\u041D\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u043F\u0430\u043F\u043A\u0438 \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u043C \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435");
      return [];
    }
    const currentPath = element ? element.path : this.workspaceRoot;
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    const nodes = [];
    for (const [name, type] of entries) {
      const fullPath = path.join(currentPath, name);
      nodes.push({
        name,
        path: fullPath,
        isDirectory: type === vscode.FileType.Directory
      });
    }
    return nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));
  }
  // Новые методы для работы с чекбоксами
  toggleCheckbox(item) {
    if (this.checkedItems.has(item.path)) {
      this.checkedItems.delete(item.path);
    } else {
      this.checkedItems.add(item.path);
    }
    this._onDidChangeTreeData.fire();
  }
  getCheckedItems() {
    return Array.from(this.checkedItems);
  }
  async selectAll() {
    if (!this.workspaceRoot) return;
    const walk = async (dir) => {
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
  deselectAll() {
    this.checkedItems.clear();
    this.refresh();
  }
};

// src/core/parser.ts
var vscode2 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));
function buildFileTree(paths, rootPath) {
  const tree = {};
  for (const p of paths) {
    const relativePath = path2.relative(rootPath, p);
    const parts = relativePath.split(path2.sep);
    let currentLevel = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (!currentLevel[part]) {
        currentLevel[part] = isLast ? null : {};
      }
      currentLevel = currentLevel[part];
    }
  }
  return tree;
}
function generateAsciiTree(node, prefix = "") {
  let result = "";
  const entries = Object.keys(node);
  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const newPrefix = prefix + (isLast ? "    " : "\u2502   ");
    result += prefix + connector + entry + "\n";
    if (node[entry] !== null) {
      result += generateAsciiTree(node[entry], newPrefix);
    }
  });
  return result;
}
var ActoParser = class {
  constructor(filesToParse, workspaceRoot) {
    this.filesToParse = filesToParse;
    this.workspaceRoot = workspaceRoot;
  }
  // Список расширений, которые считаем текстовыми. Можно расширить.
  textFileExtensions = /* @__PURE__ */ new Set([
    ".py",
    ".html",
    ".css",
    ".js",
    ".json",
    ".txt",
    ".md",
    ".xml",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
    ".gitignore",
    ".dockerfile"
  ]);
  // Папки и файлы, которые нужно полностью игнорировать
  ignorePatterns = ["__pycache__", ".git", "node_modules", ".vscode", "dist", "out", "output.txt", ".DS_Store"];
  /**
   * Проверяет, является ли файл текстовым на основе расширения.
   * Это простая, но быстрая проверка.
   */
  isTextFile(filePath) {
    const ext = path2.extname(filePath).toLowerCase();
    return ext === "" || this.textFileExtensions.has(ext);
  }
  /**
   * Фильтрует файлы по ignore-листу.
   */
  filterFiles(files) {
    return files.filter((file) => {
      const parts = file.split(path2.sep);
      return !parts.some((part) => this.ignorePatterns.includes(part));
    });
  }
  async run(onProgress) {
    onProgress({ message: "\u0424\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432..." });
    const filteredFiles = this.filterFiles(this.filesToParse);
    onProgress({ message: "\u041F\u043E\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u0435 \u0434\u0435\u0440\u0435\u0432\u0430 \u0444\u0430\u0439\u043B\u043E\u0432..." });
    const fileTree = buildFileTree(filteredFiles, this.workspaceRoot);
    const projectName = path2.basename(this.workspaceRoot);
    let report = `\u0421\u0422\u0420\u0423\u041A\u0422\u0423\u0420\u0410 \u041F\u0420\u041E\u0415\u041A\u0422\u0410
===================
`;
    report += `${projectName}
`;
    report += generateAsciiTree(fileTree);
    report += `

\u0421\u041E\u0414\u0415\u0420\u0416\u0418\u041C\u041E\u0415 \u0424\u0410\u0419\u041B\u041E\u0412
===================

`;
    const totalFiles = filteredFiles.length;
    for (let i = 0; i < totalFiles; i++) {
      const filePath = filteredFiles[i];
      const relativePath = path2.relative(this.workspaceRoot, filePath);
      onProgress({ message: `\u0427\u0442\u0435\u043D\u0438\u0435 \u0444\u0430\u0439\u043B\u0430: ${relativePath} (${i + 1}/${totalFiles})` });
      if (!this.isTextFile(filePath)) {
        continue;
      }
      try {
        const uri = vscode2.Uri.file(filePath);
        const contentBytes = await vscode2.workspace.fs.readFile(uri);
        const content = new TextDecoder("utf-8").decode(contentBytes);
        report += `--- \u0424\u0430\u0439\u043B: ${relativePath.replace(/\\/g, "/")} ---
`;
        report += "```\n";
        report += content;
        if (!content.endsWith("\n")) {
          report += "\n";
        }
        report += "```\n\n";
      } catch (error) {
        report += `--- \u0424\u0430\u0439\u043B: ${relativePath.replace(/\\/g, "/")} ---
`;
        report += `[\u041D\u0415 \u0423\u0414\u0410\u041B\u041E\u0421\u042C \u041F\u0420\u041E\u0427\u0418\u0422\u0410\u0422\u042C \u0424\u0410\u0419\u041B: ${error.message}]

`;
      }
    }
    return report.trimEnd() + "\n";
  }
};

// src/extension.ts
var globalParser = null;
function activate(context) {
  console.log('\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 "ACTO" \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u043E!');
  const rootPath = vscode3.workspace.workspaceFolders && vscode3.workspace.workspaceFolders.length > 0 ? vscode3.workspace.workspaceFolders[0].uri.fsPath : void 0;
  const projectTreeProvider = new ProjectTreeProvider(rootPath);
  const treeView = vscode3.window.createTreeView("acto-project-tree", {
    treeDataProvider: projectTreeProvider,
    canSelectMany: true
  });
  let pauseCmdDisposable = null;
  let resumeCmdDisposable = null;
  let stopCmdDisposable = null;
  const parseCommand = vscode3.commands.registerCommand("acto.parseSelected", async () => {
    const checkedFiles = projectTreeProvider.getCheckedItems();
    if (checkedFiles.length === 0) {
      vscode3.window.showInformationMessage("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430 \u0434\u043B\u044F \u043F\u0430\u0440\u0441\u0438\u043D\u0433\u0430.");
      return;
    }
    if (!rootPath) {
      vscode3.window.showErrorMessage("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043A\u043E\u0440\u043D\u0435\u0432\u0443\u044E \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.");
      return;
    }
    pauseCmdDisposable = vscode3.commands.registerCommand("acto.pauseParsing", () => {
      if (globalParser) {
        vscode3.window.showInformationMessage("\u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u043F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D (\u0437\u0430\u0433\u043B\u0443\u0448\u043A\u0430, \u0444\u0443\u043D\u043A\u0446\u0438\u044F \u043D\u0435 \u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u0430).");
      }
    });
    resumeCmdDisposable = vscode3.commands.registerCommand("acto.resumeParsing", () => {
      if (globalParser) {
        vscode3.window.showInformationMessage("\u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u0432\u043E\u0437\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D (\u0437\u0430\u0433\u043B\u0443\u0448\u043A\u0430, \u0444\u0443\u043D\u043A\u0446\u0438\u044F \u043D\u0435 \u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u0430).");
      }
    });
    stopCmdDisposable = vscode3.commands.registerCommand("acto.stopParsing", () => {
      if (globalParser) {
        vscode3.window.showInformationMessage("\u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D (\u0437\u0430\u0433\u043B\u0443\u0448\u043A\u0430, \u0444\u0443\u043D\u043A\u0446\u0438\u044F \u043D\u0435 \u0440\u0435\u0430\u043B\u0438\u0437\u043E\u0432\u0430\u043D\u0430).");
      }
    });
    context.subscriptions.push(pauseCmdDisposable, resumeCmdDisposable, stopCmdDisposable);
    await vscode3.window.withProgress({
      location: vscode3.ProgressLocation.Notification,
      title: "ACTO: \u0417\u0430\u043F\u0443\u0449\u0435\u043D \u043F\u0430\u0440\u0441\u0438\u043D\u0433...",
      cancellable: false
    }, async (progress) => {
      globalParser = new ActoParser(checkedFiles, rootPath);
      const result = await globalParser.run((message) => {
        progress.report({ message: String(message) });
      });
      const outputPath = require("path").join(rootPath, "output.txt");
      const fs = require("fs");
      fs.writeFileSync(outputPath, result, { encoding: "utf8" });
      const doc = await vscode3.workspace.openTextDocument(outputPath);
      await vscode3.window.showTextDocument(doc, { viewColumn: vscode3.ViewColumn.Beside, preview: false });
      globalParser = null;
    });
    pauseCmdDisposable?.dispose();
    resumeCmdDisposable?.dispose();
    stopCmdDisposable?.dispose();
    pauseCmdDisposable = null;
    resumeCmdDisposable = null;
    stopCmdDisposable = null;
    vscode3.window.showInformationMessage("\u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D!");
  });
  const toggleCommand = vscode3.commands.registerCommand("acto.toggleCheckbox", (item) => {
    projectTreeProvider.toggleCheckbox(item);
  });
  const selectAllCmd = vscode3.commands.registerCommand("acto.selectAll", async () => {
    await projectTreeProvider.selectAll();
  });
  const deselectAllCmd = vscode3.commands.registerCommand("acto.deselectAll", () => {
    projectTreeProvider.deselectAll();
  });
  context.subscriptions.push(treeView, parseCommand, toggleCommand, selectAllCmd, deselectAllCmd);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
