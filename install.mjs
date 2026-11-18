#!/usr/bin/env node
/**
 * Quick 1-command installer shortcut:
 * Running `node install.mjs [target_dir]` executes `bin/genesis-skills.mjs init [target_dir]`.
 */
import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, 'bin', 'genesis-skills.mjs');
const userArgs = process.argv.slice(2);
const res = spawnSync(process.execPath, [cliPath, 'init', ...userArgs], {
  stdio: 'inherit',
});
process.exit(res.status ?? 0);
