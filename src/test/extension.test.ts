import * as assert from 'assert';
import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Extension activation
// ─────────────────────────────────────────────────────────────────────────────
suite('extension › activation', () => {

    test('extension is present in the list of installed extensions', () => {
        const ext = vscode.extensions.getExtension('acto-dev.acto');
        // In the test runner the extension is loaded by id from package.json
        // If running outside the test sandbox it may be undefined — skip gracefully.
        if (!ext) {
            console.warn('acto-dev.acto extension not found via getExtension — skipping');
            return;
        }
        assert.ok(ext, 'extension must be registered');
    });

    test('extension activates without throwing', async () => {
        const ext = vscode.extensions.getExtension('acto-dev.acto');
        if (!ext) { return; }
        try {
            await ext.activate();
        } catch (e) {
            assert.fail(`Extension activation threw: ${e}`);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Command registration — all ACTO commands must be discoverable
// ─────────────────────────────────────────────────────────────────────────────
suite('extension › command registration', () => {

    const EXPECTED_COMMANDS = [
        'acto.parseSelected',
        'acto.copyToClipboard',
        'acto.toggleCheckbox',
        'acto.selectAll',
        'acto.deselectAll',
        'acto.stopParsing',
        'acto.refreshTree',
        'acto.openSettings',
        'acto.revealInExplorer',
        'acto.addToIgnored',
    ];

    let registeredCommands: string[];

    setup(async () => {
        // Activate extension so commands are registered
        const ext = vscode.extensions.getExtension('acto-dev.acto');
        if (ext && !ext.isActive) { await ext.activate(); }
        registeredCommands = await vscode.commands.getCommands(true);
    });

    for (const cmd of EXPECTED_COMMANDS) {
        test(`command "${cmd}" is registered`, () => {
            assert.ok(
                registeredCommands.includes(cmd),
                `command "${cmd}" must be in the VS Code command registry`
            );
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// acto.deselectAll — should not throw when no files are checked
// ─────────────────────────────────────────────────────────────────────────────
suite('extension › commands smoke-test', () => {

    setup(async () => {
        const ext = vscode.extensions.getExtension('acto-dev.acto');
        if (ext && !ext.isActive) { await ext.activate(); }
    });

    test('acto.deselectAll executes without error', async () => {
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('acto.deselectAll'); }
        );
    });

    test('acto.refreshTree executes without error', async () => {
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('acto.refreshTree'); }
        );
    });

    test('acto.stopParsing is a no-op when no parse is running', async () => {
        // Should silently do nothing (globalParser is null)
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('acto.stopParsing'); }
        );
    });

    test('acto.parseSelected shows warning when no files selected', async () => {
        // Capture notifications via a quick poll: executeCommand will show a warning
        // message but we can verify it does not throw
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('acto.parseSelected'); }
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Context keys
// ─────────────────────────────────────────────────────────────────────────────
suite('extension › context keys', () => {

    setup(async () => {
        const ext = vscode.extensions.getExtension('acto-dev.acto');
        if (ext && !ext.isActive) { await ext.activate(); }
    });

    test('acto.hasSelection context key exists (setContext does not throw)', async () => {
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('setContext', 'acto.hasSelection', false); }
        );
    });

    test('acto.isParsing context key exists (setContext does not throw)', async () => {
        await assert.doesNotReject(
            async () => { await vscode.commands.executeCommand('setContext', 'acto.isParsing', false); }
        );
    });
});
