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

    test('checking a file increases count by 1', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/index.ts');
        provider.toggleCheckbox(file);
        assert.strictEqual(provider.getCheckedFilesCount(), 1);
    });

    test('un-checking a file decreases count back to 0', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/index.ts');
        provider.toggleCheckbox(file); // check
        provider.toggleCheckbox(file); // uncheck
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
    });

    test('multiple distinct files are counted correctly', () => {
        const provider = new ProjectTreeProvider('/root');
        provider.toggleCheckbox(makeFile('/root/a.ts'));
        provider.toggleCheckbox(makeFile('/root/b.ts'));
        provider.toggleCheckbox(makeFile('/root/c.ts'));
        assert.strictEqual(provider.getCheckedFilesCount(), 3);
    });

    test('toggling the same file twice is idempotent (net zero)', () => {
        const provider = new ProjectTreeProvider('/root');
        const file = makeFile('/root/a.ts');
        provider.toggleCheckbox(file);
        provider.toggleCheckbox(file);
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        assert.deepStrictEqual(provider.getCheckedItems(), []);
    });

    test('getCheckedItems returns paths of checked files', () => {
        const provider = new ProjectTreeProvider('/root');
        const fa = makeFile('/root/a.ts');
        const fb = makeFile('/root/b.ts');
        provider.toggleCheckbox(fa);
        provider.toggleCheckbox(fb);
        const items = provider.getCheckedItems().sort();
        assert.deepStrictEqual(items, ['/root/a.ts', '/root/b.ts'].sort());
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// toggleCheckbox — directories (do NOT count as files)
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › toggleCheckbox (directories)', () => {

    test('checking a directory does NOT add to file count', () => {
        const provider = new ProjectTreeProvider('/root');
        const dir = makeDir('/root/src');
        provider.toggleCheckbox(dir);
        // Directory itself is in checkedItems but NOT counted as file
        assert.strictEqual(provider.getCheckedFilesCount(), 0,
            'directory should not be counted in file count');
    });

    test('unchecking a directory removes it from checked set', () => {
        const provider = new ProjectTreeProvider('/root');
        const dir = makeDir('/root/src');
        provider.toggleCheckbox(dir); // check
        provider.toggleCheckbox(dir); // uncheck
        assert.strictEqual(provider.getCheckedFilesCount(), 0);
        // The dir path should not be in checkedItems at all
        assert.ok(!provider.getCheckedItems().includes('/root/src'));
    });

    test('mixed: 1 dir + 2 files → file count is 2', () => {
        const provider = new ProjectTreeProvider('/root');
        provider.toggleCheckbox(makeDir('/root/lib'));
        provider.toggleCheckbox(makeFile('/root/index.ts'));
        provider.toggleCheckbox(makeFile('/root/utils.ts'));
        assert.strictEqual(provider.getCheckedFilesCount(), 2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deselectAll
// ─────────────────────────────────────────────────────────────────────────────
suite('ProjectTreeProvider › deselectAll', () => {

    test('clears all checked files', () => {
        const provider = new ProjectTreeProvider('/root');
        provider.toggleCheckbox(makeFile('/root/a.ts'));
        provider.toggleCheckbox(makeFile('/root/b.ts'));
        provider.toggleCheckbox(makeDir('/root/lib'));

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

    test('fires with correct count when file checked', done => {
        const provider = new ProjectTreeProvider('/root');
        provider.onSelectionChanged((count: number) => {
            assert.strictEqual(count, 1);
            done();
        });
        provider.toggleCheckbox(makeFile('/root/a.ts'));
    });

    test('fires with 0 after deselectAll', done => {
        const provider = new ProjectTreeProvider('/root');
        provider.toggleCheckbox(makeFile('/root/a.ts'));
        provider.toggleCheckbox(makeFile('/root/b.ts'));

        provider.onSelectionChanged((count: number) => {
            if (count === 0) { done(); }
        });
        provider.deselectAll();
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
        provider.toggleCheckbox(file);
        const item = provider.getTreeItem(file);
        assert.strictEqual(item.checkboxState, vscode.TreeItemCheckboxState.Checked);
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
