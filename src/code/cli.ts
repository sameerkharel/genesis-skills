#!/usr/bin/env npx tsx
/**
 * ============================================================================
 * GENESIS CODE CLI v28.0 (`src/code/cli.ts`)
 * 100% Complete Successor CLI Harness (Supports both Lazy Positional & Flag CLI)
 * ============================================================================
 * Unites:
 *   1. v0 (`genesischain0`): Real Python ExecutableVerifier & Chained AuditLedger
 *   2. v25 Patch 16: Multi-Line Python + TS AST Skeleton & Persistent AntigenStore
 *   3. v26 Fusion:   Monotonic Workspace Ratchet & Snapshot Auto-Rollback on Disk
 *   4. v27/v28:      5-Layer Constitutional Auditor, Real Multi-Turn Lyapunov Gate,
 *                    and Cryptographically Chained AuditLedger (`.genesis/state.json`)
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  scanWorkspaceDependencyDag,
  computeSemanticSchemaFingerprint,
  verifyFileWithGuardrail,
  buildInformationHiddenLeafPrompt,
  verifyAuditLedgerChainIntegrity,
  loadPersistentWorkspaceState,
  FileVerificationReport,
} from './engine';

function parseCsv(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFlagsAndPositional(argv: string[]) {
  const command = (argv[2] || '').toLowerCase();
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
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

function main() {
  const { command, flags, positional } = parseFlagsAndPositional(process.argv);

  if (command === 'scan' || command === 'prepare') {
    const startedAt = performance.now();

    const firstPos = positional[0] || '.';
    const isFirstPosDir =
      fs.existsSync(path.resolve(firstPos)) &&
      fs.statSync(path.resolve(firstPos)).isDirectory();

    const targetDir = getFlag(flags, 'workspace', isFirstPosDir ? firstPos : '.');
    const targetFileFlag = getFlag(flags, 'target', '');
    const taskDescription = getFlag(
      flags,
      'task',
      isFirstPosDir
        ? positional[1] || 'Auto-discovered multi-file workspace build order and AST contract'
        : firstPos
    );

    const explicitMustContain = [
      ...(isFirstPosDir ? parseCsv(positional[2]) : parseCsv(positional[1])),
      ...(flags['must-contain'] || []),
    ];
    const explicitMustNotContain = [
      ...(isFirstPosDir ? parseCsv(positional[3]) : parseCsv(positional[2])),
      ...(flags['must-not-contain'] || []),
    ];
    const explicitConfigArg = isFirstPosDir ? positional[4] : positional[3];

    const dagReport = scanWorkspaceDependencyDag(targetDir);

    let explicitConfigReport = null;
    if (explicitConfigArg && explicitConfigArg.trim().length > 0) {
      const rawJson = fs.existsSync(path.resolve(explicitConfigArg))
        ? fs.readFileSync(path.resolve(explicitConfigArg), 'utf8')
        : explicitConfigArg;
      explicitConfigReport = computeSemanticSchemaFingerprint(rawJson);
    }

    // Merge Warm Antigens persisted from earlier Cold Runs in `.genesis/state.json`
    const warmAntigens = dagReport.loadedWarmAntigens.filter((ag) => {
      if (!targetFileFlag) return true;
      const normTarget = targetFileFlag.replace(/\\/g, '/');
      const pat = ag.targetFilePattern || '*';
      return (
        pat === '*' ||
        pat === normTarget ||
        normTarget.endsWith(pat)
      );
    });

    const warmMustContain = warmAntigens.flatMap((a) => a.injectMustContain);
    const warmMustNotContain = warmAntigens.flatMap((a) => a.injectMustNotContain);

    const mergedMustContain = Array.from(
      new Set([...explicitMustContain, ...warmMustContain])
    );

    const allIgnoredDecoys = Array.from(
      new Set([
        ...dagReport.configSanitizationReports.flatMap((r) => r.ignoredNoiseAndDecoyKeys),
        ...(explicitConfigReport?.ignoredNoiseAndDecoyKeys ?? []),
        ...explicitMustNotContain,
        ...warmMustNotContain,
      ])
    );

    const activeTargetRel =
      targetFileFlag.replace(/\\/g, '/') ||
      dagReport.wavefrontBuildOrder[dagReport.wavefrontBuildOrder.length - 1] ||
      '';
    const targetNode = dagReport.files.find((f) => f.relativePath === activeTargetRel);
    const siblingNodes = dagReport.files.filter((f) => f.relativePath !== activeTargetRel);
    const siblingSkeleton = siblingNodes
      .map((f) => `# File: ${f.relativePath}\n${f.astSkeleton.join('\n')}`)
      .join('\n\n');

    const compiledLeafPrompt = buildInformationHiddenLeafPrompt({
      astSkeleton:
        targetNode && targetNode.astSkeleton.length > 0
          ? targetNode.astSkeleton.join('\n')
          : `Target file: ${activeTargetRel}\nTask: ${taskDescription}`,
      returnSchema: 'Complete, self-contained module satisfying all required tokens and dependency signatures',
      contractMustContain: mergedMustContain,
      siblingAstSkeleton: siblingSkeleton,
      scopedAntigens: warmAntigens.map((a, idx) => ({
        id: a.antigenId,
        masterSkillId: 'Workspace',
        subSkillId: a.targetFilePattern || activeTargetRel || 'global',
        failurePattern: a.lesson,
        injectMustContain: a.injectMustContain,
        injectMustNotContain: a.injectMustNotContain,
        discoveredAtIteration: idx + 1,
      })),
    });

    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));

    console.log(
      JSON.stringify(
        {
          skill: 'genesis-code',
          engineVersion: '28.0.0-SUCCESSOR',
          command,
          elapsedMs,
          taskDescription,
          targetFile: activeTargetRel,
          wavefrontBuildOrder: dagReport.wavefrontBuildOrder,
          wavefrontLayers: dagReport.wavefrontLayers,
          totalCodeFiles: dagReport.totalCodeFiles,
          astSkeletonsByFile: Object.fromEntries(
            dagReport.files.map((f) => [
              f.relativePath,
              {
                imports: f.importsLocalFiles,
                symbols: f.astSkeleton,
              },
            ])
          ),
          loadedWarmAntigensCount: warmAntigens.length,
          loadedWarmAntigens: warmAntigens,
          configSanitization:
            explicitConfigReport ?? dagReport.configSanitizationReports,
          guardrailRules: {
            mustContain: mergedMustContain,
            mustContainSymbols: mergedMustContain,
            mustNotContain: allIgnoredDecoys,
            forbiddenAndDecoyPatternsToReject: allIgnoredDecoys,
          },
          compiledLeafPrompt,
          agentExecutionDirective: [
            `1. BUILD ORDER: Edit files strictly in wavefrontBuildOrder: [${dagReport.wavefrontBuildOrder.join(' -> ')}].`,
            '2. ZERO DIRECTORY EXPLORATION: Do NOT waste turns running ls/dir; all file paths and multi-line AST symbol skeletons are listed above.',
            mergedMustContain.length > 0
              ? `3. MANDATORY CONTRACT & WARM ANTIGEN INVARIANTS: Must include [${mergedMustContain.join(', ')}] on Pass 1.`
              : '3. HYGIENE GUARD: Leave zero TODO/FIXME/NotImplementedError stubs.',
            allIgnoredDecoys.length > 0
              ? `4. SECURITY / DECOY TRAP GUARD: Strictly ignore and NEVER implement these decoy/forbidden keys: [${allIgnoredDecoys.join(', ')}].`
              : '4. MONOTONIC RATCHET ACTIVE: Verify immediately after writing.',
          ],
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'verify') {
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
      ...(flags['must-contain'] || []),
    ];
    const mustNotContain = [
      ...parseCsv(positional[2]),
      ...(flags['must-not-contain'] || []),
    ];
    const enableRatchetRollback = getFlag(flags, 'rollback', 'true') !== 'false';

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

    if (stat.isDirectory()) {
      const dag = scanWorkspaceDependencyDag(absTarget);
      const decoys = dag.configSanitizationReports.flatMap(
        (c) => c.ignoredNoiseAndDecoyKeys
      );
      const candidateFiles = dag.wavefrontBuildOrder.filter(
        (f) => !f.includes('genesis-code-cli') && !f.includes('genesis-video-cli')
      );

      // Map workspace-wide mustContain tokens to the files where they appear;
      // any token missing from ALL files is assigned to the final file so directory verify catches it.
      const fileContents = new Map<string, string>();
      for (const fileShort of candidateFiles) {
        const fullP = path.join(absTarget, fileShort);
        fileContents.set(
          fileShort,
          fs.existsSync(fullP) ? fs.readFileSync(fullP, 'utf8') : ''
        );
      }

      const unmatchedGlobalMustContain = mustContain.filter(
        (token) =>
          !Array.from(fileContents.values()).some((content) => content.includes(token))
      );

      for (let i = 0; i < candidateFiles.length; i++) {
        const fileShort = candidateFiles[i];
        const content = fileContents.get(fileShort) || '';
        const isLastFile = i === candidateFiles.length - 1;
        const fileScopedMustContain = [
          ...mustContain.filter((token) => content.includes(token)),
          ...(isLastFile ? unmatchedGlobalMustContain : []),
        ];

        reports.push(
          verifyFileWithGuardrail({
            filePath: path.join(absTarget, fileShort),
            workspaceDir,
            mustContain: fileScopedMustContain,
            mustNotContain,
            autoDecoyKeys: decoys,
            enableRatchetRollback,
          })
        );
      }
    } else {
      reports.push(
        verifyFileWithGuardrail({
          filePath: absTarget,
          workspaceDir,
          mustContain,
          mustNotContain,
          enableRatchetRollback,
        })
      );
    }

    const allPassed = reports.every((r) => r.passed);
    const minShs =
      reports.length > 0
        ? Math.min(...reports.map((r) => r.overallShs))
        : 1.0;
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    const primaryReport = reports[0] || null;

    console.log(
      JSON.stringify(
        {
          skill: 'genesis-code',
          engineVersion: '28.0.0-SUCCESSOR',
          command: 'verify',
          elapsedMs,
          filesAuditedCount: reports.length,
          minStepHealthScore: minShs,
          overallShs: primaryReport ? primaryReport.overallShs : minShs,
          passed: allPassed,
          allPassed,
          finalVerdict: allPassed
            ? 'REAL_FILE_CONSTITUTIONALLY_CERTIFIED'
            : 'REAL_FILE_FAILED_CONTRACT_SEE_CORRECTION_SIGNAL',
          ratchetDecision: primaryReport ? primaryReport.ratchetDecision : null,
          newlyRecordedAntigen: primaryReport ? primaryReport.newlyRecordedAntigen : null,
          constitutionalAudit: primaryReport ? primaryReport.constitutionalAudit : null,
          ledgerEntry: primaryReport ? primaryReport.ledgerEntry : null,
          correctionSignal: primaryReport ? primaryReport.correctionSignal : '',
          fileReports: reports.map((r) => ({
            filePath: path.relative(workspaceDir, r.filePath).replace(/\\/g, '/') || r.filePath,
            passed: r.passed,
            overallShs: r.overallShs,
            status: r.status,
            astSymbolCount: r.astSymbolCount,
            missingItems: r.socCompliance.missingItems,
            violations: r.socCompliance.violations,
            hygieneIssues: r.hygieneIssues,
            ratchetDecision: r.ratchetDecision,
            newlyRecordedAntigen: r.newlyRecordedAntigen,
            constitutionalAudit: r.constitutionalAudit,
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
    return;
  }

  if (command === 'audit') {
    const workspaceDir = path.resolve(
      getFlag(flags, 'workspace', positional[0] || process.cwd())
    );
    const state = loadPersistentWorkspaceState(workspaceDir);
    const chainValid = verifyAuditLedgerChainIntegrity(state.auditLedger);

    console.log(
      JSON.stringify(
        {
          skill: 'genesis-code',
          engineVersion: state.version,
          workspaceRoot: state.workspaceRoot,
          antigensCount: state.antigens.length,
          antigens: state.antigens,
          ratchetedFiles: Object.values(state.filesRatchet),
          auditLedgerEntries: state.auditLedger.length,
          ledgerChainValid: chainValid,
        },
        null,
        2
      )
    );
    if (!chainValid) process.exitCode = 1;
    return;
  }

  console.log(`====================================================================
GENESIS CODE SKILL CLI
====================================================================
Quick 1-Command Usage:
  npx tsx scripts/genesis/genesis-code-cli.ts prepare [dir]
  npx tsx scripts/genesis/genesis-code-cli.ts verify [file_or_dir]
  npx tsx scripts/genesis/genesis-code-cli.ts audit [dir]

Explicit Contract / Flag Mode:
  npx tsx scripts/genesis/genesis-code-cli.ts prepare [dir] "<task>" "must1,must2" "forbid1,forbid2" [config.json]
  npx tsx scripts/genesis/genesis-code-cli.ts verify <file_or_dir> "must1,must2" "forbid1,forbid2" [--rollback false]
`);
}

main();
