#!/usr/bin/env node
/**
 * GENESIS Code v2 — 1-Command Installer & CLI Wrapper (`bin/genesis-code.mjs`)
 *
 * Install into any target project:
 *   node genesis-skills-v2/install.mjs ./MyProject
 *   (or: npx genesis-code init ./MyProject)
 *
 * Direct CLI Usage:
 *   npx genesis-code prepare [dir]
 *   npx genesis-code verify [file_or_dir] [--syntax] [--test "<cmd>"]
 *   npx genesis-code audit [dir]
 *   npx genesis-code lessons [dir]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, '..');

const [, , subcmdRaw, ...restArgs] = process.argv;
const subcmd = (subcmdRaw || '').toLowerCase();

function parseTargetDir(args) {
  const idx = args.indexOf('--target');
  if (idx !== -1 && args[idx + 1]) {
    return path.resolve(args[idx + 1]);
  }
  if (args[0] && !args[0].startsWith('-')) {
    return path.resolve(args[0]);
  }
  return process.cwd();
}

function installIntoTarget(targetDir) {
  const startedAt = Date.now();
  fs.mkdirSync(targetDir, { recursive: true });
  const installedFiles = [];

  // 1. Copy modular zero-dependency TypeScript engine & CLI into <targetDir>/scripts/genesis/
  const destScriptsDir = path.join(targetDir, 'scripts', 'genesis');
  fs.mkdirSync(destScriptsDir, { recursive: true });

  const moduleFiles = ['hash.ts', 'state.ts', 'dag.ts', 'verifier.ts', 'index.ts'];
  for (const mod of moduleFiles) {
    fs.copyFileSync(path.join(PKG_ROOT, 'src', mod), path.join(destScriptsDir, mod));
    installedFiles.push(`scripts/genesis/${mod}`);
  }
  fs.copyFileSync(
    path.join(PKG_ROOT, 'src', 'cli.ts'),
    path.join(destScriptsDir, 'genesis-code-cli.ts')
  );
  installedFiles.push('scripts/genesis/genesis-code-cli.ts');

  // 2. Install SKILL.md for Antigravity / Gemini CLI / Open-Skills & Claude Code
  const skillMd = fs.readFileSync(
    path.join(PKG_ROOT, 'skills', 'genesis-code', 'SKILL.md'),
    'utf8'
  );

  const skillTargets = [
    path.join(targetDir, '.agent', 'skills', 'genesis-code', 'SKILL.md'),
    path.join(targetDir, '.claude', 'skills', 'genesis-code', 'SKILL.md'),
    path.join(targetDir, '.cursor', 'rules', 'genesis-code.mdc'),
  ];

  for (const dest of skillTargets) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, skillMd, 'utf8');
    installedFiles.push(path.relative(targetDir, dest).replace(/\\/g, '/'));
  }

  // 3. Write a ready-to-paste non-destructive Claude Code PostToolUse hook example
  const hookExamplePath = path.join(targetDir, '.claude', 'genesis-hooks.example.json');
  const hookExample = {
    hooks: {
      PostToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [
            {
              type: 'command',
              command: 'npx tsx scripts/genesis/genesis-code-cli.ts hook --syntax',
            },
          ],
        },
      ],
    },
  };
  fs.writeFileSync(hookExamplePath, JSON.stringify(hookExample, null, 2) + '\n', 'utf8');
  installedFiles.push('.claude/genesis-hooks.example.json');

  const elapsedMs = Date.now() - startedAt;
  console.log(
    JSON.stringify(
      {
        installer: 'genesis-code',
        version: '2.0.0',
        status: 'INSTALLED_SUCCESSFULLY',
        targetDirectory: targetDir,
        elapsedMs,
        installedFilesCount: installedFiles.length,
        installedFiles,
        quickCommands: {
          prepare: 'npx tsx scripts/genesis/genesis-code-cli.ts prepare .',
          verify: 'npx tsx scripts/genesis/genesis-code-cli.ts verify . --syntax',
          verifyWithTests:
            'npx tsx scripts/genesis/genesis-code-cli.ts verify . --syntax --test "npm test"',
          audit: 'npx tsx scripts/genesis/genesis-code-cli.ts audit .',
        },
      },
      null,
      2
    )
  );
}

function runCli(args) {
  const cliScript = path.join(PKG_ROOT, 'src', 'cli.ts');
  const res = spawnSync('npx', ['--yes', 'tsx', cliScript, ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(res.status ?? 0);
}

if (subcmd === 'init' || subcmd === 'install') {
  installIntoTarget(parseTargetDir(restArgs));
} else if (['prepare', 'scan', 'verify', 'audit', 'lessons', 'hook'].includes(subcmd)) {
  runCli([subcmd, ...restArgs]);
} else {
  console.log(`GENESIS Code v2.0.0 — Installer & CLI

1. Install into any project (Antigravity, Claude Code, Cursor + Hook Example):
   node install.mjs ./MyProject

2. Run CLI commands directly:
   npx genesis-code prepare [dir]
   npx genesis-code verify [file_or_dir] [--syntax] [--test "<cmd>"]
   npx genesis-code audit [dir]
   npx genesis-code lessons [dir] [--clear]
`);
}
