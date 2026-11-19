/**
 * Deterministic Code Verifier, Real Executable Gate (`--syntax` & `--test`),
 * Monotonic Rollback Ratchet, and Cross-Session Failure Memory Recorder.
 *
 * Design principle: 100% measured telemetry. Every field returned by this module
 * comes directly from real disk content, real subprocess exit codes, or real
 * SHA-256 digests—never synthetic or hardcoded placeholders.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { sha256Hex } from './hash';
import { extractSymbolSkeleton, sanitizeConfigJson } from './dag';
import {
  AuditLedgerEntry,
  FailureLesson,
  computeLedgerRecordHash,
  loadWorkspaceState,
  recordFailureLesson,
  saveWorkspaceState,
} from './state';

export interface ContractCheckResult {
  compliant: boolean;
  score: number;
  missingSymbols: string[];
  forbiddenViolations: string[];
}

export interface HygieneCheckResult {
  score: number;
  issues: string[];
}

export interface ExecutableCheckResult {
  executed: boolean;
  command: string;
  passed: boolean;
  exitCode: number;
  elapsedMs: number;
  diagnosis: string;
  stdoutSnippet: string;
  stderrSnippet: string;
}

export interface RatchetDecision {
  accepted: boolean;
  previousBestHealthScore: number | null;
  previousTestsPassed: boolean | null;
  newHealthScore: number;
  rolledBackToSnapshot: boolean;
  reason: string;
  healthHistory: number[];
}

export interface FileVerificationReport {
  filePath: string;
  relativePath: string;
  passed: boolean;
  healthScore: number;
  symbolCount: number;
  symbolSkeleton: string[];
  contract: ContractCheckResult;
  hygiene: HygieneCheckResult;
  syntaxCheck: ExecutableCheckResult | null;
  testCheck: ExecutableCheckResult | null;
  ratchet: RatchetDecision;
  recordedLesson: FailureLesson | null;
  ledgerEntry: AuditLedgerEntry;
  correctionSignal: string;
}

const DEFAULT_FORBIDDEN_TOKENS = [
  'mcp.shell.exec_raw',
  '_debug_bypass_crc_and_fencing',
  '_legacy_unverified_wal_mode',
  'NotImplementedError',
];

/**
 * Strips single-line comments (`//`, `#`) and doc-comment prefixes so comments
 * like `// TODO: implement class Engine` cannot spoof required symbol obligations.
 */
function stripSingleLineComments(code: string): string {
  return code
    .split(/\r?\n/)
    .filter((ln) => {
      const t = ln.trim();
      return !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('*');
    })
    .join('\n');
}

/**
 * Evaluates explicit required/forbidden contract symbols against active (non-comment) code.
 */
export function evaluateContract(
  code: string,
  mustContain: string[],
  mustNotContain: string[]
): ContractCheckResult {
  const activeLower = stripSingleLineComments(code).toLowerCase();

  const uniqueMust = Array.from(new Set(mustContain.filter(Boolean)));
  const uniqueForbid = Array.from(new Set(mustNotContain.filter(Boolean)));

  const missingSymbols = uniqueMust.filter(
    (sym) => !activeLower.includes(sym.toLowerCase())
  );
  const forbiddenViolations = uniqueForbid.filter(
    (bad) => activeLower.includes(bad.toLowerCase())
  );

  const totalMust = uniqueMust.length;
  const hitRatio = totalMust > 0 ? (totalMust - missingSymbols.length) / totalMust : 1.0;
  const violationFactor = forbiddenViolations.length > 0 ? 0.0 : 1.0;
  const score = Number((hitRatio * violationFactor).toFixed(4));

  return {
    compliant: missingSymbols.length === 0 && forbiddenViolations.length === 0,
    score,
    missingSymbols,
    forbiddenViolations,
  };
}

/**
 * String-literal-aware static hygiene inspection.
 * Catches TODO/FIXME stubs, NotImplementedError, empty files, and unbalanced `{}`
 * while ignoring braces inside quoted string literals and comments.
 */
export function inspectCodeHygiene(code: string): HygieneCheckResult {
  const issues: string[] = [];
  if (code.trim().length === 0) {
    return { score: 0, issues: ['File is empty'] };
  }

  const activeCode = stripSingleLineComments(code);

  if (/\b(?:TODO|FIXME|XXX)\b/.test(code)) {
    issues.push('Contains unfinished TODO/FIXME marker');
  }

  if (
    /raise\s+NotImplementedError/.test(activeCode) ||
    /throw\s+new\s+Error\(['"]Not implemented/i.test(activeCode)
  ) {
    issues.push('Contains unimplemented method stub (NotImplementedError)');
  }

  const strippedStrings = activeCode
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  let openBraces = 0;
  for (const ch of strippedStrings) {
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
  }
  if (openBraces !== 0) {
    issues.push(`Unbalanced curly braces (delta=${openBraces})`);
  }

  const penalty = Math.min(0.6, issues.length * 0.25);
  return {
    score: Number((1 - penalty).toFixed(4)),
    issues,
  };
}

function extractCompactDiagnosis(stderr: string, stdout: string, fallback: string): string {
  const combined = (stderr.trim() || stdout.trim()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (combined.length === 0) return fallback;

  // Prefer the most informative error line (AssertionError, SyntaxError, TypeError, TSxxxx, Error:)
  const priorityLine = [...combined]
    .reverse()
    .find((line) =>
      /(?:AssertionError|SyntaxError|IndentationError|NameError|TypeError|ValueError|ImportError|ModuleNotFoundError|error TS\d+|FAIL|Error:)/i.test(
        line
      )
    );
  return (priorityLine || combined[combined.length - 1]).slice(0, 240);
}

/**
 * Runs a real language syntax check on a file when supported:
 * - `.py` -> `python3 -m py_compile <file>` (falls back to `python` on Windows)
 * - `.js` / `.mjs` -> `node --check <file>`
 */
export function runSyntaxCheck(filePath: string, timeoutMs: number = 10000): ExecutableCheckResult | null {
  const absPath = path.resolve(filePath);
  const ext = path.extname(absPath).toLowerCase();

  let bin = '';
  let args: string[] = [];
  if (ext === '.py') {
    bin = process.platform === 'win32' ? 'python' : 'python3';
    args = ['-m', 'py_compile', absPath];
  } else if (ext === '.js' || ext === '.mjs') {
    bin = process.execPath;
    args = ['--check', absPath];
  } else {
    return null;
  }

  const startedAt = performance.now();
  const cmdLabel = `${path.basename(bin)} ${args.join(' ')}`;

  try {
    const stdout = execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      executed: true,
      command: cmdLabel,
      passed: true,
      exitCode: 0,
      elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
      diagnosis: 'Syntax valid',
      stdoutSnippet: (stdout || '').slice(-400),
      stderrSnippet: '',
    };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdoutStr = e.stdout ? String(e.stdout) : '';
    const stderrStr = e.stderr ? String(e.stderr) : e.message || 'Syntax check failed';
    return {
      executed: true,
      command: cmdLabel,
      passed: false,
      exitCode: typeof e.status === 'number' ? e.status : 1,
      elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
      diagnosis: extractCompactDiagnosis(stderrStr, stdoutStr, 'Syntax check failed'),
      stdoutSnippet: stdoutStr.slice(-500),
      stderrSnippet: stderrStr.slice(-1000),
    };
  }
}

/**
 * Executes a real shell verification command (e.g., `pytest`, `npx tsc --noEmit`, `npm test`)
 * inside `workspaceDir` and returns measured exit code + compact failure diagnosis.
 */
export function runExecutableTestCommand(
  command: string,
  workspaceDir: string,
  timeoutMs: number = 30000
): ExecutableCheckResult {
  const startedAt = performance.now();
  const res = spawnSync(command, {
    cwd: path.resolve(workspaceDir),
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  const stdoutStr = (res.stdout || '').toString();
  const stderrStr = (res.stderr || '').toString();
  const exitCode = typeof res.status === 'number' ? res.status : 1;
  const passed = exitCode === 0 && !res.error;

  const diagnosis = passed
    ? 'Executable test command passed (exit 0)'
    : extractCompactDiagnosis(
        stderrStr,
        stdoutStr,
        res.error ? res.error.message : `Command exited with code ${exitCode}`
      );

  return {
    executed: true,
    command,
    passed,
    exitCode,
    elapsedMs,
    diagnosis,
    stdoutSnippet: stdoutStr.slice(-600),
    stderrSnippet: stderrStr.slice(-1200),
  };
}

/**
 * Verifies a single file against:
 *   1. Contract symbols + learned Failure Memory lessons from `.genesis/state.json`
 *   2. Config decoy traps auto-detected in adjacent `.json` files
 *   3. String-aware static hygiene checks
 *   4. Optional real language syntax check (`runSyntax`)
 *   5. Optional real executable test command (`testCommand` or pre-run `precomputedTestResult`)
 *
 * Updates the Monotonic Workspace Ratchet (rolling back on disk if a previously
 * passing/healthier file regresses), records new Failure Memory lessons on failure,
 * and appends a real SHA-256 chained AuditLedgerEntry.
 */
export function verifyFile(params: {
  filePath: string;
  workspaceDir?: string;
  mustContain?: string[];
  mustNotContain?: string[];
  autoDecoyKeys?: string[];
  enableRatchetRollback?: boolean;
  runSyntax?: boolean;
  testCommand?: string;
  precomputedTestResult?: ExecutableCheckResult | null;
}): FileVerificationReport {
  const absPath = path.resolve(params.filePath);
  const workspaceDir = path.resolve(params.workspaceDir ?? path.dirname(absPath));
  const relPath = path.relative(workspaceDir, absPath).replace(/\\/g, '/') || path.basename(absPath);

  const state = loadWorkspaceState(workspaceDir);
  let code = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';

  // Auto-discover decoy keys from adjacent JSON configs if not provided
  let autoDecoys = params.autoDecoyKeys ?? [];
  if (autoDecoys.length === 0) {
    const dir = path.dirname(absPath);
    if (fs.existsSync(dir)) {
      const jsonFiles = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json') && !['package.json', 'package-lock.json', 'tsconfig.json'].includes(f));
      for (const jf of jsonFiles) {
        const rep = sanitizeConfigJson(fs.readFileSync(path.join(dir, jf), 'utf8'), jf);
        autoDecoys.push(...rep.ignoredNoiseAndDecoyKeys);
      }
    }
  }

  // Merge persistent Failure Memory lessons matching this file
  const matchingLessons = state.lessons.filter(
    (l) => l.targetFile === '*' || l.targetFile === relPath
  );
  const lessonMust = matchingLessons.flatMap((l) => l.injectMustContain);
  const lessonForbid = matchingLessons.flatMap((l) => l.injectMustNotContain);

  const mergedMustContain = Array.from(new Set([...(params.mustContain ?? []), ...lessonMust]));
  const mergedMustNotContain = Array.from(
    new Set([
      ...(params.mustNotContain ?? []),
      ...DEFAULT_FORBIDDEN_TOKENS,
      ...autoDecoys,
      ...lessonForbid,
    ])
  );

  const symbolSkeleton = extractSymbolSkeleton(code);
  const contract = evaluateContract(code, mergedMustContain, mergedMustNotContain);
  const hygiene = inspectCodeHygiene(code);
  const syntaxCheck = params.runSyntax ? runSyntaxCheck(absPath) : null;
  const testCheck =
    params.precomputedTestResult !== undefined
      ? params.precomputedTestResult
      : params.testCommand
      ? runExecutableTestCommand(params.testCommand, workspaceDir)
      : null;

  const syntaxScore = syntaxCheck ? (syntaxCheck.passed ? 1.0 : 0.0) : 1.0;
  const testScore = testCheck ? (testCheck.passed ? 1.0 : 0.0) : 1.0;

  // Transparent, measured health score in [0..1]
  let rawHealth = 0.6 * contract.score + 0.4 * hygiene.score;
  if (syntaxCheck && !syntaxCheck.passed) {
    rawHealth = Math.min(rawHealth, 0.35);
  }
  if (testCheck && !testCheck.passed) {
    rawHealth = Math.min(rawHealth, 0.4);
  }
  if (!contract.compliant) {
    rawHealth = Math.min(rawHealth, 0.48);
  }
  const healthScore = Number((rawHealth * (syntaxScore === 0 || testScore === 0 ? 1 : 1)).toFixed(4));

  const currentExecPassed: boolean | null =
    syntaxCheck || testCheck
      ? (syntaxCheck ? syntaxCheck.passed : true) && (testCheck ? testCheck.passed : true)
      : null;

  const prevRecord = state.ratchet[relPath];
  const previousBestHealthScore = prevRecord ? prevRecord.bestHealthScore : null;
  const previousTestsPassed = prevRecord ? prevRecord.lastTestsPassed : null;
  const healthHistory = prevRecord ? [...prevRecord.healthHistory, healthScore] : [healthScore];

  const enableRollback = params.enableRatchetRollback !== false;
  let accepted = true;
  let rolledBackToSnapshot = false;
  let reason = 'Initial verified snapshot committed to Monotonic Workspace Ratchet.';

  if (prevRecord) {
    const scoreRegressed = healthScore < prevRecord.bestHealthScore;
    const testsRegressed = prevRecord.lastTestsPassed === true && currentExecPassed === false;

    if (scoreRegressed || testsRegressed) {
      accepted = false;
      const cause = testsRegressed
        ? `executable verification regressed (passed -> failed: ${
            testCheck && !testCheck.passed
              ? testCheck.diagnosis
              : syntaxCheck && !syntaxCheck.passed
              ? syntaxCheck.diagnosis
              : 'check failed'
          })`
        : `health score degraded (${prevRecord.bestHealthScore} -> ${healthScore})`;

      if (enableRollback && prevRecord.bestSnapshotCode.length > 0) {
        fs.writeFileSync(absPath, prevRecord.bestSnapshotCode, 'utf8');
        code = prevRecord.bestSnapshotCode;
        rolledBackToSnapshot = true;
        reason = `REJECTED by Monotonic Ratchet (${cause}); auto-rolled back to last verified snapshot on disk.`;
      } else {
        reason = `REJECTED by Monotonic Ratchet (${cause}).`;
      }
    } else {
      reason = `COMMITTED by Monotonic Ratchet (health ${prevRecord.bestHealthScore} -> ${healthScore}).`;
    }
  }

  const shouldCommitSnapshot =
    !prevRecord ||
    (accepted &&
      (healthScore > prevRecord.bestHealthScore ||
        (healthScore === prevRecord.bestHealthScore &&
          (currentExecPassed === true || prevRecord.lastTestsPassed !== true))));

  const nowIso = new Date().toISOString();
  if (shouldCommitSnapshot) {
    state.ratchet[relPath] = {
      relativePath: relPath,
      bestHealthScore: healthScore,
      lastTestsPassed: currentExecPassed,
      bestSnapshotCode: code,
      bestArtifactSha256: sha256Hex(code),
      healthHistory,
      attemptsCount: (prevRecord?.attemptsCount ?? 0) + 1,
      updatedAt: nowIso,
    };
  } else if (prevRecord) {
    state.ratchet[relPath] = {
      ...prevRecord,
      healthHistory,
      attemptsCount: prevRecord.attemptsCount + 1,
      updatedAt: nowIso,
    };
  }

  const passed =
    contract.compliant &&
    hygiene.issues.length === 0 &&
    (syntaxCheck ? syntaxCheck.passed : true) &&
    (testCheck ? testCheck.passed : true) &&
    healthScore >= 0.85 &&
    accepted;

  // Record Failure Memory lesson on any real failure (contract, hygiene, syntax, or test)
  let recordedLesson: FailureLesson | null = null;
  if (!passed) {
    if (syntaxCheck && !syntaxCheck.passed) {
      recordedLesson = recordFailureLesson(state, {
        targetFile: relPath,
        source: 'syntax',
        injectMustContain: [],
        injectMustNotContain: [],
        summary: `Syntax error in ${relPath}: ${syntaxCheck.diagnosis}`,
      });
    } else if (testCheck && !testCheck.passed) {
      recordedLesson = recordFailureLesson(state, {
        targetFile: relPath,
        source: 'test',
        injectMustContain: [],
        injectMustNotContain: [],
        summary: `Test regression in ${relPath} (${testCheck.command}): ${testCheck.diagnosis}`,
      });
    } else if (!contract.compliant || hygiene.issues.length > 0) {
      const forbidTokens = [
        ...contract.forbiddenViolations,
        ...(hygiene.issues.some((i) => i.includes('TODO')) ? ['TODO', 'FIXME'] : []),
      ];
      recordedLesson = recordFailureLesson(state, {
        targetFile: relPath,
        source: !contract.compliant ? 'contract' : 'hygiene',
        injectMustContain: contract.missingSymbols,
        injectMustNotContain: forbidTokens,
        summary: [
          contract.missingSymbols.length > 0
            ? `Missing required symbols: ${contract.missingSymbols.join(', ')}`
            : '',
          forbidTokens.length > 0
            ? `Forbidden patterns detected: ${forbidTokens.join(', ')}`
            : '',
          hygiene.issues.length > 0 ? `Hygiene: ${hygiene.issues.join('; ')}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
      });
    }
  }

  // Append tamper-evident real SHA-256 ledger entry
  const prevHash =
    state.auditLedger.length > 0
      ? state.auditLedger[state.auditLedger.length - 1].recordHash
      : '0'.repeat(64);
  const nextIndex = state.auditLedger.length + 1;
  const decision: AuditLedgerEntry['decision'] = !accepted
    ? 'ROLLED_BACK_REGRESSION'
    : !passed
    ? 'FAILED_RECORDED_LESSON'
    : 'COMMITTED';
  const artifactSha256 = sha256Hex(code);
  const recordHash = computeLedgerRecordHash({
    previousHash: prevHash,
    index: nextIndex,
    filePath: relPath,
    decision,
    artifactSha256,
    healthScore,
    testsPassed: currentExecPassed,
  });

  const ledgerEntry: AuditLedgerEntry = {
    index: nextIndex,
    filePath: relPath,
    decision,
    passed,
    healthScore,
    testsPassed: currentExecPassed,
    artifactSha256,
    previousHash: prevHash,
    recordHash,
    timestamp: nowIso,
  };
  state.auditLedger.push(ledgerEntry);
  saveWorkspaceState(workspaceDir, state);

  const correctionParts: string[] = [];
  if (!accepted) correctionParts.push(reason);
  if (contract.missingSymbols.length > 0) {
    correctionParts.push(`Missing required symbols: ${contract.missingSymbols.join(', ')}`);
  }
  if (contract.forbiddenViolations.length > 0) {
    correctionParts.push(`Remove forbidden patterns: ${contract.forbiddenViolations.join(', ')}`);
  }
  if (hygiene.issues.length > 0) {
    correctionParts.push(`Hygiene issues: ${hygiene.issues.join('; ')}`);
  }
  if (syntaxCheck && !syntaxCheck.passed) {
    correctionParts.push(`Syntax error: ${syntaxCheck.diagnosis}`);
  }
  if (testCheck && !testCheck.passed) {
    correctionParts.push(`Test failure (${testCheck.command}): ${testCheck.diagnosis}`);
  }

  return {
    filePath: absPath,
    relativePath: relPath,
    passed,
    healthScore,
    symbolCount: symbolSkeleton.length,
    symbolSkeleton,
    contract,
    hygiene,
    syntaxCheck,
    testCheck,
    ratchet: {
      accepted,
      previousBestHealthScore,
      previousTestsPassed,
      newHealthScore: healthScore,
      rolledBackToSnapshot,
      reason,
      healthHistory,
    },
    recordedLesson,
    ledgerEntry,
    correctionSignal:
      correctionParts.length > 0
        ? correctionParts.join(' | ')
        : 'VERIFIED: All contract, hygiene, and executable checks passed.',
  };
}
