import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as fss from 'fs';
import { ActoParser, formatTokenCount, getLanguageId } from '../core/parser';

// ─────────────────────────────────────────────────────────────────────────────
// formatTokenCount
// ─────────────────────────────────────────────────────────────────────────────
suite('parser › formatTokenCount', () => {

    test('< 1 000 → plain string', () => {
        assert.strictEqual(formatTokenCount(0),   '0');
        assert.strictEqual(formatTokenCount(1),   '1');
        assert.strictEqual(formatTokenCount(500), '500');
        assert.strictEqual(formatTokenCount(999), '999');
    });

    test('≥ 1 000 → k-notation with one decimal', () => {
        assert.strictEqual(formatTokenCount(1_000),  '1.0k');
        assert.strictEqual(formatTokenCount(1_500),  '1.5k');
        assert.strictEqual(formatTokenCount(4_200),  '4.2k');
        assert.strictEqual(formatTokenCount(10_000), '10.0k');
        assert.strictEqual(formatTokenCount(99_999), '100.0k');
    });

    test('≥ 1 000 000 → M-notation with one decimal', () => {
        assert.strictEqual(formatTokenCount(1_000_000), '1.0M');
        assert.strictEqual(formatTokenCount(2_500_000), '2.5M');
        assert.strictEqual(formatTokenCount(10_000_000), '10.0M');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLanguageId
// ─────────────────────────────────────────────────────────────────────────────
suite('parser › getLanguageId', () => {

    test('TypeScript / TSX', () => {
        assert.strictEqual(getLanguageId('index.ts'),       'typescript');
        assert.strictEqual(getLanguageId('app.tsx'),        'tsx');
        assert.strictEqual(getLanguageId('/src/utils.ts'),  'typescript');
    });

    test('JavaScript / JSX', () => {
        assert.strictEqual(getLanguageId('index.js'),  'javascript');
        assert.strictEqual(getLanguageId('app.jsx'),   'jsx');
        assert.strictEqual(getLanguageId('lib.mjs'),   'javascript');
        assert.strictEqual(getLanguageId('lib.cjs'),   'javascript');
    });

    test('Python / Go / Rust / Java / C# / C / C++', () => {
        assert.strictEqual(getLanguageId('main.py'),    'python');
        assert.strictEqual(getLanguageId('main.go'),    'go');
        assert.strictEqual(getLanguageId('main.rs'),    'rust');
        assert.strictEqual(getLanguageId('Main.java'),  'java');
        assert.strictEqual(getLanguageId('App.cs'),     'csharp');
        assert.strictEqual(getLanguageId('main.c'),     'c');
        assert.strictEqual(getLanguageId('main.cpp'),   'cpp');
        assert.strictEqual(getLanguageId('main.h'),     'c');
        assert.strictEqual(getLanguageId('main.hpp'),   'cpp');
    });

    test('Config / markup formats', () => {
        assert.strictEqual(getLanguageId('data.json'),   'json');
        assert.strictEqual(getLanguageId('config.yaml'), 'yaml');
        assert.strictEqual(getLanguageId('config.yml'),  'yaml');
        assert.strictEqual(getLanguageId('Cargo.toml'),  'toml');
        assert.strictEqual(getLanguageId('README.md'),   'markdown');
        assert.strictEqual(getLanguageId('page.html'),   'html');
        assert.strictEqual(getLanguageId('page.htm'),    'html');
        assert.strictEqual(getLanguageId('style.css'),   'css');
        assert.strictEqual(getLanguageId('style.scss'),  'scss');
        assert.strictEqual(getLanguageId('style.sass'),  'sass');
        assert.strictEqual(getLanguageId('style.less'),  'less');
    });

    test('Shell / PowerShell / SQL / XML', () => {
        assert.strictEqual(getLanguageId('build.sh'),    'bash');
        assert.strictEqual(getLanguageId('run.zsh'),     'bash');   // .zsh extension → bash
        assert.strictEqual(getLanguageId('run.bash'),    'bash');
        assert.strictEqual(getLanguageId('script.ps1'),  'powershell');
        assert.strictEqual(getLanguageId('query.sql'),   'sql');
        assert.strictEqual(getLanguageId('config.xml'),  'xml');
    });

    test('Special base-name detection: Dockerfile and Makefile', () => {
        assert.strictEqual(getLanguageId('Dockerfile'),    'dockerfile');
        assert.strictEqual(getLanguageId('dockerfile'),    'dockerfile');
        assert.strictEqual(getLanguageId('/build/Dockerfile'), 'dockerfile');
        assert.strictEqual(getLanguageId('Makefile'),      'makefile');
        assert.strictEqual(getLanguageId('Makefile.am'),   'makefile');
    });

    test('Unknown extension → empty string', () => {
        assert.strictEqual(getLanguageId('binary.exe'),  '');
        assert.strictEqual(getLanguageId('archive.zip'), '');
        assert.strictEqual(getLanguageId('no_ext'),      '');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ActoParser — binary detection (via run)
// ─────────────────────────────────────────────────────────────────────────────
suite('parser › ActoParser — binary detection', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'acto-test-'));
    });

    teardown(() => {
        fss.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('binary file is skipped (counted in skippedBinary)', async () => {
        // Write a file with lots of null bytes — guaranteed binary
        const binPath = path.join(tmpDir, 'binary.bin');
        const buf = Buffer.alloc(100, 0); // 100 null bytes — > 10% threshold
        fss.writeFileSync(binPath, buf);

        const parser = new ActoParser([binPath], tmpDir);
        const result = await parser.run(() => {});

        assert.strictEqual(result.stats.skippedBinary, 1, 'binary file must be counted as skipped');
        assert.strictEqual(result.stats.processedFiles, 0, 'no text files processed');
        assert.strictEqual(result.cancelled, false);
    });

    test('text file is processed and included in report', async () => {
        const txtPath = path.join(tmpDir, 'hello.ts');
        fss.writeFileSync(txtPath, 'export const greeting = "hello";\n', 'utf8');

        const parser = new ActoParser([txtPath], tmpDir);
        const result = await parser.run(() => {});

        assert.strictEqual(result.stats.skippedBinary, 0);
        assert.strictEqual(result.stats.processedFiles, 1);
        assert.ok(result.report.includes('hello.ts'),  'report should mention filename');
        assert.ok(result.report.includes('```typescript'), 'report should have TypeScript fence');
        assert.ok(result.report.includes('greeting'),  'report should contain file content');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ActoParser — report format
// ─────────────────────────────────────────────────────────────────────────────
suite('parser › ActoParser — report format', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'acto-fmt-'));
    });

    teardown(() => {
        fss.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('header contains ACTO SNAPSHOT, project name, file count and token estimate', async () => {
        fss.writeFileSync(path.join(tmpDir, 'a.ts'), 'const x = 1;\n', 'utf8');
        fss.writeFileSync(path.join(tmpDir, 'b.py'), 'x = 1\n', 'utf8');

        const projectName = path.basename(tmpDir);
        const parser = new ActoParser(
            [path.join(tmpDir, 'a.ts'), path.join(tmpDir, 'b.py')],
            tmpDir
        );
        const result = await parser.run(() => {});

        assert.ok(result.report.includes('ACTO SNAPSHOT'), 'header must say ACTO SNAPSHOT');
        assert.ok(result.report.includes(projectName),     'header must include project name');
        assert.ok(result.report.includes('Файлов'),        'header must list file count');
        assert.ok(result.report.includes('Токенов'),       'header must estimate tokens');
    });

    test('report includes СТРУКТУРА ПРОЕКТА section', async () => {
        fss.writeFileSync(path.join(tmpDir, 'index.ts'), '// stub\n', 'utf8');

        const parser = new ActoParser([path.join(tmpDir, 'index.ts')], tmpDir);
        const result = await parser.run(() => {});

        assert.ok(result.report.includes('СТРУКТУРА ПРОЕКТА'), 'must have structure section');
        assert.ok(result.report.includes('index.ts'), 'tree must list filename');
    });

    test('report includes СОДЕРЖИМОЕ ФАЙЛОВ section', async () => {
        fss.writeFileSync(path.join(tmpDir, 'main.go'), 'package main\n', 'utf8');

        const parser = new ActoParser([path.join(tmpDir, 'main.go')], tmpDir);
        const result = await parser.run(() => {});

        assert.ok(result.report.includes('СОДЕРЖИМОЕ ФАЙЛОВ'), 'must have content section');
        assert.ok(result.report.includes('```go'),  'must use correct language fence');
    });

    test('report ends with footer when not cancelled', async () => {
        fss.writeFileSync(path.join(tmpDir, 'x.json'), '{}', 'utf8');

        const parser = new ActoParser([path.join(tmpDir, 'x.json')], tmpDir);
        const result = await parser.run(() => {});

        assert.ok(result.report.includes('Итого:'), 'footer must include summary');
        assert.ok(!result.cancelled);
    });

    test('cancel() stops processing mid-run', async () => {
        // Create 30 files so there is enough work to cancel
        for (let i = 0; i < 30; i++) {
            fss.writeFileSync(path.join(tmpDir, `f${i}.ts`), `const v${i} = ${i};\n`, 'utf8');
        }
        const files = fss.readdirSync(tmpDir).map(n => path.join(tmpDir, n));

        const parser = new ActoParser(files, tmpDir);
        let callCount = 0;
        const runPromise = parser.run(() => {
            callCount++;
            if (callCount === 2) {
                parser.cancel();
            }
        });

        const result = await runPromise;
        assert.ok(result.cancelled, 'parser should be marked as cancelled');
    });

    test('stats: estimatedTokens ≈ totalChars / 4', async () => {
        const content = 'a'.repeat(4000); // exactly 1000 tokens
        fss.writeFileSync(path.join(tmpDir, 'tokens.ts'), content, 'utf8');

        const parser = new ActoParser([path.join(tmpDir, 'tokens.ts')], tmpDir);
        const result = await parser.run(() => {});

        assert.strictEqual(result.stats.estimatedTokens, 1000);
        assert.strictEqual(result.stats.totalChars, 4000);
    });

    test('onProgress callback is called at least once', async () => {
        fss.writeFileSync(path.join(tmpDir, 'p.ts'), 'let a = 1;\n', 'utf8');

        const parser = new ActoParser([path.join(tmpDir, 'p.ts')], tmpDir);
        let called = 0;
        await parser.run(() => { called++; });

        assert.ok(called > 0, 'progress callback must be invoked');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ActoParser — language fences for multiple file types
// ─────────────────────────────────────────────────────────────────────────────
suite('parser › ActoParser — language fences in output', () => {

    let tmpDir: string;

    setup(() => {
        tmpDir = fss.mkdtempSync(path.join(os.tmpdir(), 'acto-lang-'));
    });

    teardown(() => {
        fss.rmSync(tmpDir, { recursive: true, force: true });
    });

    const cases: Array<[string, string, string]> = [
        ['style.css',   'body {}',       '```css'],
        ['data.json',   '{}',            '```json'],
        ['README.md',   '# Hello',       '```markdown'],
        ['build.sh',    '#!/bin/sh',     '```bash'],
        ['schema.xml',  '<root/>',       '```xml'],
        ['config.yaml', 'key: val',      '```yaml'],
        ['Makefile',    'all:\n\techo',  '```makefile'],
    ];

    for (const [filename, source, fence] of cases) {
        test(`${filename} → ${fence}`, async () => {
            fss.writeFileSync(path.join(tmpDir, filename), source, 'utf8');
            const parser = new ActoParser([path.join(tmpDir, filename)], tmpDir);
            const result = await parser.run(() => {});
            assert.ok(result.report.includes(fence),
                `expected fence ${fence} in report for ${filename}`);
        });
    }
});
