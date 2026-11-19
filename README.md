# GENESIS Code (`genesis-code`)

> **Lightweight, zero-dependency deterministic verification gate, real test-gated auto-rollback ratchet, cross-session failure memory, and dependency DAG scanner for AI coding agents (`Antigravity`, `Claude Code`, `Cursor`, `Codex`, `Gemini CLI`).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](./package.json)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-success.svg)](#)
[![API Keys](https://img.shields.io/badge/API%20keys%20required-None-success.svg)](#)

---

## Why This Exists

AI coding agents are fast, but three failure modes repeat across almost every multi-file session:

1. **Silent regressions:** An agent edits a working file to fix one issue and quietly breaks existing tests, introduces a syntax error, or leaves behind a `TODO` / `NotImplementedError` stub.
2. **Groundhog Day mistakes:** When a session ends, the agent forgets repo-specific pitfalls—so the next session makes the exact same mistake unless a human manually updates `CLAUDE.md` or `.cursorrules`.
3. **Wasted exploration turns:** Agents burn thousands of tokens running `ls`, reading entire files, or guessing import order before writing code.

**GENESIS Code** solves these locally in a few milliseconds using **zero external runtime dependencies** and **zero API keys**. It works both as an **Agent Skill (`SKILL.md` / `.mdc`)** and as a **deterministic `PostToolUse` hook** for Claude Code and compatible harnesses.

---

## Core Features (100% Real, Zero Synthetic Metrics)

- **Dependency DAG & Multi-Line Symbol Skeletons (`prepare`):**
  Scans `.ts`, `.tsx`, `.py`, `.js`, and `.mjs` files, resolves local imports (`import ... from`, `export ... from`, `require()`, Python `from ... import`, `import mod`, `import mod as m`), computes leaf-to-root `wavefrontBuildOrder`, and extracts multi-line class/function/method signatures without loading implementation bodies into context.
- **JSON Config Decoy Sanitizer:**
  Scans `.json` configs and flags debug-bypass or prompt-injection keys (`_debug_*`, `_legacy_*`, `bypass_*`, `mcp.shell.exec_raw`) as forbidden patterns before the agent starts coding.
- **Real Executable Verification (`verify --syntax --test "<cmd>"`):**
  Validates static contract obligations (comment-stripped so `// TODO: implement X` cannot spoof checks), string-aware hygiene checks, real language syntax checks (`python3 -m py_compile` / `node --check`), and any real test or typecheck command (`pytest`, `npx tsc --noEmit`, `npm test`).
- **Monotonic Workspace Ratchet (Auto-Rollback on Disk):**
  Snapshots the last verified good state of each file in `.genesis/state.json`. If a subsequent edit degrades code health or breaks a previously passing `--syntax` or `--test` check, `verify` rejects the regression and **automatically restores the last verified file snapshot on disk**.
- **Cross-Session Failure Memory (`.genesis/state.json`):**
  Automatically records real contract, syntax, and test failure diagnostics as structured `FailureLesson` entries tied to specific files, then injects them into future `prepare` runs so the next session sees past pitfalls up front.
- **Tamper-Evident Real SHA-256 Audit Ledger (`audit`):**
  Every verification event is chained using Node.js built-in `node:crypto` SHA-256 (`previousHash -> recordHash`) and verifiable via `audit`.
- **Native `PostToolUse` Hook Support (`hook`):**
  Reads standard Claude Code `PostToolUse` stdin JSON (`tool_input.file_path`) to verify edits deterministically after every file write/edit tool call—without relying on the LLM to remember to run `verify`.

---

## Quick Setup (Windows, macOS & Linux)

### Prerequisites
- **Node.js `>= 18.0.0`** (includes `npx`)
- **Python 3** *(optional — used only when running `--syntax` on `.py` files)*

### 1. Clone Once to Your Machine
```bash
git clone https://github.com/sameerkharel/genesis-skills.git
```

### 2. Install Into Any Target Project (1 Command)
Your projects stay in their own separate folders:

```bash
mkdir MyProject

# macOS / Linux:
node genesis-skills/install.mjs ./MyProject

# Windows (PowerShell / CMD):
node genesis-skills\install.mjs .\MyProject
```

**Installed structure inside `MyProject` (`< 15ms`):**
```text
MyProject/
├── .agent/skills/genesis-code/SKILL.md     # Antigravity IDE / Gemini CLI
├── .claude/skills/genesis-code/SKILL.md    # Claude Code Skill
├── .claude/genesis-hooks.example.json      # Ready-to-use PostToolUse hook snippet
├── .cursor/rules/genesis-code.mdc          # Cursor IDE Rules
└── scripts/genesis/
    ├── hash.ts                             # Real node:crypto SHA-256
    ├── state.ts                            # Failure Memory, Ratchet & Ledger store
    ├── dag.ts                              # Polyglot DAG & multi-line skeleton scanner
    ├── verifier.ts                         # Contract, syntax & test-gated verifier
    ├── index.ts                            # Module exports
    └── genesis-code-cli.ts                 # CLI entry point
```

---

## Usage

### Mode A: Inside Your AI Coding Agent (Chat)
Open `MyProject` in **Antigravity IDE, Claude Code, or Cursor** and prompt:
> *"Use `@genesis-code` to implement this feature."*

### Mode B: Deterministic `PostToolUse` Hook (Claude Code)
Copy the snippet from `.claude/genesis-hooks.example.json` into your project's `.claude/settings.json` to run deterministic verification automatically after every `Write`, `Edit`, or `MultiEdit` tool call:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npx tsx scripts/genesis/genesis-code-cli.ts hook --syntax"
          }
        ]
      }
    ]
  }
}
```
*(You can also append `--test "pytest"` or `--test "npx tsc --noEmit"` to gate edits on your real test suite.)*

### Mode C: Direct Terminal Commands

| Command | Example | What It Does |
| :--- | :--- | :--- |
| **`prepare`** | `npx tsx scripts/genesis/genesis-code-cli.ts prepare .` | Scans files, computes leaf-to-root `wavefrontBuildOrder`, extracts multi-line symbol skeletons, isolates JSON decoy keys, and loads saved Failure Memory lessons. |
| **`verify`** | `npx tsx scripts/genesis/genesis-code-cli.ts verify . --syntax --test "pytest"` | Audits files against contract/hygiene + real syntax/test command, auto-rolls back regressions on disk, records Failure Memory, and updates the SHA-256 ledger. |
| **`audit`** | `npx tsx scripts/genesis/genesis-code-cli.ts audit .` | Verifies the real SHA-256 audit ledger hash chain (`ledgerChainValid: true`) and prints ratcheted snapshots. |
| **`lessons`** | `npx tsx scripts/genesis/genesis-code-cli.ts lessons .` | Lists learned cross-session Failure Memory entries (add `--clear` to reset). |

---

## Honest Scope: When to Use This (and When Not To)

**Use `genesis-code` when you want:**
- Zero-dependency, zero-API-key guardrails that work identically across **Antigravity, Claude Code, and Cursor**.
- Automatic file-level rollback on regressions—even before you commit to Git.
- Persistent, automatic Failure Memory that carries real test/syntax/contract lessons across sessions.

**Limitations (transparently stated):**
- Symbol extraction uses lightweight multi-line regex stitching for **TypeScript, JavaScript, and Python** rather than a native Tree-sitter parser. If you need full AST parsing for C++, Rust, Java, or Go, pair this with a Tree-sitter-based tool like Aider.
- Static checks alone cannot prove business logic correctness—always pass `--syntax` and `--test "<your_test_command>"` for runtime guarantees.

---

## Benchmarks & Tests

See [BENCHMARKS.md](./BENCHMARKS.md) for real-world A/B traces and verification data.

Run the full test suite locally:
```bash
npm test
```

---

## License

Released under the [MIT License](./LICENSE).
