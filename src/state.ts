/**
 * Persistent Workspace State Store (`.genesis/state.json`).
 *
 * Manages three concrete, disk-backed reliability primitives:
 *   1. Failure Memory (`lessons`): Cross-session failure signatures recorded when
 *      a static contract, syntax check, or test command fails.
 *   2. Monotonic File Ratchet (`ratchet`): Best verified snapshot per file on disk,
 *      enabling automatic rollback when a subsequent edit introduces a regression.
 *   3. Tamper-Evident Audit Ledger (`auditLedger`): Real SHA-256 hash chain
 *      (`previousHash -> recordHash`) recording every verification decision.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Hex } from './hash';

export interface FailureLesson {
  lessonId: string;
  targetFile: string;
  source: 'contract' | 'hygiene' | 'syntax' | 'test';
  injectMustContain: string[];
  injectMustNotContain: string[];
  summary: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface FileRatchetRecord {
  relativePath: string;
  bestHealthScore: number;
  lastTestsPassed: boolean | null;
  bestSnapshotCode: string;
  bestArtifactSha256: string;
  healthHistory: number[];
  attemptsCount: number;
  updatedAt: string;
}

export interface AuditLedgerEntry {
  index: number;
  filePath: string;
  decision: 'COMMITTED' | 'ROLLED_BACK_REGRESSION' | 'FAILED_RECORDED_LESSON';
  passed: boolean;
  healthScore: number;
  testsPassed: boolean | null;
  artifactSha256: string;
  previousHash: string;
  recordHash: string;
  timestamp: string;
}

export interface PersistentWorkspaceState {
  schemaVersion: '2.0.0';
  workspaceRoot: string;
  lessons: FailureLesson[];
  ratchet: Record<string, FileRatchetRecord>;
  auditLedger: AuditLedgerEntry[];
}

export const GENESIS_STATE_RELATIVE_PATH = path.join('.genesis', 'state.json');

export function getStateFilePath(workspaceDir: string): string {
  return path.join(path.resolve(workspaceDir), GENESIS_STATE_RELATIVE_PATH);
}

export function createEmptyState(workspaceDir: string): PersistentWorkspaceState {
  return {
    schemaVersion: '2.0.0',
    workspaceRoot: path.resolve(workspaceDir),
    lessons: [],
    ratchet: {},
    auditLedger: [],
  };
}

export function loadWorkspaceState(workspaceDir: string): PersistentWorkspaceState {
  const absRoot = path.resolve(workspaceDir);
  const statePath = getStateFilePath(absRoot);

  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Partial<PersistentWorkspaceState>;
      if (parsed && parsed.schemaVersion === '2.0.0') {
        return {
          schemaVersion: '2.0.0',
          workspaceRoot: parsed.workspaceRoot || absRoot,
          lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
          ratchet: parsed.ratchet && typeof parsed.ratchet === 'object' ? parsed.ratchet : {},
          auditLedger: Array.isArray(parsed.auditLedger) ? parsed.auditLedger : [],
        };
      }
    } catch {
      // Fall through to clean state if corrupted
    }
  }

  return createEmptyState(absRoot);
}

export function saveWorkspaceState(
  workspaceDir: string,
  state: PersistentWorkspaceState
): void {
  const statePath = getStateFilePath(workspaceDir);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function computeLedgerRecordHash(entry: {
  previousHash: string;
  index: number;
  filePath: string;
  decision: AuditLedgerEntry['decision'];
  artifactSha256: string;
  healthScore: number;
  testsPassed: boolean | null;
}): string {
  const canonical = [
    entry.previousHash,
    String(entry.index),
    entry.filePath,
    entry.decision,
    entry.artifactSha256,
    entry.healthScore.toFixed(4),
    String(entry.testsPassed),
  ].join(':');
  return sha256Hex(canonical);
}

/**
 * Verifies cryptographic continuity across every entry in the audit ledger.
 * Returns both a boolean and the first corrupted index (if any).
 */
export function verifyAuditLedgerChain(ledger: AuditLedgerEntry[]): {
  valid: boolean;
  entriesChecked: number;
  brokenAtIndex: number | null;
} {
  let expectedPrev = '0'.repeat(64);
  for (let i = 0; i < ledger.length; i++) {
    const entry = ledger[i];
    if (entry.index !== i + 1 || entry.previousHash !== expectedPrev) {
      return { valid: false, entriesChecked: i + 1, brokenAtIndex: i };
    }
    const recomputed = computeLedgerRecordHash({
      previousHash: entry.previousHash,
      index: entry.index,
      filePath: entry.filePath,
      decision: entry.decision,
      artifactSha256: entry.artifactSha256,
      healthScore: entry.healthScore,
      testsPassed: entry.testsPassed,
    });
    if (entry.recordHash !== recomputed) {
      return { valid: false, entriesChecked: i + 1, brokenAtIndex: i };
    }
    expectedPrev = entry.recordHash;
  }
  return { valid: true, entriesChecked: ledger.length, brokenAtIndex: null };
}

/**
 * Upserts a FailureLesson into persistent workspace memory (incrementing
 * `occurrences` if the same failure signature recurs).
 */
export function recordFailureLesson(
  state: PersistentWorkspaceState,
  input: {
    targetFile: string;
    source: FailureLesson['source'];
    injectMustContain: string[];
    injectMustNotContain: string[];
    summary: string;
  }
): FailureLesson {
  const now = new Date().toISOString();
  const signatureKey = [
    input.targetFile,
    input.source,
    [...input.injectMustContain].sort().join(','),
    [...input.injectMustNotContain].sort().join(','),
    input.summary.slice(0, 120),
  ].join('|');

  const lessonId = `lesson_${sha256Hex(signatureKey).slice(0, 12)}`;
  const existing = state.lessons.find((l) => l.lessonId === lessonId);

  if (existing) {
    existing.occurrences += 1;
    existing.lastSeenAt = now;
    return existing;
  }

  const created: FailureLesson = {
    lessonId,
    targetFile: input.targetFile,
    source: input.source,
    injectMustContain: Array.from(new Set(input.injectMustContain)),
    injectMustNotContain: Array.from(new Set(input.injectMustNotContain)),
    summary: input.summary,
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  };
  state.lessons.push(created);
  return created;
}
