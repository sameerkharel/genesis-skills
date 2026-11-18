import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import {
  scanWorkspaceDependencyDag,
  computeSemanticSchemaFingerprint,
  extractAstSymbolSkeleton,
  verifyFileWithGuardrail,
  createImmutableRootConstitution,
  ASTWorkspace,
  buildInformationHiddenLeafPrompt,
  verifyPromptInformationHiding,
  spawnElasticMicroSkill,
  evaluateWithConstitutionalAuditor,
  tryTearForwardPayload,
  loadPersistentWorkspaceState,
  verifyAuditLedgerChainIntegrity,
  runExecutablePythonChecks,
} from '../src/code/engine';
import {
  compileMultiShotContinuityPack,
  computeSemanticVideoTrackFingerprint,
  extractLastFrameAnchorPng,
  auditAndBlendRealMp4Pair,
  MultiShotStoryboardSpec,
  createVisualWorldConstitution,
  spawnSpatioTemporalMicroSkill,
  evaluateWithVisualConstitutionalAuditor,
} from '../src/video/engine';

const DIST_ROOT = path.resolve(__dirname, '..');
const SAMPLE_PROJECT_DIR = path.join(DIST_ROOT, 'examples', 'sample-code-project');
const SAMPLE_STORYBOARD_PATH = path.join(DIST_ROOT, 'examples', 'sample-storyboard.json');
const TSX_EXEC_ARGV = process.execArgv.filter((a) => !a.startsWith('--test'));

test('genesis-code: scanWorkspaceDependencyDag computes exact leaf-to-root wavefront order', () => {
  const dag = scanWorkspaceDependencyDag(SAMPLE_PROJECT_DIR);
  assert.equal(dag.totalCodeFiles, 3);
  assert.deepEqual(dag.wavefrontBuildOrder, ['types.ts', 'storage.ts', 'gateway.ts']);
  assert.equal(dag.wavefrontLayers.length, 3);
  assert.deepEqual(dag.wavefrontLayers[0], ['types.ts']);
  assert.deepEqual(dag.wavefrontLayers[1], ['storage.ts']);
  assert.deepEqual(dag.wavefrontLayers[2], ['gateway.ts']);
});

test('genesis-code: computeSemanticSchemaFingerprint isolates prompt-injection decoy keys', () => {
  const rawJson = fs.readFileSync(
    path.join(SAMPLE_PROJECT_DIR, 'cluster_config.json'),
    'utf8'
  );
  const fp = computeSemanticSchemaFingerprint(rawJson);

  assert.deepEqual(fp.activeSchemaKeys, [
    'cluster_id',
    'crc32_strict_mode',
    'fence_epoch_min',
    'quorum_size',
  ]);
  assert.ok(fp.ignoredNoiseAndDecoyKeys.includes('_debug_bypass_crc_and_fencing'));
  assert.ok(fp.ignoredNoiseAndDecoyKeys.includes('recommended_unverified_tool'));
  assert.ok(fp.ignoredNoiseAndDecoyKeys.includes('_comment'));
});

test('genesis-code (v28.0): extractAstSymbolSkeleton stitches multi-line Python and TypeScript signatures', () => {
  const gatewayCode = fs.readFileSync(
    path.join(SAMPLE_PROJECT_DIR, 'gateway.ts'),
    'utf8'
  );
  const skeleton = extractAstSymbolSkeleton(gatewayCode);
  assert.ok(skeleton.includes('export class ReplicatedGateway'));
  assert.ok(skeleton.includes('public commitWrite(entry: WalEntry): CommitResult'));
  assert.ok(!skeleton.includes('STALE_FENCE_TOKEN_REJECTED'));

  const multiLinePy = [
    'class ResilientClient:',
    '    def __init__(',
    '        self,',
    '        timeout_sec: float = 30.0,',
    '        max_retries: int = 3,',
    '    ) -> None:',
    '        self.timeout = timeout_sec',
  ].join('\n');
  const pySkel = extractAstSymbolSkeleton(multiLinePy);
  assert.ok(pySkel.includes('    def __init__(self, timeout_sec: float = 30.0, max_retries: int = 3,) -> None: ...'));
});

test('genesis-code (v28.0): verifyFileWithGuardrail certifies clean files, persists Antigens, and auto-rolls back degraded retries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-v28-test-'));
  try {
    const targetFile = path.join(tmpDir, 'token_bucket.ts');
    const validCodeV1 = [
      'export class TokenBucket {',
      '  private tokens: number = 10;',
      '  private readonly capacity: number = 10;',
      '  public consume(amount: number = 1): boolean {',
      '    const braceLiteral = "{";',
      '    if (this.tokens >= amount && braceLiteral.length === 1) {',
      '      this.tokens -= amount;',
      '      return true;',
      '    }',
      '    return false;',
      '  }',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(targetFile, validCodeV1, 'utf8');

    // Pass 1: Clean file with string-literal "{" passes with SHS=1.0
    const cleanReport = verifyFileWithGuardrail({
      filePath: targetFile,
      workspaceDir: tmpDir,
      mustContain: ['class TokenBucket', 'consume'],
      enableRatchetRollback: true,
    });
    assert.equal(cleanReport.passed, true);
    assert.equal(cleanReport.overallShs, 1);
    assert.equal(cleanReport.ratchetDecision.acceptedByRatchet, true);

    // Pass 2: Degraded retry with comment-spoofed TODO stub gets rejected AND auto-rolled back on disk
    const degradedCodeV2 = `export class TokenBucket {\n  // TODO: implement consume later\n}\n`;
    fs.writeFileSync(targetFile, degradedCodeV2, 'utf8');

    const failReport = verifyFileWithGuardrail({
      filePath: targetFile,
      workspaceDir: tmpDir,
      mustContain: ['class TokenBucket', 'consume'],
      enableRatchetRollback: true,
    });
    assert.equal(failReport.passed, false);
    assert.equal(failReport.ratchetDecision.acceptedByRatchet, false);
    assert.equal(failReport.ratchetDecision.rolledBackToSnapshot, true);
    assert.equal(failReport.constitutionalAudit.lyapunovMonotonicProgressVerified, false);
    assert.ok(failReport.newlyRecordedAntigen !== null);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), validCodeV1);

    // Verify persistent state & AuditLedger hash chain
    const state = loadPersistentWorkspaceState(tmpDir);
    assert.equal(state.antigens.length, 1);
    assert.equal(state.auditLedger.length, 2);
    assert.equal(verifyAuditLedgerChainIntegrity(state.auditLedger), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('genesis-code (v28.0): runExecutablePythonChecks runs real Python behavioral checks in isolated subprocess', () => {
  const pyCode = [
    'def add_numbers(a: int, b: int) -> int:',
    '    return a + b',
    '',
  ].join('\n');
  const suite = runExecutablePythonChecks(pyCode, [
    {
      name: 'adds_positive_and_negative',
      description: 'add_numbers computes exact sum',
      code: 'from artifact import add_numbers\nassert add_numbers(7, -2) == 5\n',
    },
  ]);
  assert.equal(suite.allPassed, true);
  assert.equal(suite.passed, 1);
  assert.equal(suite.score, 1);
});

test('genesis-video: compileMultiShotContinuityPack locks identity/optics and strips director notes', () => {
  const spec = JSON.parse(
    fs.readFileSync(SAMPLE_STORYBOARD_PATH, 'utf8')
  ) as MultiShotStoryboardSpec;
  const pack = compileMultiShotContinuityPack(spec);

  assert.equal(pack.compiledShots.length, 2);
  for (const shot of pack.compiledShots) {
    assert.equal(shot.informationHidingVerified, true);
    assert.ok(shot.readyPromptForFlowOrVeo.includes('Dr. Elena Vance'));
    assert.ok(shot.readyPromptForFlowOrVeo.includes('silver-gray lab coat'));
    assert.ok(shot.readyPromptForFlowOrVeo.includes('35mm'));
    assert.ok(!shot.readyPromptForFlowOrVeo.includes('Keep tripod locked; do not cut early'));
  }
});

test('genesis-video: computeSemanticVideoTrackFingerprint routes dialogue-only edits to lip-sync cache', () => {
  const shotV1 = JSON.stringify({
    atomicAction: 'Lifts glowing cyan glass vial',
    startPoseAnchor: 'Hand on table',
    endPoseAnchor: 'Vial at eye level',
    dialogueLine: 'Line version 1',
    activeProp: 'cyan_vial',
    directorNote: 'Rev 1 note',
  });
  const shotV2 = JSON.stringify({
    atomicAction: 'Lifts glowing cyan glass vial',
    startPoseAnchor: 'Hand on table',
    endPoseAnchor: 'Vial at eye level',
    dialogueLine: 'Line version 2 (updated dialogue only)',
    activeProp: 'cyan_vial',
    directorNote: 'Rev 2 note with different timestamp',
  });

  const fp1 = computeSemanticVideoTrackFingerprint(shotV1);
  const fp2 = computeSemanticVideoTrackFingerprint(shotV2);

  assert.equal(fp1.visualBlockingHash, fp2.visualBlockingHash);
  assert.notEqual(fp1.audioDialogueHash, fp2.audioDialogueHash);
  assert.equal(fp2.requiresFullVideoRender(fp1.visualBlockingHash), false);
  assert.equal(
    fp2.requiresOnlyAudioLipSync(fp1.visualBlockingHash, fp1.audioDialogueHash),
    true
  );
});

test('genesis-video: real FFmpeg MP4 audit & last-frame anchor extraction on real Google Flow videos', () => {
  const realShot1 = path.resolve(
    DIST_ROOT,
    '..',
    'public',
    'assets',
    'aistudio',
    'genesis_shot1_145095c7.mp4'
  );
  const realShot2 = path.resolve(
    DIST_ROOT,
    '..',
    'public',
    'assets',
    'aistudio',
    'genesis_shot2_44b565e3.mp4'
  );

  if (!fs.existsSync(realShot1) || !fs.existsSync(realShot2)) {
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-video-test-'));
  const anchorPng = path.join(tmpDir, 'shot1_anchor.png');
  const blendedMp4 = path.join(tmpDir, 'blended.mp4');

  const anchorRes = extractLastFrameAnchorPng(realShot1, anchorPng);
  assert.equal(anchorRes.frameExtracted, true);
  assert.ok(anchorRes.byteSize > 1000);

  const auditRes = auditAndBlendRealMp4Pair(realShot1, realShot2, blendedMp4);
  assert.equal(auditRes.shot1Frames, 192);
  assert.equal(auditRes.shot2Frames, 192);
  assert.ok(auditRes.subjectLightingRoiCosineSimilarity >= 0.92);
  assert.ok(
    auditRes.blended8FrameBoundaryWarpError < auditRes.unblendedBoundaryWarpError
  );
  assert.ok(auditRes.boundarySeamReductionPct > 90);
  assert.equal(auditRes.constitutionalVerdict, 'VIDEO_CONSTITUTION_CERTIFIED');
  assert.ok(fs.existsSync(blendedMp4));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('genesis-skills installer: 1-command init installs v28.0 skills for Antigravity, Claude Code, and Cursor', () => {
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-install-test-'));
  const installerBin = path.join(DIST_ROOT, 'bin', 'genesis-skills.mjs');

  const out = execFileSync(process.execPath, [installerBin, 'init', tmpProject], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.status, 'INSTALLED_SUCCESSFULLY');

  const expectedFiles = [
    '.agent/skills/genesis-code/SKILL.md',
    '.agent/skills/genesis-video/SKILL.md',
    '.claude/skills/genesis-code/SKILL.md',
    '.claude/skills/genesis-video/SKILL.md',
    '.cursor/rules/genesis-code.mdc',
    '.cursor/rules/genesis-video.mdc',
    'scripts/genesis/code-engine.ts',
    'scripts/genesis/genesis-code-cli.ts',
    'scripts/genesis/video-engine.ts',
    'scripts/genesis/genesis-video-cli.ts',
  ];

  for (const rel of expectedFiles) {
    assert.ok(
      fs.existsSync(path.join(tmpProject, rel)),
      `Expected installed file missing: ${rel}`
    );
  }

  const installedCodeOut = execFileSync(
    process.execPath,
    [...TSX_EXEC_ARGV, path.join(tmpProject, 'scripts/genesis/genesis-code-cli.ts'), 'prepare', SAMPLE_PROJECT_DIR],
    { encoding: 'utf8' }
  );
  const parsedCode = JSON.parse(installedCodeOut);
  assert.equal(parsedCode.skill, 'genesis-code');
  assert.equal(parsedCode.engineVersion, '28.0.0-SUCCESSOR');
  assert.deepEqual(parsedCode.wavefrontBuildOrder, ['types.ts', 'storage.ts', 'gateway.ts']);

  const installedVideoOut = execFileSync(
    process.execPath,
    [...TSX_EXEC_ARGV, path.join(tmpProject, 'scripts/genesis/genesis-video-cli.ts'), 'compile-shots', SAMPLE_STORYBOARD_PATH],
    { encoding: 'utf8' }
  );
  const parsedVideo = JSON.parse(installedVideoOut);
  assert.equal(parsedVideo.skill, 'genesis-video');
  assert.equal(parsedVideo.compiledShots.length, 2);

  fs.rmSync(tmpProject, { recursive: true, force: true });
});

test('whitepaper master architecture: all 5 Constitutional Layers (L0-L4) intact in code & video engines', () => {
  const rom = createImmutableRootConstitution({
    lockedPublicClasses: ['ReplicatedGateway'],
  });
  assert.equal(rom.constitutionId, 'L0_CONSTITUTION_ROM');
  assert.ok(Object.isFrozen(rom));

  const ws = new ASTWorkspace();
  const merged = ws.mergeStepCode('class Engine:\n    def run(self, x: Any) -> int:\n        return 1\nprint("demo")\n');
  assert.ok(merged.mergedModule.includes('from typing import Any'));
  assert.ok(!merged.mergedModule.includes('print("demo")'));

  const leafPrompt = buildInformationHiddenLeafPrompt({
    astSkeleton: 'class Engine',
    returnSchema: '{"ok": true}',
    contractMustContain: ['class Engine'],
  });
  assert.equal(verifyPromptInformationHiding(leafPrompt), true);

  const micro = spawnElasticMicroSkill({
    constitution: rom,
    parentSubSkillId: 'gateway',
    parentDepth: 2,
    parentTokenBudget: 400,
    triggerReason: 'missing symbol',
    targetAdaptation: 'add symbol',
  });
  assert.equal(micro.depth, 3);
  assert.equal(micro.allocatedTokenBudget, 200);

  const audit = evaluateWithConstitutionalAuditor({
    constitution: rom,
    subSkills: [
      {
        subSkillId: 'gateway',
        parentMasterId: 'master',
        depth: 2,
        wavefrontIndex: 0,
        tokenBudget: 400,
        behavioralRequires: ['class ReplicatedGateway'],
        behavioralEnsures: ['SHS >= 0.85'],
        renderedWorkerPrompt: leafPrompt,
        informationHiddenVerified: true,
        spawnedMicroSkills: [micro],
        reasoningTokensMeasured: 15,
        outputTokensMeasured: 120,
        overthinkingPctMeasured: 11.1,
        status: 'WAVEFRONT_SYNTHESIZED',
      },
    ],
    retryHistoryPassedCounts: [5, 10],
    mcpCallsAttempted: [],
  });
  assert.equal(audit.verdict, 'CONSTITUTION_CERTIFIED');

  const torn = tryTearForwardPayload('{"next_instruction":"implement wal","is_terminal":false,"trailing":"ignored');
  assert.ok(torn !== null);
  assert.equal(torn?.effectiveInstruction, 'implement wal');
  assert.equal(torn?.isTerminal, false);

  const vRom = createVisualWorldConstitution();
  const vMicro = spawnSpatioTemporalMicroSkill({
    constitution: vRom,
    parentShotId: 'shot_01',
    parentDepth: 2,
    parentShotGpuFlopsGiga: 1000,
    boundingTube: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, tStartSec: 1, tEndSec: 3, shotDurationSec: 8 },
    conditioningRigApplied: '5-finger hand mesh lock',
    preHealVShs: 0.72,
    postHealVShs: 0.94,
  });
  assert.equal(vMicro.auditorApproved, true);
  assert.ok(vMicro.computeBudgetRatio <= 0.25);

  const vAudit = evaluateWithVisualConstitutionalAuditor({
    constitution: vRom,
    shots: [],
    vShsTrajectoryHistory: [0.72, 0.94],
  });
  assert.equal(vAudit.verdict, 'VIDEO_CONSTITUTION_CERTIFIED');
});
