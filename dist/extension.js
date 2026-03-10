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
var path3 = __toESM(require("path"));
var fs = __toESM(require("fs"));

// src/ProjectTreeProvider.ts
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
function getIgnoredNames() {
  const cfg = vscode.workspace.getConfiguration("acto");
  const list = cfg.get("ignoredNames") ?? [];
  return new Set(list);
}
var ProjectTreeProvider = class {
  constructor(workspaceRoot) {
    this.workspaceRoot = workspaceRoot;
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  /** Fires with the current total count of checked items whenever selection changes. */
  _onSelectionChanged = new vscode.EventEmitter();
  onSelectionChanged = this._onSelectionChanged.event;
  checkedItems = /* @__PURE__ */ new Set();
  checkedDirs = /* @__PURE__ */ new Set();
  refresh() {
    this._onDidChangeTreeData.fire();
  }
  _fireSelectionChanged() {
    this._onSelectionChanged.fire(this.checkedItems.size - this.checkedDirs.size);
  }
  /** Returns the number of checked files (directories excluded). */
  getCheckedFilesCount() {
    return this.checkedItems.size - this.checkedDirs.size;
  }
  getTreeItem(element) {
    const treeItem = new vscode.TreeItem(
      element.name,
      element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    treeItem.resourceUri = vscode.Uri.file(element.path);
    treeItem.id = element.path;
    treeItem.contextValue = element.isDirectory ? "folder" : "file";
    treeItem.checkboxState = this.checkedItems.has(element.path) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    const relativePath = this.workspaceRoot ? path.relative(this.workspaceRoot, element.path).replace(/\\/g, "/") : element.path;
    if (!element.isDirectory) {
      treeItem.command = {
        command: "vscode.open",
        title: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0444\u0430\u0439\u043B",
        arguments: [vscode.Uri.file(element.path)]
      };
      const tooltip = new vscode.MarkdownString(`**${element.name}**

$(file) \`${relativePath}\``, true);
      tooltip.isTrusted = true;
      treeItem.tooltip = tooltip;
    } else {
      const tooltip = new vscode.MarkdownString(`**${element.name}/**

$(folder) \`${relativePath}/\``, true);
      tooltip.isTrusted = true;
      treeItem.tooltip = tooltip;
    }
    return treeItem;
  }
  async getChildren(element) {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage("\u041D\u0435\u0442 \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u0439 \u043F\u0430\u043F\u043A\u0438 \u0432 \u0440\u0430\u0431\u043E\u0447\u0435\u043C \u043F\u0440\u043E\u0441\u0442\u0440\u0430\u043D\u0441\u0442\u0432\u0435");
      return [];
    }
    const currentPath = element ? element.path : this.workspaceRoot;
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    const ignoredNames = getIgnoredNames();
    const nodes = [];
    for (const [name, type] of entries) {
      if (ignoredNames.has(name)) {
        continue;
      }
      const fullPath = path.join(currentPath, name);
      nodes.push({
        name,
        path: fullPath,
        isDirectory: type === vscode.FileType.Directory
      });
    }
    return nodes.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory));
  }
  toggleCheckbox(item) {
    if (this.checkedItems.has(item.path)) {
      this.checkedItems.delete(item.path);
      if (item.isDirectory) {
        this.checkedDirs.delete(item.path);
      }
    } else {
      this.checkedItems.add(item.path);
      if (item.isDirectory) {
        this.checkedDirs.add(item.path);
      }
    }
    this._onDidChangeTreeData.fire();
    this._fireSelectionChanged();
  }
  /** Каскадно устанавливает чекбокс для элемента и всех его дочерних файлов. */
  async setCascade(item, checked) {
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
  async _walkAndSet(dir, checked) {
    const ignoredNames = getIgnoredNames();
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [name, type] of entries) {
      if (ignoredNames.has(name)) {
        continue;
      }
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
        if (checked) {
          this.checkedItems.add(fullPath);
        } else {
          this.checkedItems.delete(fullPath);
        }
      }
    }
  }
  getCheckedItems() {
    return Array.from(this.checkedItems);
  }
  async selectAll() {
    if (!this.workspaceRoot) {
      return;
    }
    await this._walkAndSet(this.workspaceRoot, true);
    this.refresh();
    this._fireSelectionChanged();
  }
  deselectAll() {
    this.checkedItems.clear();
    this.checkedDirs.clear();
    this.refresh();
    this._fireSelectionChanged();
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
      if (!isLast) {
        currentLevel = currentLevel[part];
      }
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
function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function formatNumber(n) {
  return n.toLocaleString("ru-RU");
}
function formatTokenCount(n) {
  if (n >= 1e6) {
    return `${(n / 1e6).toFixed(1)}M`;
  }
  if (n >= 1e3) {
    return `${(n / 1e3).toFixed(1)}k`;
  }
  return String(n);
}
function getLanguageId(filePath) {
  const ext = path2.extname(filePath).toLowerCase();
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".json": "json",
    ".jsonc": "jsonc",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".md": "markdown",
    ".mdx": "mdx",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".sass": "sass",
    ".less": "less",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".ps1": "powershell",
    ".psm1": "powershell",
    ".sql": "sql",
    ".xml": "xml",
    ".svg": "xml",
    ".vue": "vue",
    ".svelte": "svelte",
    ".php": "php",
    ".rb": "ruby",
    ".swift": "swift",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".dart": "dart",
    ".r": "r",
    ".lua": "lua",
    ".tf": "hcl",
    ".hcl": "hcl",
    ".dockerfile": "dockerfile",
    ".env": "properties",
    ".ini": "ini",
    ".cfg": "ini",
    ".conf": "properties"
  };
  const base = path2.basename(filePath).toLowerCase();
  if (base === "dockerfile") {
    return "dockerfile";
  }
  if (base === "makefile" || base === "makefile.am") {
    return "makefile";
  }
  return map[ext] || "";
}
var ActoParser = class {
  constructor(filesToParse, workspaceRoot, ignoredPatterns = [
    "__pycache__",
    ".git",
    "node_modules",
    ".vscode",
    "dist",
    "out",
    "output.txt",
    ".DS_Store",
    ".next",
    "build",
    "coverage",
    ".nyc_output",
    ".turbo"
  ]) {
    this.filesToParse = filesToParse;
    this.workspaceRoot = workspaceRoot;
    this.ignoredPatterns = ignoredPatterns;
  }
  _cancelled = false;
  cancel() {
    this._cancelled = true;
  }
  /** Проверяет бинарность по первым байтам (null-byte heuristic). */
  isBinaryContent(bytes) {
    const sampleSize = Math.min(bytes.length, 512);
    let nullCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      if (bytes[i] === 0) {
        nullCount++;
      }
    }
    return sampleSize > 0 && nullCount / sampleSize >= 0.1;
  }
  filterFiles(files) {
    return files.filter((file) => {
      const parts = file.split(path2.sep);
      return !parts.some((part) => this.ignoredPatterns.includes(part));
    });
  }
  async run(onProgress) {
    const startTime = Date.now();
    onProgress({ message: "\u0424\u0438\u043B\u044C\u0442\u0440\u0430\u0446\u0438\u044F \u0444\u0430\u0439\u043B\u043E\u0432..." });
    const allPaths = this.filterFiles(this.filesToParse);
    const filePathsOnly = [];
    for (const p of allPaths) {
      try {
        const stat = await vscode2.workspace.fs.stat(vscode2.Uri.file(p));
        if (stat.type === vscode2.FileType.File) {
          filePathsOnly.push(p);
        }
      } catch {
      }
    }
    const totalFiles = filePathsOnly.length;
    const projectName = path2.basename(this.workspaceRoot);
    const now = /* @__PURE__ */ new Date();
    const divider = "\u2550".repeat(72);
    const thinDivider = "\u2500".repeat(72);
    onProgress({ message: "\u041F\u043E\u0441\u0442\u0440\u043E\u0435\u043D\u0438\u0435 \u0434\u0435\u0440\u0435\u0432\u0430 \u0444\u0430\u0439\u043B\u043E\u0432..." });
    const fileTree = buildFileTree(filePathsOnly, this.workspaceRoot);
    let filesSection = "";
    let totalChars = 0;
    let skippedBinary = 0;
    let processedFiles = 0;
    let cancelled = false;
    for (let i = 0; i < totalFiles; i++) {
      if (this._cancelled) {
        cancelled = true;
        filesSection += `
[!] \u0421\u0431\u043E\u0440 \u043F\u0440\u0435\u0440\u0432\u0430\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u043C \u043D\u0430 \u0444\u0430\u0439\u043B\u0435 ${i + 1} \u0438\u0437 ${totalFiles}
`;
        break;
      }
      const filePath = filePathsOnly[i];
      const relativePath = path2.relative(this.workspaceRoot, filePath).replace(/\\/g, "/");
      onProgress({ message: `(${i + 1}/${totalFiles}) ${relativePath}` });
      try {
        const uri = vscode2.Uri.file(filePath);
        const contentBytes = await vscode2.workspace.fs.readFile(uri);
        if (this.isBinaryContent(contentBytes)) {
          skippedBinary++;
          continue;
        }
        const content = new TextDecoder("utf-8").decode(contentBytes);
        const lang = getLanguageId(relativePath);
        totalChars += content.length;
        processedFiles++;
        filesSection += `${thinDivider}
`;
        filesSection += `  \u{1F4C4} ${relativePath}
`;
        filesSection += `${thinDivider}
`;
        filesSection += `\`\`\`${lang}
`;
        filesSection += content;
        if (!content.endsWith("\n")) {
          filesSection += "\n";
        }
        filesSection += "```\n\n";
      } catch (error) {
        filesSection += `${thinDivider}
`;
        filesSection += `  \u26A0 ${relativePath}
`;
        filesSection += `${thinDivider}
`;
        filesSection += `[\u041E\u0428\u0418\u0411\u041A\u0410 \u0427\u0422\u0415\u041D\u0418\u042F: ${error.message}]

`;
      }
    }
    const elapsedMs = Date.now() - startTime;
    const estimatedTokens = Math.round(totalChars / 4);
    const binaryNote = skippedBinary > 0 ? ` \xB7 \u0431\u0438\u043D\u0430\u0440\u043D\u044B\u0445 \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043E: ${skippedBinary}` : "";
    const header = [
      divider,
      `  \u2588\u2588\u2588\u2588\u2588\u2588\u2557  ACTO SNAPSHOT`,
      `  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 ${formatDateTime(now)}`,
      `  \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D`,
      `  \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557 \u041F\u0440\u043E\u0435\u043A\u0442 : ${projectName}`,
      `  \u2588\u2588\u2551  \u2588\u2588\u2551 \u0424\u0430\u0439\u043B\u043E\u0432 : ${processedFiles} \u0438\u0437 ${totalFiles}${binaryNote}`,
      `  \u255A\u2550\u2550\u2550\u2550\u2550\u255D  \u0422\u043E\u043A\u0435\u043D\u043E\u0432: ~${formatTokenCount(estimatedTokens)}  (\u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432: ${formatNumber(totalChars)})`,
      divider,
      ""
    ].join("\n");
    const structureSection = [
      "\u0421\u0422\u0420\u0423\u041A\u0422\u0423\u0420\u0410 \u041F\u0420\u041E\u0415\u041A\u0422\u0410",
      divider,
      `${projectName}/`,
      generateAsciiTree(fileTree).trimEnd(),
      ""
    ].join("\n");
    const contentHeader = [
      "",
      "\u0421\u041E\u0414\u0415\u0420\u0416\u0418\u041C\u041E\u0415 \u0424\u0410\u0419\u041B\u041E\u0412",
      divider,
      ""
    ].join("\n");
    const footer = cancelled ? "" : [
      "",
      divider,
      `  \u0418\u0442\u043E\u0433\u043E: ${processedFiles} \u0444\u0430\u0439\u043B(\u043E\u0432)  \xB7  ${formatNumber(totalChars)} \u0441\u0438\u043C\u0432\u043E\u043B\u043E\u0432  \xB7  ~${formatTokenCount(estimatedTokens)} \u0442\u043E\u043A\u0435\u043D\u043E\u0432`,
      divider
    ].join("\n");
    const report = header + structureSection + contentHeader + filesSection + footer;
    const stats = {
      totalFiles,
      processedFiles,
      skippedBinary,
      totalChars,
      estimatedTokens,
      elapsedMs
    };
    return { report: report.trimEnd() + "\n", stats, cancelled };
  }
};

// src/extension.ts
var globalParser = null;
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
function activate(context) {
  console.log('\u0420\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 "ACTO" \u0430\u043A\u0442\u0438\u0432\u0438\u0440\u043E\u0432\u0430\u043D\u043E!');
  const rootPath = vscode3.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const projectTreeProvider = new ProjectTreeProvider(rootPath);
  const treeView = vscode3.window.createTreeView("acto-project-tree", {
    treeDataProvider: projectTreeProvider,
    canSelectMany: false,
    showCollapseAll: true
  });
  const statusBar = vscode3.window.createStatusBarItem(vscode3.StatusBarAlignment.Right, 90);
  statusBar.command = "acto.parseSelected";
  statusBar.name = "ACTO";
  function updateStatusBar(fileCount) {
    if (fileCount === 0) {
      statusBar.text = "$(file-code) ACTO";
      statusBar.tooltip = "ACTO: \u043D\u0435\u0442 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 \u0444\u0430\u0439\u043B\u043E\u0432";
      statusBar.backgroundColor = void 0;
    } else {
      statusBar.text = `$(file-code) ACTO  $(check) ${fileCount}`;
      statusBar.tooltip = `ACTO: \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u0444\u0430\u0439\u043B\u043E\u0432 \u2014 ${fileCount}
\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u043F\u0430\u0440\u0441\u0438\u043D\u0433\u0430`;
      statusBar.backgroundColor = new vscode3.ThemeColor("statusBarItem.activeBackground");
    }
    treeView.badge = fileCount > 0 ? { value: fileCount, tooltip: `${fileCount} \u0444\u0430\u0439\u043B(\u043E\u0432) \u0432\u044B\u0431\u0440\u0430\u043D\u043E` } : void 0;
    vscode3.commands.executeCommand("setContext", "acto.hasSelection", fileCount > 0);
  }
  statusBar.show();
  updateStatusBar(0);
  context.subscriptions.push(
    projectTreeProvider.onSelectionChanged((count) => updateStatusBar(count))
  );
  if (rootPath) {
    const fsWatcher = vscode3.workspace.createFileSystemWatcher(
      new vscode3.RelativePattern(rootPath, "**/*")
    );
    const debouncedRefresh = debounce(() => projectTreeProvider.refresh(), 600);
    context.subscriptions.push(
      fsWatcher,
      fsWatcher.onDidCreate(debouncedRefresh),
      fsWatcher.onDidDelete(debouncedRefresh)
    );
  }
  async function runParser(progress, checkedFiles, ignoredNames) {
    if (!rootPath) {
      throw new Error("\u041A\u043E\u0440\u043D\u0435\u0432\u0430\u044F \u043F\u0430\u043F\u043A\u0430 \u043D\u0435 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0430");
    }
    globalParser = new ActoParser(checkedFiles, rootPath, ignoredNames);
    const result = await globalParser.run((p) => progress.report({ message: p.message }));
    globalParser = null;
    return result;
  }
  treeView.onDidChangeCheckboxState(async (e) => {
    for (const [item, state] of e.items) {
      const checked = state === vscode3.TreeItemCheckboxState.Checked;
      await projectTreeProvider.setCascade(item, checked);
    }
  });
  const parseCommand = vscode3.commands.registerCommand("acto.parseSelected", async () => {
    const checkedFiles = projectTreeProvider.getCheckedItems();
    if (checkedFiles.length === 0) {
      vscode3.window.showWarningMessage("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430. \u041E\u0442\u043C\u0435\u0442\u044C\u0442\u0435 \u043D\u0443\u0436\u043D\u044B\u0435 \u0444\u0430\u0439\u043B\u044B \u0432 \u0434\u0435\u0440\u0435\u0432\u0435.");
      return;
    }
    if (!rootPath) {
      vscode3.window.showErrorMessage("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0438\u0442\u044C \u043A\u043E\u0440\u043D\u0435\u0432\u0443\u044E \u043F\u0430\u043F\u043A\u0443 \u043F\u0440\u043E\u0435\u043A\u0442\u0430.");
      return;
    }
    const ignoredNames = vscode3.workspace.getConfiguration("acto").get("ignoredNames") ?? [];
    await vscode3.commands.executeCommand("setContext", "acto.isParsing", true);
    let parseResult;
    try {
      await vscode3.window.withProgress({
        location: vscode3.ProgressLocation.Notification,
        title: "ACTO",
        cancellable: false
      }, async (progress) => {
        parseResult = await runParser(progress, checkedFiles, ignoredNames);
      });
    } finally {
      await vscode3.commands.executeCommand("setContext", "acto.isParsing", false);
      globalParser = null;
    }
    if (!parseResult) {
      return;
    }
    const { report, stats, cancelled } = parseResult;
    const outputPath = path3.join(rootPath, "output.txt");
    fs.writeFileSync(outputPath, report, { encoding: "utf8" });
    const doc = await vscode3.workspace.openTextDocument(outputPath);
    await vscode3.window.showTextDocument(doc, { viewColumn: vscode3.ViewColumn.Beside, preview: false });
    if (cancelled) {
      vscode3.window.showWarningMessage("\u041F\u0430\u0440\u0441\u0438\u043D\u0433 \u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D. \u0427\u0430\u0441\u0442\u0438\u0447\u043D\u044B\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442 \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D \u0432 output.txt.");
    } else {
      const msg = `$(check-all) ${stats.processedFiles} \u0444\u0430\u0439\u043B(\u043E\u0432)  \xB7  ~${formatTokenCount(stats.estimatedTokens)} \u0442\u043E\u043A\u0435\u043D\u043E\u0432`;
      vscode3.window.showInformationMessage(msg, "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C").then((action) => {
        if (action === "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C") {
          vscode3.env.clipboard.writeText(report);
          vscode3.window.showInformationMessage("$(clippy) \u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430!");
        }
      });
    }
  });
  const copyToClipboardCmd = vscode3.commands.registerCommand("acto.copyToClipboard", async () => {
    const checkedFiles = projectTreeProvider.getCheckedItems();
    if (checkedFiles.length === 0) {
      vscode3.window.showWarningMessage("\u041D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u043E \u043D\u0438 \u043E\u0434\u043D\u043E\u0433\u043E \u0444\u0430\u0439\u043B\u0430.");
      return;
    }
    if (!rootPath) {
      return;
    }
    const ignoredNames = vscode3.workspace.getConfiguration("acto").get("ignoredNames") ?? [];
    await vscode3.commands.executeCommand("setContext", "acto.isParsing", true);
    let parseResult;
    try {
      await vscode3.window.withProgress({
        location: vscode3.ProgressLocation.Notification,
        title: "ACTO: \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435...",
        cancellable: false
      }, async (progress) => {
        parseResult = await runParser(progress, checkedFiles, ignoredNames);
      });
    } finally {
      await vscode3.commands.executeCommand("setContext", "acto.isParsing", false);
      globalParser = null;
    }
    if (!parseResult) {
      return;
    }
    const { report, stats } = parseResult;
    await vscode3.env.clipboard.writeText(report);
    vscode3.window.showInformationMessage(
      `$(clippy) \u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E: ${stats.processedFiles} \u0444\u0430\u0439\u043B(\u043E\u0432)  \xB7  ~${formatTokenCount(stats.estimatedTokens)} \u0442\u043E\u043A\u0435\u043D\u043E\u0432`
    );
  });
  const stopCommand = vscode3.commands.registerCommand("acto.stopParsing", () => {
    globalParser?.cancel();
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
  const openSettingsCmd = vscode3.commands.registerCommand("acto.openSettings", () => {
    vscode3.commands.executeCommand("workbench.action.openSettings", "acto");
  });
  const refreshTreeCmd = vscode3.commands.registerCommand("acto.refreshTree", () => {
    projectTreeProvider.refresh();
  });
  const revealInExplorerCmd = vscode3.commands.registerCommand("acto.revealInExplorer", (item) => {
    if (item) {
      vscode3.commands.executeCommand("revealInExplorer", vscode3.Uri.file(item.path));
    }
  });
  const addToIgnoredCmd = vscode3.commands.registerCommand("acto.addToIgnored", async (item) => {
    if (!item) {
      return;
    }
    const name = path3.basename(item.path);
    const config = vscode3.workspace.getConfiguration("acto");
    const current = config.get("ignoredNames") ?? [];
    if (current.includes(name)) {
      vscode3.window.showInformationMessage(`"${name}" \u0443\u0436\u0435 \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u043C\u044B\u0445.`);
      return;
    }
    const target = vscode3.workspace.workspaceFolders ? vscode3.ConfigurationTarget.Workspace : vscode3.ConfigurationTarget.Global;
    await config.update("ignoredNames", [...current, name], target);
    vscode3.window.showInformationMessage(`$(eye-closed) "${name}" \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D \u0432 \u0438\u0433\u043D\u043E\u0440\u0438\u0440\u0443\u0435\u043C\u044B\u0435.`);
  });
  const configWatcher = vscode3.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("acto.ignoredNames")) {
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
    configWatcher
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
