#!/usr/bin/env node
/**
 * ============================================================================
 * GENESIS SKILLS — 1-Command Installer & Universal CLI (`bin/genesis-skills.mjs`)
 * ============================================================================
 *
 * Quick Setup (Antigravity, Claude Code, Cursor, Gemini CLI):
 *   npx genesis-skills init [target_project_dir]
 *   (or: node bin/genesis-skills.mjs init [target_project_dir])
 *
 * Direct Quick Commands:
 *   npx genesis-skills prepare [dir]
 *   npx genesis-skills verify [file_or_dir]
 *   npx genesis-skills audit [dir]
 *   npx genesis-skills video-compile [storyboard.json] [out.md]
 *   npx genesis-skills video-anchor <shot1.mp4> [anchor.png]
 *   npx genesis-skills video-audit <shot1.mp4> <shot2.mp4> [blended.mp4]
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, '..');

const [, , subcmdRaw, ...restArgs] = process.argv;
const subcmd = (subcmdRaw || '').toLowerCase();

function parseTargetFlag(args) {
  const idx = args.indexOf('--target');
  if (idx !== -1 && args[idx + 1]) {
    return path.resolve(args[idx + 1]);
  }
  if (args[0] && !args[0].startsWith('-')) {
    return path.resolve(args[0]);
  }
  return process.cwd();
}

function installSkillsToTarget(targetDir, options = { code: true, video: true }) {
  const startedAt = Date.now();
  fs.mkdirSync(targetDir, { recursive: true });

  const installedPaths = [];

  // 1. Copy standalone engines + CLIs into <targetDir>/scripts/genesis/
  const destScriptsDir = path.join(targetDir, 'scripts', 'genesis');
  fs.mkdirSync(destScriptsDir, { recursive: true });

  const codeEngineSrc = fs.readFileSync(path.join(PKG_ROOT, 'src', 'code', 'engine.ts'), 'utf8');
  const codeCliSrc = fs
    .readFileSync(path.join(PKG_ROOT, 'src', 'code', 'cli.ts'), 'utf8')
    .replace(/from '\.\/engine'/g, "from './code-engine'");

  const videoEngineSrc = fs
    .readFileSync(path.join(PKG_ROOT, 'src', 'video', 'engine.ts'), 'utf8')
    .replace(/from '\.\.\/code\/engine'/g, "from './code-engine'");
  const videoCliSrc = fs
    .readFileSync(path.join(PKG_ROOT, 'src', 'video', 'cli.ts'), 'utf8')
    .replace(/from '\.\/engine'/g, "from './video-engine'");

  fs.writeFileSync(path.join(destScriptsDir, 'code-engine.ts'), codeEngineSrc, 'utf8');
  installedPaths.push('scripts/genesis/code-engine.ts');

  if (options.code) {
    fs.writeFileSync(path.join(destScriptsDir, 'genesis-code-cli.ts'), codeCliSrc, 'utf8');
    installedPaths.push('scripts/genesis/genesis-code-cli.ts');
  }

  if (options.video) {
    fs.writeFileSync(path.join(destScriptsDir, 'video-engine.ts'), videoEngineSrc, 'utf8');
    fs.writeFileSync(path.join(destScriptsDir, 'genesis-video-cli.ts'), videoCliSrc, 'utf8');
    installedPaths.push('scripts/genesis/video-engine.ts');
    installedPaths.push('scripts/genesis/genesis-video-cli.ts');
  }

  // 2. Install SKILL.md into .agent/skills/ (Antigravity / Gemini CLI / Open-Skills)
  //    AND .claude/skills/ (Claude Code)
  const skillRoots = [
    path.join(targetDir, '.agent', 'skills'),
    path.join(targetDir, '.claude', 'skills'),
  ];

  const codeSkillMd = fs.readFileSync(
    path.join(PKG_ROOT, 'skills', 'genesis-code', 'SKILL.md'),
    'utf8'
  );
  const videoSkillMd = fs.readFileSync(
    path.join(PKG_ROOT, 'skills', 'genesis-video', 'SKILL.md'),
    'utf8'
  );

  for (const root of skillRoots) {
    const relRoot = path.relative(targetDir, root).replace(/\\/g, '/');
    if (options.code) {
      const d = path.join(root, 'genesis-code');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'SKILL.md'), codeSkillMd, 'utf8');
      installedPaths.push(`${relRoot}/genesis-code/SKILL.md`);
    }
    if (options.video) {
      const d = path.join(root, 'genesis-video');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'SKILL.md'), videoSkillMd, 'utf8');
      installedPaths.push(`${relRoot}/genesis-video/SKILL.md`);
    }
  }

  // 3. Also install Cursor IDE rules (.cursor/rules/genesis-code.mdc & genesis-video.mdc)
  const cursorRulesDir = path.join(targetDir, '.cursor', 'rules');
  fs.mkdirSync(cursorRulesDir, { recursive: true });
  if (options.code) {
    fs.writeFileSync(path.join(cursorRulesDir, 'genesis-code.mdc'), codeSkillMd, 'utf8');
    installedPaths.push('.cursor/rules/genesis-code.mdc');
  }
  if (options.video) {
    fs.writeFileSync(path.join(cursorRulesDir, 'genesis-video.mdc'), videoSkillMd, 'utf8');
    installedPaths.push('.cursor/rules/genesis-video.mdc');
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    JSON.stringify(
      {
        installer: 'genesis-skills',
        status: 'INSTALLED_SUCCESSFULLY',
        targetDirectory: targetDir,
        elapsedMs,
        installedFilesCount: installedPaths.length,
        installedFiles: installedPaths,
        quickTestCommands: {
          codePrepare: 'npx tsx scripts/genesis/genesis-code-cli.ts prepare .',
          codeVerify: 'npx tsx scripts/genesis/genesis-code-cli.ts verify .',
          codeAudit: 'npx tsx scripts/genesis/genesis-code-cli.ts audit .',
          videoCompile: 'npx tsx scripts/genesis/genesis-video-cli.ts compile-shots',
        },
      },
      null,
      2
    )
  );
}

function runTsxScript(scriptRelPath, scriptArgs) {
  const fullScript = path.join(PKG_ROOT, scriptRelPath);
  const res = spawnSync('npx', ['--yes', 'tsx', fullScript, ...scriptArgs], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(res.status ?? 0);
}

if (subcmd === 'init' || subcmd === 'install') {
  const targetDir = parseTargetFlag(restArgs);
  const onlyCode = restArgs.includes('--code-only');
  const onlyVideo = restArgs.includes('--video-only');
  installSkillsToTarget(targetDir, {
    code: !onlyVideo,
    video: !onlyCode,
  });
} else if (subcmd === 'prepare' || subcmd === 'scan') {
  runTsxScript('src/code/cli.ts', [subcmd, ...restArgs]);
} else if (subcmd === 'verify') {
  runTsxScript('src/code/cli.ts', ['verify', ...restArgs]);
} else if (subcmd === 'audit') {
  runTsxScript('src/code/cli.ts', ['audit', ...restArgs]);
} else if (subcmd === 'video-compile' || subcmd === 'compile-shots') {
  runTsxScript('src/video/cli.ts', ['compile-shots', ...restArgs]);
} else if (subcmd === 'video-anchor' || subcmd === 'extract-anchor') {
  runTsxScript('src/video/cli.ts', ['extract-anchor', ...restArgs]);
} else if (subcmd === 'video-audit' || subcmd === 'audit-and-blend') {
  runTsxScript('src/video/cli.ts', ['audit-and-blend', ...restArgs]);
} else {
  console.log(`====================================================================
GENESIS SKILLS — 1-Command Installer & CLI
====================================================================
1. Install Skills into Any Project (Antigravity, Claude Code, Cursor):
   npx genesis-skills init [target_dir]

2. Run Code Skill Quick Commands:
   npx genesis-skills prepare [dir]
   npx genesis-skills verify [file_or_dir]
   npx genesis-skills audit [dir]

3. Run Video Skill Quick Commands:
   npx genesis-skills video-compile [storyboard.json] [FLOW_PROMPTS.md]
   npx genesis-skills video-anchor <shot1.mp4> [shot1_anchor.png]
   npx genesis-skills video-audit <shot1.mp4> <shot2.mp4> [blended.mp4]
`);
}
