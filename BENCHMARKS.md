# Empirical Benchmarks & Real-Time Verification

This document records real, reproducible measurements—including both strengths and honest limitations.

---

## 1. Real-World PC A/B Test (5-File Distributed Storage Engine)

**Task:** Build a 5-module Python storage engine (`types_contract.py`, `crc32_wal.py`, `lease_fencer.py`, `cluster_gateway.py`, `run_benchmark_audit.py`) with a JSON configuration file containing prompt-injection decoy keys (`_debug_bypass_crc_and_fencing`, `recommended_unverified_tool`) and a 25-assertion integration test suite.
**Environment:** Local PC Antigravity IDE (`gemini-3.8-flash-high`), comparing identical prompts with vs. without `@genesis-code`.

| Metric (Measured from Raw `.jsonl` Session Traces) | Plain Agent (No Skill) | With `@genesis-code` | Observed Difference |
| :--- | :---: | :---: | :---: |
| **First-Run Integration Suite (`25` Assertions)** | Crashed on Run #1 (`Assertion 03 FAILED: WalRecord frozen`) | **`25 / 25` Passed on Run #1** | Zero debug/edit cycles |
| **Uncached Input Tokens** | `180,486` | **`115,617`** | **`-35.9%`** (`64,869` fewer tokens) |
| **Peak Single-Turn Overthinking Tokens** | `27,380` | **`10,377`** | **`-62.1%`** lower spike |
| **Output Tokens During Coding Phase** | `44,443` | **`19,864`** | **`-55.3%`** during implementation |
| **API 503 Overload Errors** | `4` errors | **`0` errors** | More stable context pacing |
| **Dead Code / Unused Imports Left Behind** | Dead `ACTIVE_SCHEMA_KEYS` constant + 3 unused imports | **Active config key filtering + clean imports** | Cleaner final code |

### Honest Lesson Learned From the Trace (Fixed in v2)
In the initial v1 trace, before the **Strict Black-Box Execution Protocol** was added to `SKILL.md`, the agent spent early turns reading the internal `scripts/genesis/` source code and running unnecessary web searches before invoking `prepare`. Adding explicit black-box rules in `SKILL.md`—plus native `PostToolUse` hook support in v2—eliminates that exploration overhead.

---

## 2. Head-to-Head Verification: `v2` vs. `v1` (`genesis-skills-dist`)

Run the live side-by-side comparison test suite directly to reproduce these results on your machine:

```bash
npm run benchmark:compare
```

| Verification Dimension | `v1` (`genesis-skills-dist`) | `v2` (`genesis-code`) |
| :--- | :--- | :--- |
| **Audit Ledger Hashing** | Custom 32-bit `Math.imul` hex digest | **Real `node:crypto` SHA-256** |
| **Zero Hardcoded Telemetry** | Hardcoded `reasoningTokensMeasured: 20` & `overthinkingPctMeasured: 10.5` | **100% measured fields only** |
| **Python `import mod` / `import mod as m` DAG** | Only matched `from mod import X` (missed plain `import`) | **Full Python `import` + `from ... import` + JS `require()`** |
| **Real Syntax Error Gate (`--syntax`)** | Missed Python `SyntaxError` with balanced `{}` (`passed: true`) | **Catches via real `py_compile` / `node --check`** |
| **Real Test-Gated Auto-Rollback (`--test`)** | Static substring check only (committed runtime bugs at `SHS = 1.0`) | **Runs real test command, auto-rolls back file on disk, and records real `AssertionError` into Failure Memory** |
| **Native `PostToolUse` Hook Support** | None (prompt-only `SKILL.md`) | **Built-in `hook` stdin handler + `.claude/genesis-hooks.example.json`** |
| **5-File Real Benchmark DAG Scan Latency** | `6.13 ms` | **`4.00 ms`** (`-34.7%` faster + passes real 25/25 `--test` gate) |
| **Core Engine Architecture & Size** | 1 monolithic file (`1,837` engine LOC / `2,238` total) | **Modular 5-file core (`1,290` engine LOC / `1,832` total with `hook` + `lessons`)** |
