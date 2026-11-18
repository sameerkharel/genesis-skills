---
name: genesis-code
description: Zero-key multi-file Dependency DAG scanner, multi-line Python/TS AST skeleton extractor, persistent failure memory (.genesis/state.json), Monotonic Workspace Ratchet with auto-rollback, config-trap sanitizer, and static contract verifier. Use before and after coding to reduce reasoning overhead and eliminate contract/regression bugs.
---

# GENESIS Code Skill (`genesis-code`)

An ultra-fast (`~3ms`), zero-API-key **Pre/Post Execution Guardrail, Dependency DAG Compiler, Persistent Failure Memory & Monotonic Workspace Ratchet** for AI coding agents (`Antigravity`, `Claude Code`, `Cursor`, `Codex`, `Gemini CLI`).

## Core Capabilities
1. **Topological Build Order (`wavefrontBuildOrder`):** Automatically discovers all code files (`.ts`, `.tsx`, `.py`, `.js`), parses cross-file imports, and computes the exact **leaf-to-root `wavefrontBuildOrder`** so you never waste turns running `ls` or fixing circular imports.
2. **Multi-Line Python & TypeScript AST Skeletons:** Extracts complete multi-line `def`/`async def` and TypeScript/JS function, class, and interface headers so you see exact typed APIs without loading full implementation bodies into context.
3. **Persistent Cross-Run Failure Memory (`.genesis/state.json`):** When `verify` catches a missing invariant or contract violation, it records a persistent `AntigenSignature` to `.genesis/state.json`. Subsequent `prepare` runs automatically inject those learned constraints into `guardrailRules.mustContainSymbols`.
4. **Monotonic Workspace Ratchet & Auto-Rollback:** Tracks the highest verified `overallShs` and code snapshot per file. If a subsequent edit degrades `SHS` (for example, replacing working logic with a `// TODO` stub), `verify` rejects the regression and **automatically restores the last verified snapshot on disk**.
5. **Config Decoy & Prompt-Injection Protection:** Automatically scans `.json` config files and isolates debug-bypass or decoy keys (`_debug_*`, `_legacy_*`, `bypass_*`, `exec_raw`) into `forbiddenAndDecoyPatternsToReject`.
6. **Cryptographic Audit Ledger:** Every `verify` step appends a SHA-256-chained `AuditLedgerEntry` (`previousHash -> recordHash`), verifiable anytime via `audit`.

---

## Quick Command Workflow

### Step 1: Run `prepare` BEFORE Writing or Editing Code
```bash
npx tsx scripts/genesis/genesis-code-cli.ts prepare .
```
*(Or specify a subdirectory or explicit contract: `npx tsx scripts/genesis/genesis-code-cli.ts prepare src "Task" "class Engine,runQuery" "TODO,exec_raw"`)*

**What `prepare` returns in `< 5ms`:**
- `wavefrontBuildOrder`: The exact leaf-to-root file order to implement (`types.py -> wal.py -> engine.py`).
- `astSkeletonsByFile`: Every file's complete multi-line symbol signatures and local imports.
- `loadedWarmAntigens`: Any previously learned constraints from `.genesis/state.json` automatically merged into `guardrailRules.mustContainSymbols`.
- `guardrailRules.forbiddenAndDecoyPatternsToReject`: Any decoy/trap keys detected in `.json` configs that you **MUST ignore and never implement**.

### Step 2: Run `verify` AFTER Writing Code
```bash
npx tsx scripts/genesis/genesis-code-cli.ts verify .
```
*(Or verify a single file with explicit required symbols: `npx tsx scripts/genesis/genesis-code-cli.ts verify src/engine.ts "class Engine,runQuery" "TODO,exec_raw"`)*

- **Completion Rule:** When `"finalVerdict": "REAL_FILE_CONSTITUTIONALLY_CERTIFIED"` is returned, the implementation is verified.
- If `"REAL_FILE_FAILED_CONTRACT_SEE_CORRECTION_SIGNAL"` is returned:
  - If the edit degraded a previously healthier file, the **Monotonic Workspace Ratchet** automatically restores the last verified snapshot on disk (`ratchetDecision.rolledBackToSnapshot: true`).
  - Apply the exact fix listed in `correctionSignal` and re-run `verify`.

### Step 3 (Optional): Run `audit` to Verify the Cryptographic Ledger
```bash
npx tsx scripts/genesis/genesis-code-cli.ts audit .
```
Verifies the SHA-256 hash chain (`ledgerChainValid: true`) across all `AuditLedgerEntry` records and lists all recorded `AntigenSignature` rules in `.genesis/state.json`.
