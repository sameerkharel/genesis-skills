/**
 * Workspace Dependency DAG Scanner, Multi-Line Symbol Skeleton Extractor &
 * JSON Configuration Decoy Sanitizer.
 *
 * Supports TypeScript, JavaScript, and Python repositories with zero external
 * dependencies (~2–5ms typical runtime).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256Hex } from './hash';
import { FailureLesson, loadWorkspaceState } from './state';

export type SupportedLanguage = 'typescript' | 'python' | 'javascript' | 'other';

export interface FileDagNode {
  relativePath: string;
  language: SupportedLanguage;
  importsLocalFiles: string[];
  symbolSkeleton: string[];
  lineCount: number;
  byteSize: number;
}

export interface ConfigSanitizationReport {
  configFile: string;
  semanticSha256: string;
  activeSchemaKeys: string[];
  ignoredNoiseAndDecoyKeys: string[];
}

export interface WorkspaceDagScanResult {
  workspaceRoot: string;
  elapsedMs: number;
  totalCodeFiles: number;
  wavefrontBuildOrder: string[];
  wavefrontLayers: string[][];
  hasCycles: boolean;
  files: FileDagNode[];
  configSanitizationReports: ConfigSanitizationReport[];
  loadedFailureLessons: FailureLesson[];
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.genesis',
  '.next',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
]);

const IGNORED_JSON_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'jsconfig.json',
]);

const DECOY_AND_NOISE_KEY_PATTERNS: RegExp[] = [
  /^_comment/i,
  /^_debug/i,
  /^_legacy/i,
  /^_internal/i,
  /^last_edited_by/i,
  /^edited_by/i,
  /^updated_at_ts/i,
  /^timestamp/i,
  /^build_note/i,
  /^prompt_injection_note/i,
  /^recommended_unverified_tool/i,
  /unverified/i,
  /bypass/i,
  /exec_raw/i,
  /disable_auth/i,
  /skip_crc/i,
  /ignore_fencing/i,
];

const DANGEROUS_VALUE_PATTERN =
  /mcp\.shell\.exec_raw|bypass_crc|ignore_fencing|disable_security|skip_validation/i;

/**
 * Separates legitimate schema keys from debug/legacy/prompt-injection decoy keys
 * in a JSON config file, returning a deterministic SHA-256 semantic fingerprint.
 */
export function sanitizeConfigJson(
  rawJsonText: string,
  configFile: string = 'inline.json'
): ConfigSanitizationReport {
  let parsed: Record<string, unknown>;
  try {
    const candidate = JSON.parse(rawJsonText);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return {
        configFile,
        semanticSha256: sha256Hex(rawJsonText).slice(0, 24),
        activeSchemaKeys: [],
        ignoredNoiseAndDecoyKeys: [],
      };
    }
    parsed = candidate as Record<string, unknown>;
  } catch {
    return {
      configFile,
      semanticSha256: sha256Hex(rawJsonText).slice(0, 24),
      activeSchemaKeys: [],
      ignoredNoiseAndDecoyKeys: [],
    };
  }

  const activeSchemaKeys: string[] = [];
  const ignoredNoiseAndDecoyKeys: string[] = [];
  const activeSignatureEntries: string[] = [];

  for (const key of Object.keys(parsed).sort()) {
    const val = parsed[key];
    const valStr = typeof val === 'string' ? val : '';
    const isDecoyOrNoise =
      DECOY_AND_NOISE_KEY_PATTERNS.some((rx) => rx.test(key)) ||
      DANGEROUS_VALUE_PATTERN.test(valStr);

    if (isDecoyOrNoise) {
      ignoredNoiseAndDecoyKeys.push(key);
      continue;
    }

    const valType = Array.isArray(val) ? 'array' : typeof val;
    const descriptor =
      typeof val === 'boolean' || typeof val === 'string' || typeof val === 'number'
        ? `${key}:${valType}=${String(val)}`
        : `${key}:${valType}`;
    activeSignatureEntries.push(descriptor);
    activeSchemaKeys.push(key);
  }

  return {
    configFile,
    semanticSha256: sha256Hex(activeSignatureEntries.join('|')).slice(0, 24),
    activeSchemaKeys,
    ignoredNoiseAndDecoyKeys,
  };
}

/**
 * Extracts multi-line class, function, method, interface, type, and enum headers
 * from Python, TypeScript, or JavaScript source files without copying function bodies.
 */
export function extractSymbolSkeleton(code: string, language?: SupportedLanguage): string[] {
  const lines = code.split(/\r?\n/);
  const isPython =
    language === 'python' ||
    (!language &&
      (lines.some((l) => /^\s*(?:async\s+)?def\s+[A-Za-z0-9_]+\s*\(/.test(l)) ||
        lines.some((l) => /^class\s+[A-Za-z0-9_]+.*:\s*$/.test(l.trim()))));

  if (isPython) {
    const skeleton: string[] = [];
    let insideClass = false;
    let currentClassHasMethods = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = rawLine.length - rawLine.trimStart().length;

      if (indent === 0 && trimmed.startsWith('class ')) {
        if (insideClass && !currentClassHasMethods) {
          skeleton.push('    ...');
        }
        let header = trimmed;
        while (!header.endsWith(':') && i + 1 < lines.length) {
          i++;
          header += ' ' + lines[i].trim();
        }
        skeleton.push(header);
        insideClass = true;
        currentClassHasMethods = false;
        continue;
      }

      if (indent === 0 && (trimmed.startsWith('def ') || trimmed.startsWith('async def '))) {
        if (insideClass && !currentClassHasMethods) {
          skeleton.push('    ...');
        }
        insideClass = false;
        let header = trimmed;
        while (!header.endsWith(':') && i + 1 < lines.length) {
          i++;
          header += ' ' + lines[i].trim();
        }
        header = header.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
        skeleton.push(`${header} ...`);
        continue;
      }

      if (
        insideClass &&
        indent >= 2 &&
        indent <= 4 &&
        (trimmed.startsWith('def ') || trimmed.startsWith('async def '))
      ) {
        currentClassHasMethods = true;
        let header = trimmed;
        while (!header.endsWith(':') && i + 1 < lines.length) {
          i++;
          header += ' ' + lines[i].trim();
        }
        header = header.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
        skeleton.push(`    ${header} ...`);
      }
    }

    if (insideClass && !currentClassHasMethods) {
      skeleton.push('    ...');
    }
    return skeleton;
  }

  // TypeScript / JavaScript skeleton extraction with multi-line parameter stitching
  const skeleton: string[] = [];
  const topSymbolRx =
    /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|async\s+function)\s+[A-Za-z0-9_]+/;
  const methodStartRx =
    /^\s{2,4}(?:public\s+|private\s+|protected\s+|readonly\s+|static\s+|async\s+)*[A-Za-z0-9_]+\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trimEnd();
    const clean = trimmed.trim();
    if (!clean || clean.startsWith('//') || clean.startsWith('*') || clean.startsWith('/*')) {
      continue;
    }
    if (/^\s{2,}(?:if|for|while|switch|catch|return|super|throw|else)\b/.test(trimmed)) {
      continue;
    }

    if (topSymbolRx.test(trimmed) || methodStartRx.test(trimmed)) {
      let header = clean;
      if (header.includes('(') && !header.includes(')')) {
        while (!header.includes(')') && i + 1 < lines.length) {
          i++;
          header += ' ' + lines[i].trim();
        }
      }
      header = header
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\s*\{\s*$/, '')
        .trim();
      const prefix = methodStartRx.test(trimmed) && !topSymbolRx.test(trimmed) ? '  ' : '';
      skeleton.push(`${prefix}${header}`);
    }
  }

  return skeleton;
}

/**
 * Resolves local cross-file imports for TypeScript/JavaScript AND Python:
 * - TS/JS: `import ... from './x'`, `export ... from './x'`, `import('./x')`, `require('./x')`
 * - Python: `from pkg.mod import X`, `from .mod import X`, `import mod`, `import mod as m`, `import a, b`
 */
export function extractLocalImports(
  code: string,
  currentFileRelPath: string,
  allWorkspaceRelPaths: Set<string>
): string[] {
  const normCurrent = currentFileRelPath.replace(/\\/g, '/');
  const currentDir = path.posix.dirname(normCurrent);
  const resolvedImports = new Set<string>();

  const tryResolveJsSpec = (spec: string) => {
    const baseResolved = path.posix.normalize(path.posix.join(currentDir, spec));
    const candidates = [
      baseResolved,
      `${baseResolved}.ts`,
      `${baseResolved}.tsx`,
      `${baseResolved}.js`,
      `${baseResolved}.mjs`,
      `${baseResolved}/index.ts`,
      `${baseResolved}/index.tsx`,
      `${baseResolved}/index.js`,
    ];
    for (const cand of candidates) {
      if (allWorkspaceRelPaths.has(cand) && cand !== normCurrent) {
        resolvedImports.add(cand);
        return;
      }
    }
  };

  // Strip comments roughly so commented-out imports don't pollute the DAG
  const nonCommentCode = code
    .split(/\r?\n/)
    .filter((ln) => {
      const t = ln.trim();
      return !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('*');
    })
    .join('\n');

  // TS/JS ESM imports, re-exports, dynamic imports, and CommonJS require()
  const esAndCjsRegex =
    /(?:(?:from|import)\s*\(?|require\s*\()\s*['"](\.[^'"]+)['"]\s*\)?/g;
  let match: RegExpExecArray | null;
  while ((match = esAndCjsRegex.exec(nonCommentCode)) !== null) {
    tryResolveJsSpec(match[1]);
  }

  const tryResolvePyModule = (rawModule: string) => {
    const leadingDots = rawModule.match(/^\.+/)?.[0]?.length ?? 0;
    const modPath = rawModule.replace(/^\.+/, '').replace(/\./g, '/');
    if (!modPath) return;

    const baseDir =
      leadingDots > 1
        ? path.posix.normalize(path.posix.join(currentDir, '../'.repeat(leadingDots - 1)))
        : currentDir;

    const candidates = [
      path.posix.normalize(path.posix.join(baseDir, `${modPath}.py`)),
      path.posix.normalize(path.posix.join(baseDir, modPath, '__init__.py')),
      `${modPath}.py`,
      `${modPath}/__init__.py`,
    ];
    for (const cand of candidates) {
      if (allWorkspaceRelPaths.has(cand) && cand !== normCurrent) {
        resolvedImports.add(cand);
        return;
      }
    }
  };

  // Python `from <module> import ...`
  const pyFromRegex = /^\s*from\s+(\.+[A-Za-z0-9_.]*|[A-Za-z0-9_.]+)\s+import\b/gm;
  while ((match = pyFromRegex.exec(nonCommentCode)) !== null) {
    tryResolvePyModule(match[1]);
  }

  // Python `import mod1, mod2 as m2`
  const pyImportRegex = /^\s*import\s+([A-Za-z0-9_.,\s]+?)(?:\s+#.*)?$/gm;
  while ((match = pyImportRegex.exec(nonCommentCode)) !== null) {
    const clauses = match[1].split(',');
    for (const clause of clauses) {
      const modToken = clause.trim().split(/\s+as\s+/)[0].trim();
      if (modToken) {
        tryResolvePyModule(modToken);
      }
    }
  }

  return Array.from(resolvedImports).sort();
}

/**
 * Scans a workspace directory, constructs the local import dependency graph,
 * computes leaf-to-root `wavefrontBuildOrder`, sanitizes JSON configs, and
 * loads persistent Failure Memory lessons from `.genesis/state.json`.
 */
export function scanWorkspaceDag(targetDir: string): WorkspaceDagScanResult {
  const startedAt = performance.now();
  const absRoot = path.resolve(targetDir);

  const discoveredRelPaths: string[] = [];
  const configFilesRel: string[] = [];

  function walk(currDir: string) {
    if (!fs.existsSync(currDir)) return;
    const entries = fs.readdirSync(currDir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currDir, entry.name);
      const relPath = path.relative(absRoot, fullPath).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (/\.(ts|tsx|py|js|mjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
          discoveredRelPaths.push(relPath);
        } else if (entry.name.endsWith('.json') && !IGNORED_JSON_FILES.has(entry.name)) {
          configFilesRel.push(relPath);
        }
      }
    }
  }

  walk(absRoot);
  discoveredRelPaths.sort();
  const allCodeSet = new Set(discoveredRelPaths);

  const files: FileDagNode[] = [];
  const depsMap = new Map<string, string[]>();

  for (const relPath of discoveredRelPaths) {
    const fullPath = path.join(absRoot, relPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const ext = path.extname(relPath);
    const language: SupportedLanguage =
      ext === '.py'
        ? 'python'
        : ext === '.ts' || ext === '.tsx'
        ? 'typescript'
        : ext === '.js' || ext === '.mjs'
        ? 'javascript'
        : 'other';

    const localImports = extractLocalImports(content, relPath, allCodeSet);
    const symbolSkeleton = extractSymbolSkeleton(content, language);

    depsMap.set(relPath, localImports);
    files.push({
      relativePath: relPath,
      language,
      importsLocalFiles: localImports,
      symbolSkeleton,
      lineCount: content.split(/\r?\n/).length,
      byteSize: Buffer.byteLength(content, 'utf8'),
    });
  }

  // Kahn-style topological wavefront sorting (leaves first)
  const remaining = new Set(discoveredRelPaths);
  const resolved = new Set<string>();
  const wavefrontLayers: string[][] = [];
  const wavefrontBuildOrder: string[] = [];
  let hasCycles = false;

  while (remaining.size > 0) {
    const currentLayer: string[] = [];
    for (const file of remaining) {
      const deps = depsMap.get(file) ?? [];
      if (deps.every((d) => resolved.has(d))) {
        currentLayer.push(file);
      }
    }

    if (currentLayer.length === 0) {
      hasCycles = true;
      const fallback = Array.from(remaining).sort((a, b) => {
        const unresolvedA = (depsMap.get(a) ?? []).filter((d) => !resolved.has(d)).length;
        const unresolvedB = (depsMap.get(b) ?? []).filter((d) => !resolved.has(d)).length;
        return unresolvedA - unresolvedB || a.localeCompare(b);
      })[0];
      currentLayer.push(fallback);
    }

    currentLayer.sort();
    wavefrontLayers.push(currentLayer);
    for (const f of currentLayer) {
      wavefrontBuildOrder.push(f);
      remaining.delete(f);
      resolved.add(f);
    }
  }

  const configSanitizationReports = configFilesRel.sort().map((cfgRel) => {
    const raw = fs.readFileSync(path.join(absRoot, cfgRel), 'utf8');
    return sanitizeConfigJson(raw, cfgRel);
  });

  const persistentState = loadWorkspaceState(absRoot);
  const elapsedMs = Number((performance.now() - startedAt).toFixed(2));

  return {
    workspaceRoot: absRoot,
    elapsedMs,
    totalCodeFiles: files.length,
    wavefrontBuildOrder,
    wavefrontLayers,
    hasCycles,
    files,
    configSanitizationReports,
    loadedFailureLessons: persistentState.lessons,
  };
}
