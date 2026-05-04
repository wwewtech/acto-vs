import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fss from 'fs';
import * as vscode from 'vscode';
import { ProjectTreeProvider } from '../ProjectTreeProvider';
import { FileNode } from '../core/types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeFile(p: string): FileNode {
    return { name: path.basename(p), path: p, isDirectory: false };
}

function makeDir(p: string): FileNode {
    return { name: path.basename(p), path: p, isDirectory: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › initial state', () => {

    test('starts with zero checked files', () => {
        const provider = new ProjectTreeProvider('/some/root');
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        assert.deepStrictEqual(provider.getCheckedItems(), []);
    });

    test('getCheckedItems returns empty array when nothing is checked', () => {
        const provider = new ProjectTreeProvider(undefined);
        assert.deepStrictEqual(provider.getCheckedItems(), []);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleCheckbox — files
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › toggleCheckbox (files)', () => {

    test('checking a file increases count by 1', async () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/index.ts');
        await provider.toggleCheckbox(file);
        assert.strictEqual(provider.getCheckedFilesCount(), 1);
    });

    test('un-checking a file decreases count back to 0', async () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/index.ts');
        await provider.toggleCheckbox(file); // check
        await provider.toggleCheckbox(file); // uncheck
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
    });

    test('multiple distinct files are counted correctly', async () => {
        const provider = new ProjectTreeProvider('/root');
        await provider.toggleCheckbox(makeFile('/root/a.ts'));
        await provider.toggleCheckbox(makeFile('/root/b.ts'));
        await provider.toggleCheckbox(makeFile('/root/c.ts'));
        assert.strictEqual(provider.getCheckedFilesCount(), 3);
    });

    test('toggling the same file twice is idempotent (net zero)', async () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        await provider.toggleCheckbox(file);
        await provider.toggleCheckbox(file);
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        assert.deepStrictEqual(provider.getCheckedItems(), []);
    });

    test('getCheckedItems returns paths of checked files', async () => {
        const provider = new ProjectTreeProvider('/root');
        const fa = makeFile('/root/a.ts');
        const fb = makeFile('/root/b.ts');
        await provider.toggleCheckbox(fa);
        await provider.toggleCheckbox(fb);
        const items = provider.getCheckedItems().sort();
        assert.deepStrictEqual(items, ['/root/a.ts', '/root/b.ts'].sort());
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleCheckbox — directories (cascade selection)
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › toggleCheckbox (directories)', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'acto-tree-'));
        fss.mkdirSync(path.join(tmpDir, 'subdir'));
        fss.writeFileSync(path.join(tmpDir, 'root.ts'),        'const a = 1;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'extra.ts'),       'const x = 42;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'subdir', 'b.ts'), 'const b = 2;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'subdir', 'c.ts'), 'const c = 3;\n', 'utf8');
    });

    teardown(() => {
        fss.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('checking a directory selects its child files', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        const dir = makeDir(path.join(tmpDir, 'subdir'));
        await provider.toggleCheckbox(dir);
        assert.strictEqual(provider.getCheckedFilesCount(), 2,
            'directory should select files in its subtree');
    });

    test('unchecking a directory clears its child files', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        const dir = makeDir(path.join(tmpDir, 'subdir'));
        await provider.toggleCheckbox(dir); // check
        await provider.toggleCheckbox(dir); // uncheck
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        const items = provider.getCheckedItems();
        assert.ok(!items.some(p => p.endsWith(path.join('subdir', 'b.ts'))));
    });

    test('mixed: dir + 2 files → file count includes all files', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        await provider.toggleCheckbox(makeDir(path.join(tmpDir, 'subdir')));
        await provider.toggleCheckbox(makeFile(path.join(tmpDir, 'root.ts')));
        await provider.toggleCheckbox(makeFile(path.join(tmpDir, 'extra.ts')));
        assert.strictEqual(provider.getCheckedFilesCount(), 4);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deselectAll
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › deselectAll', () => {

    test('clears all checked files', async () => {
        const provider = new ProjectTreeProvider('/root');
        await provider.toggleCheckbox(makeFile('/root/a.ts'));
        await provider.toggleCheckbox(makeFile('/root/b.ts'));

        provider.deselectAll();

        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        assert.deepStrictEqual(provider.getCheckedItems(), []);
    });

    test('deselectAll on empty set is a no-op', () => {
        const provider = new ProjectTreeProvider('/root');
        assert.doesNotThrow(() => provider.deselectAll());
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// onSelectionChanged event
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › onSelectionChanged event', () => {

    test('fires with correct count when file checked', async () => {
        const provider = new ProjectTreeProvider('/root');
        let seen = -1;
        provider.onSelectionChanged((count: number) => { seen = count; });
        await provider.toggleCheckbox(makeFile('/root/a.ts'));
        assert.strictEqual(seen, 1);
    });

    test('fires with 0 after deselectAll', async () => {
        const provider = new ProjectTreeProvider('/root');
        await provider.toggleCheckbox(makeFile('/root/a.ts'));
        await provider.toggleCheckbox(makeFile('/root/b.ts'));

        let seen = -1;
        provider.onSelectionChanged((count: number) => { seen = count; });
        provider.deselectAll();
        assert.strictEqual(seen, 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTreeItem — appearance
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › getTreeItem', () => {

    test('file node has correct label and no children state', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/index.ts');
        const item = provider.getTreeItem(file);
        assert.strictEqual(item.label, 'index.ts');
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('directory node is collapsible', () => {
        const provider = new ProjectTreeProvider('/root');
        const dir = makeDir('/root/src');
        const item = provider.getTreeItem(dir);
        assert.strictEqual(item.label, 'src');
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('unchecked file has Unchecked checkbox state', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        const item = provider.getTreeItem(file);
        assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
    });

    test('checked file has Checked checkbox state', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        return provider.toggleCheckbox(file).then(() => {
            const item = provider.getTreeItem(file);
            assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
        });
    });

    test('file item has open-file command', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        const item = provider.getTreeItem(file);
        assert.ok(item.command, 'file item must have a command');
        assert.strictEqual(item.command!.command, 'vscode.open');
    });

    test('directory item has no command (clicking expands)', () => {
        const provider = new ProjectTreeProvider('/root');
        const dir = makeDir('/root/src');
        const item = provider.getTreeItem(dir);
        assert.strictEqual(item.command, undefined);
    });

    test('file tooltip is a MarkdownString with filename', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/utils.ts');
        const item = provider.getTreeItem(file);
        assert.ok(item.tooltip instanceof vscode.MarkdownString);
        const md = item.tooltip as vscode.MarkdownString;
        assert.ok(md.value.includes('utils.ts'), 'tooltip must mention the filename');
    });

    test('contextValue for file is "file"', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        const item = provider.getTreeItem(file);
        assert.strictEqual(item.contextValue, 'file');
    });

    test('contextValue for directory is "folder"', () => {
        const provider = new ProjectTreeProvider('/root');
        const dir = makeDir('/root/src');
        const item = provider.getTreeItem(dir);
        assert.strictEqual(item.contextValue, 'folder');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// setCascade — integration with actual filesystem
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › setCascade (filesystem)', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'acto-tree-'));
        fss.mkdirSync(path.join(tmpDir, 'subdir'));
        fss.writeFileSync(path.join(tmpDir, 'root.ts'),         'const a = 1;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'subdir', 'b.ts'),  'const b = 2;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'subdir', 'c.ts'),  'const c = 3;\n', 'utf8');
    });

    teardown(() => {
        fss.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('setCascade(dir, true) marks all children', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        const dir = makeDir(path.join(tmpDir, 'subdir'));
        await provider.setCascade(dir, true);

        const items = provider.getCheckedItems();
        assert.ok(items.includes(path.join(tmpDir, 'subdir', 'b.ts')),
            'b.ts must be in checked items');
        assert.ok(items.includes(path.join(tmpDir, 'subdir', 'c.ts')),
            'c.ts must be in checked items');
    });

    test('setCascade(dir, false) removes all children', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        const dir = makeDir(path.join(tmpDir, 'subdir'));
        // First, check everything
        await provider.setCascade(dir, true);
        // Then, uncheck
        await provider.setCascade(dir, false);

        const items = provider.getCheckedItems();
        assert.ok(!items.includes(path.join(tmpDir, 'subdir', 'b.ts')));
        assert.ok(!items.includes(path.join(tmpDir, 'subdir', 'c.ts')));
    });

    test('unchecking a single child keeps siblings checked and marks dir partial', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        const dir = makeDir(path.join(tmpDir, 'subdir'));
        const bFile = makeFile(path.join(tmpDir, 'subdir', 'b.ts'));

        await provider.setCascade(dir, true);
        await provider.setCascade(bFile, false);

        const items = provider.getCheckedItems();
        assert.ok(!items.includes(path.join(tmpDir, 'subdir', 'b.ts')));
        assert.ok(items.includes(path.join(tmpDir, 'subdir', 'c.ts')));

        const item = provider.getTreeItem(dir);
        assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Unchecked);
        assert.strictEqual(item.description, '1/2');
    });

    test('selectAll marks all files in workspace root', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        await provider.selectAll();

        const items = provider.getCheckedItems();
        assert.ok(items.some((p: string) => p.endsWith('root.ts')), 'root.ts should be selected');
        assert.ok(items.some((p: string) => p.endsWith('b.ts')),    'b.ts should be selected');
        assert.ok(items.some((p: string) => p.endsWith('c.ts')),    'c.ts should be selected');
    });

    test('deselectAll after selectAll clears everything', async () => {
        const provider = new ProjectTreeProvider(tmpDir);
        await provider.selectAll();
        provider.deselectAll();

        assert.deepStrictEqual(provider.getCheckedItems(), []);
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
    });
});
