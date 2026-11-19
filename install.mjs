#!/usr/bin/env node
/**
 * 1-command installer shortcut:
 *   node genesis-skills-v2/install.mjs ./MyProject
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, 'bin', 'genesis-code.mjs');
const res = spawnSync(process.execPath, [cliPath, 'init', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 0);
