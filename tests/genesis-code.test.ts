import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  sha256Hex,
  scanWorkspaceDag,
  sanitizeConfigJson,
  extractSymbolSkeleton,
  extractLocalImports,
  verifyFile,
  loadWorkspaceState,
  verifyAuditLedgerChain,
} from '../src/index';

const PKG_ROOT = path.resolve(__dirname, '..');
const SAMPLE_PROJECT_DIR = path.join(PKG_ROOT, 'examples', 'sample-project');
const CLI_PATH = path.join(PKG_ROOT, 'src', 'cli.ts');
const INSTALLER_BIN = path.join(PKG_ROOT, 'bin', 'genesis-code.mjs');
const TSX_EXEC_ARGV = process.execArgv.filter((a) => !a.startsWith('--test'));

test('hash: sha256Hex matches standard node:crypto SHA-256 digest', () => {
  const input = 'genesis-code-v2-cryptographic-check';
  const expected = createHash('sha256').update(input).digest('hex');
  assert.equal(sha256Hex(input), expected);
  assert.equal(sha256Hex(input).length, 64);
});

test('dag: resolves TS/JS imports and Python plain import / import-as / from-import', () => {
  const dag = scanWorkspaceDag(SAMPLE_PROJECT_DIR);
  assert.equal(dag.totalCodeFiles, 3);
  assert.deepEqual(dag.wavefrontBuildOrder, ['types.ts', 'storage.ts', 'gateway.ts']);
  assert.equal(dag.hasCycles, false);

  const pyFiles = new Set([
    'types_contract.py',
    'crc32_wal.py',
    'lease_fencer.py',
    'cluster_gateway.py',
  ]);
  const pyGatewayCode = [
    'import types_contract',
    'import crc32_wal as wal_mod',
    'from lease_fencer import MonotonicLeaseFencer',
    '# import ignored_comment_mod',
  ].join('\n');

  const resolved = extractLocalImports(pyGatewayCode, 'cluster_gateway.py', pyFiles);
  assert.deepEqual(resolved, ['crc32_wal.py', 'lease_fencer.py', 'types_contract.py']);
});

test('dag: sanitizeConfigJson isolates prompt-injection and debug decoy keys', () => {
  const raw = fs.readFileSync(path.join(SAMPLE_PROJECT_DIR, 'cluster_config.json'), 'utf8');
  const rep = sanitizeConfigJson(raw, 'cluster_config.json');

  assert.deepEqual(rep.activeSchemaKeys, [
    'cluster_id',
    'crc32_strict_mode',
    'fence_epoch_min',
    'quorum_size',
  ]);
  assert.ok(rep.ignoredNoiseAndDecoyKeys.includes('_debug_bypass_crc_and_fencing'));
  assert.ok(rep.ignoredNoiseAndDecoyKeys.includes('recommended_unverified_tool'));
  assert.ok(rep.ignoredNoiseAndDecoyKeys.includes('_comment'));
});

test('dag: extractSymbolSkeleton stitches multi-line Python and TypeScript signatures', () => {
  const pyCode = [
    'class LeaseFencer:',
    '    def check_token(',
    '        self,',
    '        epoch: int,',
    '        strict: bool = True,',
    '    ) -> bool:',
    '        return epoch > 0',
  ].join('\n');

  const pySkel = extractSymbolSkeleton(pyCode, 'python');
  assert.deepEqual(pySkel, [
    'class LeaseFencer:',
    '    def check_token(self, epoch: int, strict: bool = True,) -> bool: ...',
  ]);

  const tsCode = fs.readFileSync(path.join(SAMPLE_PROJECT_DIR, 'gateway.ts'), 'utf8');
  const tsSkel = extractSymbolSkeleton(tsCode, 'typescript');
  assert.ok(tsSkel.includes('export class ReplicatedGateway'));
  assert.ok(tsSkel.includes('  public commitWrite(entry: WalEntry): CommitResult'));
});

test('verifier: real --syntax and --test gate rolls back runtime regressions and records Failure Memory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-v2-ratchet-'));
  try {
    const mathFile = path.join(tmpDir, 'math_ops.py');
    const testCmd = `python3 -c "import math_ops; assert math_ops.add(2, 3) == 5, 'Expected 5'"`;

    const goodV1 = [
      'def add(a: int, b: int) -> int:',
      '    return a + b',
      '',
    ].join('\n');
    fs.writeFileSync(mathFile, goodV1, 'utf8');

    // Step 1: Valid code passes contract, hygiene, syntax, and real Python test
    const passReport = verifyFile({
      filePath: mathFile,
      workspaceDir: tmpDir,
      mustContain: ['def add'],
      runSyntax: true,
      testCommand: testCmd,
      enableRatchetRollback: true,
    });
    assert.equal(passReport.passed, true);
    assert.equal(passReport.healthScore, 1);
    assert.equal(passReport.syntaxCheck?.passed, true);
    assert.equal(passReport.testCheck?.passed, true);
    assert.equal(passReport.ratchet.accepted, true);

    // Step 2: Introduce a subtle runtime logic bug (syntactically valid, keeps `def add`, breaks test!)
    const buggyV2 = [
      'def add(a: int, b: int) -> int:',
      '    return a - b',
      '',
    ].join('\n');
    fs.writeFileSync(mathFile, buggyV2, 'utf8');

    const failReport = verifyFile({
      filePath: mathFile,
      workspaceDir: tmpDir,
      mustContain: ['def add'],
      runSyntax: true,
      testCommand: testCmd,
      enableRatchetRollback: true,
    });
    assert.equal(failReport.passed, false);
    assert.equal(failReport.testCheck?.passed, false);
    assert.equal(failReport.ratchet.accepted, false);
    assert.equal(failReport.ratchet.rolledBackToSnapshot, true);
    assert.ok(failReport.recordedLesson !== null);
    assert.equal(failReport.recordedLesson?.source, 'test');
    assert.ok(failReport.recordedLesson?.summary.includes('AssertionError'));

    // Disk file was physically rolled back to goodV1!
    assert.equal(fs.readFileSync(mathFile, 'utf8'), goodV1);

    // Real SHA-256 audit ledger is valid and matches real crypto digest
    const state = loadWorkspaceState(tmpDir);
    const chain = verifyAuditLedgerChain(state.auditLedger);
    assert.equal(chain.valid, true);
    assert.equal(state.auditLedger.length, 2);
    assert.equal(
      state.ratchet['math_ops.py'].bestArtifactSha256,
      createHash('sha256').update(goodV1).digest('hex')
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifier: --syntax catches real Python SyntaxError even when curly braces are balanced', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-v2-syntax-'));
  try {
    const brokenPy = path.join(tmpDir, 'broken.py');
    fs.writeFileSync(brokenPy, 'def calc(x: int\n    return x + 1\n', 'utf8');

    const report = verifyFile({
      filePath: brokenPy,
      workspaceDir: tmpDir,
      runSyntax: true,
    });
    assert.equal(report.passed, false);
    assert.equal(report.syntaxCheck?.passed, false);
    assert.ok(/SyntaxError/i.test(report.syntaxCheck?.diagnosis || ''));
    assert.equal(report.recordedLesson?.source, 'syntax');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cli hook: native PostToolUse stdin handler allows clean files and blocks broken edits with exit code 2', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-v2-hook-'));
  try {
    const targetPy = path.join(tmpDir, 'worker.py');
    fs.writeFileSync(targetPy, 'def run() -> int:\n    return 42\n', 'utf8');

    const allowPayload = JSON.stringify({
      cwd: tmpDir,
      tool_name: 'Write',
      tool_input: { file_path: targetPy },
    });
    const allowRes = spawnSync(
      process.execPath,
      [...TSX_EXEC_ARGV, CLI_PATH, 'hook', '--workspace', tmpDir, '--syntax'],
      { input: allowPayload, encoding: 'utf8' }
    );
    assert.equal(allowRes.status, 0);
    const allowJson = JSON.parse(allowRes.stdout);
    assert.equal(allowJson.decision, 'allow');

    // Now break the file with a TODO stub and invoke hook again -> should rollback and exit 2
    fs.writeFileSync(targetPy, 'def run() -> int:\n    # TODO: finish\n    raise NotImplementedError()\n', 'utf8');
    const blockRes = spawnSync(
      process.execPath,
      [...TSX_EXEC_ARGV, CLI_PATH, 'hook', '--workspace', tmpDir, '--syntax'],
      { input: allowPayload, encoding: 'utf8' }
    );
    assert.equal(blockRes.status, 2);
    const blockJson = JSON.parse(blockRes.stderr);
    assert.equal(blockJson.decision, 'block');
    assert.equal(blockJson.rolledBackToSnapshot, true);
    assert.equal(fs.readFileSync(targetPy, 'utf8'), 'def run() -> int:\n    return 42\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('installer: 1-command init installs Antigravity, Claude Code, Cursor, hook example, and working modular CLI', () => {
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-v2-install-'));
  try {
    const out = execFileSync(process.execPath, [INSTALLER_BIN, 'init', tmpProject], {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.status, 'INSTALLED_SUCCESSFULLY');

    const expectedFiles = [
      '.agent/skills/genesis-code/SKILL.md',
      '.claude/skills/genesis-code/SKILL.md',
      '.claude/genesis-hooks.example.json',
      '.cursor/rules/genesis-code.mdc',
      'scripts/genesis/hash.ts',
      'scripts/genesis/state.ts',
      'scripts/genesis/dag.ts',
      'scripts/genesis/verifier.ts',
      'scripts/genesis/index.ts',
      'scripts/genesis/genesis-code-cli.ts',
    ];
    for (const rel of expectedFiles) {
      assert.ok(fs.existsSync(path.join(tmpProject, rel)), `Missing installed file: ${rel}`);
    }

    const cliOut = execFileSync(
      process.execPath,
      [...TSX_EXEC_ARGV, path.join(tmpProject, 'scripts/genesis/genesis-code-cli.ts'), 'prepare', SAMPLE_PROJECT_DIR],
      { encoding: 'utf8' }
    );
    const prepJson = JSON.parse(cliOut);
    assert.equal(prepJson.tool, 'genesis-code');
    assert.equal(prepJson.version, '2.0.0');
    assert.deepEqual(prepJson.wavefrontBuildOrder, ['types.ts', 'storage.ts', 'gateway.ts']);
  } finally {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
});
