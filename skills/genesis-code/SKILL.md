---
name: genesis-code
description: Zero-dependency deterministic verification gate for AI coding agents. Scans multi-file Python/TS/JS dependency DAGs, extracts multi-line symbol skeletons, isolates JSON config decoys, runs real syntax/test verification (--syntax / --test), auto-rolls back regressions on disk, and persists cross-session failure memory (.genesis/state.json).
---

# GENESIS Code Skill (`genesis-code`)

A zero-dependency, zero-API-key deterministic workflow guardrail for AI coding agents (`Antigravity`, `Claude Code`, `Cursor`, `Codex`, `Gemini CLI`).

---

## STRICT BLACK-BOX EXECUTION PROTOCOL (MANDATORY)

1. **NEVER READ OR GREP `scripts/genesis/` SOURCE FILES:**
   Do **NOT** call `read_file`, `view_file`, `grep`, or `Select-String` on `scripts/genesis/*`. The CLI is a ready-to-run executable invoked directly via `npx tsx` using the commands documented below.
2. **NEVER CALL `search_web` FOR STANDARD LIBRARY SYNTAX OR LOCAL CONTRACTS:**
   Do **NOT** run web searches for language syntax, standard library APIs, or local repository contracts unless explicitly asked by the user.
3. **NEVER RUN `dir`, `ls`, `Get-ChildItem`, OR `--help` BEFORE `prepare`:**
   Running `prepare` discovers all `.ts`/`.tsx`/`.py`/`.js` files, resolves cross-file imports (`wavefrontBuildOrder`), extracts multi-line symbol skeletons, sanitizes `.json` decoy keys, and loads persistent Failure Memory in `~3ms`.
4. **SUBFOLDER PATH RESOLUTION:**
   - From workspace root: `npx tsx scripts/genesis/genesis-code-cli.ts <prepare|verify|audit> <dir_or_file>`
   - Inside a project subfolder (e.g., `MyApp/`): `npx tsx ../scripts/genesis/genesis-code-cli.ts <prepare|verify|audit> .`
5. **SINGLE-PASS WORKFLOW (NO REDUNDANT RE-READS AFTER VERIFICATION):**
   - **Step 1 (`prepare`):** If the prompt provides a `.json` config file, write it first, then immediately run `prepare` to sanitize decoy keys and lock contract obligations.
   - **Step 2 (Implement in `wavefrontBuildOrder`):** Write modules cleanly from leaf to root.
   - **Step 3 (`verify`):** Run `verify` once (with `--syntax` and `--test "<test_command>"` whenever a test script exists). Once `"verdict": "VERIFIED"` is returned, **stop immediately**—do not re-read already verified files.

---

## Quick Command Reference (Windows PowerShell, macOS & Linux)

### 1. Prepare Before Writing or Editing Code
```bash
npx tsx scripts/genesis/genesis-code-cli.ts prepare .
```
Or with an explicit contract:
```bash
npx tsx scripts/genesis/genesis-code-cli.ts prepare . "<task>" "<mustContainCsv>" "<forbiddenCsv>" [config.json]
```

**Returns (`~3ms`):**
- `wavefrontBuildOrder`: Leaf-to-root topological build order.
- `symbolSkeletonsByFile`: Multi-line class/function/method signatures and local imports.
- `failureMemoryLessons`: Past failure lessons recorded in `.genesis/state.json`.
- `guardrails.forbiddenAndDecoyPatterns`: Config decoy/trap keys you **must ignore and never implement**.

---

### 2. Verify After Writing Code (Static + Real Syntax/Tests + Auto-Rollback)

**Directory-Wide Verification (Recommended — Audits All Files in 1 Call):**
```bash
npx tsx scripts/genesis/genesis-code-cli.ts verify . --syntax
```

**With Real Test Suite & Contract Gate:**
```bash
npx tsx scripts/genesis/genesis-code-cli.ts verify . "<mustContainCsv>" "<forbiddenCsv>" --syntax --test "pytest"
```

**Single-File Verification:**
```bash
npx tsx scripts/genesis/genesis-code-cli.ts verify src/engine.py "class Engine" "TODO" --syntax --test "python3 run_tests.py"
```

- If `"verdict": "VERIFIED"`, all snapshots are committed to `.genesis/state.json` with a real SHA-256 ledger entry.
- If `"verdict": "FAILED_SEE_CORRECTION_SIGNAL"`:
  - If an edit degraded a previously passing file, the **Monotonic Workspace Ratchet** automatically restores the last verified snapshot on disk (`rolledBackToSnapshot: true`).
  - A persistent Failure Memory lesson is saved to `.genesis/state.json`.
  - Apply the fix described in `correctionSignal` and re-run `verify`.

---

### 3. Audit Cryptographic Ledger & Failure Memory (Optional)
```bash
npx tsx scripts/genesis/genesis-code-cli.ts audit .
```
Verifies the real SHA-256 hash chain (`ledgerChainValid: true`) across `.genesis/state.json`.
