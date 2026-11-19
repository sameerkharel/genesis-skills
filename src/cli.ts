#!/usr/bin/env npx tsx
/**
 * GENESIS Code CLI (`src/cli.ts`)
 *
 * Commands:
 *   prepare [dir] ["task"] ["must1,must2"] ["forbid1,forbid2"] [config.json]
 *   verify  [file_or_dir] ["must1,must2"] ["forbid1,forbid2"] [--syntax] [--test "<cmd>"] [--no-rollback]
 *   audit   [dir]
 *   lessons [dir] [--clear]
 *   hook    [--workspace <dir>] [--syntax] [--test "<cmd>"]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanWorkspaceDag, sanitizeConfigJson } from './dag';
import {
  FileVerificationReport,
  runExecutableTestCommand,
  verifyFile,
} from './verifier';
import {
  loadWorkspaceState,
  saveWorkspaceState,
  verifyAuditLedgerChain,
} from './state';

const BOOLEAN_FLAGS = new Set(['syntax', 'no-rollback', 'clear', 'help']);

function parseCsv(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]) {
  const command = (argv[2] || '').toLowerCase();
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = ['true'];
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        if (!flags[key]) flags[key] = [];
        flags[key].push(next);
        i++;
      } else {
        flags[key] = ['true'];
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, flags, positional };
}

function getFlag(flags: Record<string, string[]>, key: string, fallback = ''): string {
  return flags[key] && flags[key][0] ? flags[key][0] : fallback;
}

function hasFlag(flags: Record<string, string[]>, key: string): boolean {
  return Boolean(flags[key] && flags[key].length > 0 && flags[key][0] !== 'false');
}

function handlePrepare(flags: Record<string, string[]>, positional: string[]) {
  const startedAt = performance.now();

  const firstPos = positional[0] || '.';
  const resolvedFirst = path.resolve(firstPos);
  const isFirstPosDir = fs.existsSync(resolvedFirst) && fs.statSync(resolvedFirst).isDirectory();

  const targetDir = getFlag(flags, 'workspace', isFirstPosDir ? firstPos : '.');
  const taskDescription = getFlag(
    flags,
    'task',
    isFirstPosDir
      ? positional[1] || 'Workspace dependency scan and contract preparation'
      : firstPos
  );

  const explicitMustContain = [
    ...(isFirstPosDir ? parseCsv(positional[2]) : parseCsv(positional[1])),
    ...(flags['must-contain'] || []).flatMap(parseCsv),
  ];
  const explicitMustNotContain = [
    ...(isFirstPosDir ? parseCsv(positional[3]) : parseCsv(positional[2])),
    ...(flags['must-not-contain'] || []).flatMap(parseCsv),
  ];
  const explicitConfigArg = getFlag(
    flags,
    'config',
    isFirstPosDir ? positional[4] || '' : positional[3] || ''
  );

  const dag = scanWorkspaceDag(targetDir);

  let explicitConfigReport = null;
  if (explicitConfigArg.trim().length > 0) {
    const resolvedCfg = path.resolve(explicitConfigArg);
    const rawJson = fs.existsSync(resolvedCfg)
      ? fs.readFileSync(resolvedCfg, 'utf8')
      : explicitConfigArg;
    explicitConfigReport = sanitizeConfigJson(rawJson, explicitConfigArg);
  }

  const learnedMustContain = dag.loadedFailureLessons.flatMap((l) => l.injectMustContain);
  const learnedMustNotContain = dag.loadedFailureLessons.flatMap((l) => l.injectMustNotContain);

  const mergedMustContain = Array.from(new Set([...explicitMustContain, ...learnedMustContain]));
  const mergedForbidden = Array.from(
    new Set([
      ...dag.configSanitizationReports.flatMap((r) => r.ignoredNoiseAndDecoyKeys),
      ...(explicitConfigReport?.ignoredNoiseAndDecoyKeys ?? []),
      ...explicitMustNotContain,
      ...learnedMustNotContain,
    ])
  );

  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));

  console.log(
    JSON.stringify(
      {
        tool: 'genesis-code',
        version: '2.0.0',
        command: 'prepare',
        elapsedMs,
        taskDescription,
        workspaceRoot: dag.workspaceRoot,
        totalCodeFiles: dag.totalCodeFiles,
        hasImportCycles: dag.hasCycles,
        wavefrontBuildOrder: dag.wavefrontBuildOrder,
        wavefrontLayers: dag.wavefrontLayers,
        symbolSkeletonsByFile: Object.fromEntries(
          dag.files.map((f) => [
            f.relativePath,
            {
              language: f.language,
              imports: f.importsLocalFiles,
              symbols: f.symbolSkeleton,
            },
          ])
        ),
        configSanitization: explicitConfigReport
          ? [explicitConfigReport]
          : dag.configSanitizationReports,
        failureMemoryCount: dag.loadedFailureLessons.length,
        failureMemoryLessons: dag.loadedFailureLessons,
        guardrails: {
          mustContainSymbols: mergedMustContain,
          forbiddenAndDecoyPatterns: mergedForbidden,
        },
      },
      null,
      2
    )
  );
}

function handleVerify(flags: Record<string, string[]>, positional: string[]) {
  const startedAt = performance.now();

  const workspaceFlag = getFlag(flags, 'workspace', '');
  const fileFlag = getFlag(flags, 'file', '');
  const targetPath = fileFlag
    ? workspaceFlag
      ? path.join(workspaceFlag, fileFlag)
      : fileFlag
    : positional[0] || '.';

  const mustContain = [
    ...parseCsv(positional[1]),
    ...(flags['must-contain'] || []).flatMap(parseCsv),
  ];
  const mustNotContain = [
    ...parseCsv(positional[2]),
    ...(flags['must-not-contain'] || []).flatMap(parseCsv),
  ];

  const enableRatchetRollback =
    !hasFlag(flags, 'no-rollback') && getFlag(flags, 'rollback', 'true') !== 'false';
  const runSyntax = hasFlag(flags, 'syntax');
  const testCommand = getFlag(flags, 'test', '');

  const absTarget = path.resolve(targetPath);
  if (!fs.existsSync(absTarget)) {
    console.error(JSON.stringify({ error: `Target path does not exist: ${targetPath}` }));
    process.exit(1);
  }

  const stat = fs.statSync(absTarget);
  const workspaceDir = workspaceFlag
    ? path.resolve(workspaceFlag)
    : stat.isDirectory()
    ? absTarget
    : path.dirname(absTarget);

  const reports: FileVerificationReport[] = [];

  // Run workspace-wide `--test` command once when verifying a directory so we don't repeat slow test suites N times
  const sharedTestResult =
    stat.isDirectory() && testCommand
      ? runExecutableTestCommand(testCommand, workspaceDir)
      : undefined;

  if (stat.isDirectory()) {
    const dag = scanWorkspaceDag(absTarget);
    const decoys = dag.configSanitizationReports.flatMap((c) => c.ignoredNoiseAndDecoyKeys);
    const candidateFiles = dag.wavefrontBuildOrder.filter(
      (f) => !f.startsWith('scripts/genesis/') && !f.includes('genesis-code-cli')
    );

    const fileContents = new Map<string, string>();
    for (const rel of candidateFiles) {
      const fullP = path.join(absTarget, rel);
      fileContents.set(rel, fs.existsSync(fullP) ? fs.readFileSync(fullP, 'utf8') : '');
    }

    const unmatchedGlobalMustContain = mustContain.filter(
      (tok) =>
        !Array.from(fileContents.values()).some((content) =>
          content.toLowerCase().includes(tok.toLowerCase())
        )
    );

    for (let i = 0; i < candidateFiles.length; i++) {
      const rel = candidateFiles[i];
      const content = fileContents.get(rel) || '';
      const isLast = i === candidateFiles.length - 1;
      const fileScopedMust = [
        ...mustContain.filter((tok) => content.toLowerCase().includes(tok.toLowerCase())),
        ...(isLast ? unmatchedGlobalMustContain : []),
      ];

      reports.push(
        verifyFile({
          filePath: path.join(absTarget, rel),
          workspaceDir,
          mustContain: fileScopedMust,
          mustNotContain,
          autoDecoyKeys: decoys,
          enableRatchetRollback,
          runSyntax,
          precomputedTestResult: sharedTestResult ?? null,
        })
      );
    }
  } else {
    reports.push(
      verifyFile({
        filePath: absTarget,
        workspaceDir,
        mustContain,
        mustNotContain,
        enableRatchetRollback,
        runSyntax,
        testCommand: testCommand || undefined,
      })
    );
  }

  const allPassed = reports.every((r) => r.passed);
  const minHealthScore =
    reports.length > 0 ? Math.min(...reports.map((r) => r.healthScore)) : 1.0;
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
  const rolledBackFiles = reports
    .filter((r) => r.ratchet.rolledBackToSnapshot)
    .map((r) => r.relativePath);

  console.log(
    JSON.stringify(
      {
        tool: 'genesis-code',
        version: '2.0.0',
        command: 'verify',
        elapsedMs,
        filesAuditedCount: reports.length,
        minHealthScore,
        passed: allPassed,
        verdict: allPassed ? 'VERIFIED' : 'FAILED_SEE_CORRECTION_SIGNAL',
        rolledBackFiles,
        testSummary: sharedTestResult ?? (reports.length === 1 ? reports[0].testCheck : null),
        fileReports: reports.map((r) => ({
          filePath: r.relativePath,
          passed: r.passed,
          healthScore: r.healthScore,
          symbolCount: r.symbolCount,
          missingSymbols: r.contract.missingSymbols,
          forbiddenViolations: r.contract.forbiddenViolations,
          hygieneIssues: r.hygiene.issues,
          syntaxCheck: r.syntaxCheck
            ? {
                passed: r.syntaxCheck.passed,
                diagnosis: r.syntaxCheck.diagnosis,
                elapsedMs: r.syntaxCheck.elapsedMs,
              }
            : null,
          testCheck: r.testCheck
            ? {
                command: r.testCheck.command,
                passed: r.testCheck.passed,
                exitCode: r.testCheck.exitCode,
                diagnosis: r.testCheck.diagnosis,
                elapsedMs: r.testCheck.elapsedMs,
              }
            : null,
          ratchet: {
            accepted: r.ratchet.accepted,
            rolledBackToSnapshot: r.ratchet.rolledBackToSnapshot,
            previousBestHealthScore: r.ratchet.previousBestHealthScore,
            newHealthScore: r.ratchet.newHealthScore,
            reason: r.ratchet.reason,
          },
          recordedLesson: r.recordedLesson,
          correctionSignal: r.correctionSignal,
        })),
      },
      null,
      2
    )
  );

  if (!allPassed) {
    process.exitCode = 1;
  }
}

function handleAudit(flags: Record<string, string[]>, positional: string[]) {
  const workspaceDir = path.resolve(getFlag(flags, 'workspace', positional[0] || process.cwd()));
  const state = loadWorkspaceState(workspaceDir);
  const chainCheck = verifyAuditLedgerChain(state.auditLedger);

  console.log(
    JSON.stringify(
      {
        tool: 'genesis-code',
        version: '2.0.0',
        command: 'audit',
        workspaceRoot: state.workspaceRoot,
        failureMemoryCount: state.lessons.length,
        failureMemoryLessons: state.lessons,
        ratchetedFilesCount: Object.keys(state.ratchet).length,
        ratchetedFiles: Object.values(state.ratchet).map((r) => ({
          relativePath: r.relativePath,
          bestHealthScore: r.bestHealthScore,
          lastTestsPassed: r.lastTestsPassed,
          bestArtifactSha256: r.bestArtifactSha256,
          attemptsCount: r.attemptsCount,
          updatedAt: r.updatedAt,
        })),
        auditLedgerEntries: state.auditLedger.length,
        ledgerChainValid: chainCheck.valid,
        brokenAtIndex: chainCheck.brokenAtIndex,
      },
      null,
      2
    )
  );

  if (!chainCheck.valid) {
    process.exitCode = 1;
  }
}

function handleLessons(flags: Record<string, string[]>, positional: string[]) {
  const workspaceDir = path.resolve(getFlag(flags, 'workspace', positional[0] || process.cwd()));
  const state = loadWorkspaceState(workspaceDir);

  if (hasFlag(flags, 'clear')) {
    const clearedCount = state.lessons.length;
    state.lessons = [];
    saveWorkspaceState(workspaceDir, state);
    console.log(
      JSON.stringify(
        {
          tool: 'genesis-code',
          command: 'lessons',
          action: 'cleared',
          clearedCount,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        tool: 'genesis-code',
        command: 'lessons',
        workspaceRoot: state.workspaceRoot,
        lessonsCount: state.lessons.length,
        lessons: state.lessons,
      },
      null,
      2
    )
  );
}

/**
 * Native `PostToolUse` Hook Handler for Claude Code / Cursor / Antigravity hooks.
 * Reads the standard hook JSON payload from stdin, extracts `tool_input.file_path`
 * (or `file_path`), runs `verifyFile`, and outputs structured feedback.
 * Exits with code 2 (standard Claude Code blocking feedback code) on violation/rollback.
 */
function handlePostToolUseHook(flags: Record<string, string[]>) {
  let rawStdin = '';
  try {
    rawStdin = fs.readFileSync(0, 'utf8');
  } catch {
    // Empty stdin
  }

  let payload: Record<string, unknown> = {};
  if (rawStdin.trim()) {
    try {
      payload = JSON.parse(rawStdin) as Record<string, unknown>;
    } catch {
      // Ignore malformed stdin
    }
  }

  const toolInput = (payload.tool_input as Record<string, unknown>) || payload;
  const targetFileRaw =
    (typeof toolInput.file_path === 'string' && toolInput.file_path) ||
    (typeof toolInput.path === 'string' && toolInput.path) ||
    getFlag(flags, 'file', '');

  if (!targetFileRaw) {
    console.log(JSON.stringify({ hook: 'genesis-code', skipped: true, reason: 'No file_path in payload' }));
    return;
  }

  const absFile = path.resolve(targetFileRaw);
  if (!fs.existsSync(absFile) || !/\.(ts|tsx|py|js|mjs)$/.test(absFile)) {
    console.log(
      JSON.stringify({
        hook: 'genesis-code',
        skipped: true,
        reason: 'Target is missing or not a tracked source file (.ts/.tsx/.py/.js/.mjs)',
      })
    );
    return;
  }

  const workspaceDir = path.resolve(
    getFlag(flags, 'workspace', (typeof payload.cwd === 'string' && payload.cwd) || process.cwd())
  );
  const runSyntax = hasFlag(flags, 'syntax');
  const testCommand = getFlag(flags, 'test', '');
  const enableRatchetRollback = !hasFlag(flags, 'no-rollback');

  const report = verifyFile({
    filePath: absFile,
    workspaceDir,
    enableRatchetRollback,
    runSyntax,
    testCommand: testCommand || undefined,
  });

  if (report.passed) {
    console.log(
      JSON.stringify({
        hook: 'genesis-code',
        decision: 'allow',
        filePath: report.relativePath,
        healthScore: report.healthScore,
      })
    );
    return;
  }

  const feedback = {
    hook: 'genesis-code',
    decision: 'block',
    filePath: report.relativePath,
    rolledBackToSnapshot: report.ratchet.rolledBackToSnapshot,
    reason: report.correctionSignal,
    recordedLesson: report.recordedLesson?.summary ?? null,
  };
  console.error(JSON.stringify(feedback, null, 2));
  process.exitCode = 2;
}

function main() {
  const { command, flags, positional } = parseArgs(process.argv);

  if (command === 'prepare' || command === 'scan') {
    handlePrepare(flags, positional);
    return;
  }
  if (command === 'verify') {
    handleVerify(flags, positional);
    return;
  }
  if (command === 'audit') {
    handleAudit(flags, positional);
    return;
  }
  if (command === 'lessons') {
    handleLessons(flags, positional);
    return;
  }
  if (command === 'hook') {
    handlePostToolUseHook(flags);
    return;
  }

  console.log(`GENESIS Code CLI v2.0.0 — Deterministic Guardrails for AI Coding Agents

Commands:
  prepare [dir] ["task"] ["must1,must2"] ["forbid1,forbid2"] [config.json]
      Scan dependency DAG, extract multi-line symbol skeletons, sanitize JSON decoy keys,
      and load persistent Failure Memory from .genesis/state.json.

  verify [file_or_dir] ["must1,must2"] ["forbid1,forbid2"] [--syntax] [--test "<cmd>"] [--no-rollback]
      Verify contract, hygiene, optional real syntax/test command, auto-rollback on regression,
      record Failure Memory lessons, and append a real SHA-256 ledger entry.

  audit [dir]
      Verify the SHA-256 audit ledger hash chain and inspect ratcheted snapshots & lessons.

  lessons [dir] [--clear]
      Inspect or clear learned cross-session Failure Memory entries.

  hook [--workspace <dir>] [--syntax] [--test "<cmd>"]
      Native PostToolUse hook handler (reads Claude Code / Cursor hook JSON from stdin).
`);
}

main();
