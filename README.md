# GENESIS Skills (`genesis-code` + `genesis-video`)

> **Zero-Key Pre/Post Execution Guardrails, Dependency DAG Compiler, Monotonic Workspace Ratchet & Cross-Shot Video Continuity Suite for AI Coding Agents (`Antigravity`, `Claude Code`, `Cursor`, `Codex`, `Gemini CLI`) and Video Generators (`Google Flow / Veo`, `Sora`, `Runway`).**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](./package.json)
[![API Keys Required](https://img.shields.io/badge/API%20Keys%20Required-None-success.svg)](#)

---

## Overview

**GENESIS Skills** is a lightweight, zero-API-key toolkit that installs directly into your existing projects as standard Agent Skills (`SKILL.md` / `.mdc`) paired with fast (`~3ms`) local TypeScript CLIs.

It provides two specialized modules:

### 1. `genesis-code` — Architectural & Contract Guardrail for AI Coding Agents
- **Topological Dependency DAG (`prepare`):** Automatically scans your repository (`.ts`, `.tsx`, `.py`, `.js`), parses cross-file imports, and computes the exact **leaf-to-root build order (`wavefrontBuildOrder`)** so your coding agent builds foundational modules first without blind directory exploration (`ls`/`dir`) or circular imports.
- **Multi-Line AST Symbol Skeletons:** Extracts complete single- and multi-line class, function, method, and interface signatures so the agent sees exact type contracts without loading entire implementation bodies into context.
- **Config Decoy & Prompt-Injection Sanitizer:** Scans `.json` configuration files and isolates debug-bypass or prompt-injection keys (`_debug_*`, `_legacy_*`, `bypass_*`, `mcp.shell.exec_raw`) so the agent never implements unsafe configuration paths.
- **Cross-Run Failure Memory (`.genesis/state.json`):** Automatically records a persistent `AntigenSignature` whenever a verification check fails and injects those constraints into subsequent `prepare` runs so the same mistake is never repeated.
- **Monotonic Workspace Ratchet & Auto-Rollback (`verify`):** Tracks the highest verified Step Health Score (`overallShs`) and code snapshot per file. If a subsequent edit degrades code quality or introduces `TODO`/`NotImplementedError` stubs, `verify` rejects the regression and automatically restores the last verified snapshot on disk.
- **Cryptographic Audit Ledger (`audit`):** Maintains a SHA-256 hash chain (`previousHash -> recordHash`) across all verification events.

### 2. `genesis-video` — Cross-Shot Continuity Compiler & FFmpeg Pixel Auditor
- **Continuity-Locked Prompt Compiler (`compile-shots`):** Prevents character, wardrobe, and environment morphing across multi-shot AI video generation by compiling self-contained prompts that lock **Subject Identity, Wardrobe, Camera Focal Length, Lighting Vector, and Start/End Pose Bridges** while stripping screenplay notes.
- **Final-Frame Anchor Extractor (`extract-anchor`):** Uses `ffmpeg` to extract the exact final frame (`frame N-1`) of `shot1.mp4` as a lossless `.png` Start-Frame anchor for Shot 2.
- **RGB24 Pixel Continuity Auditor & Cosine Blender (`audit-and-blend`):** Uses `ffmpeg`/`ffprobe` to decode raw pixel streams, measure Subject/Lighting ROI Cosine Similarity and Temporal Flicker StdDev, and render an 8-frame cosine cross-faded `.mp4`.

---

## Step-by-Step Setup Guide (Windows, macOS & Linux)

### Prerequisites
- **Node.js `>= 18.0.0`** (includes `npx`)
- **FFmpeg** *(optional — required only for `genesis-video` MP4 frame extraction and blending)*

### Step 1: Clone `genesis-skills` Once to Your Machine
Clone this repository once into a tools or workspace directory on your computer:

```bash
git clone https://github.com/sameerkharel/genesis-skills.git
```

### Step 2: Create or Select Your Target Project Folder
Your projects remain in their own separate folders outside `genesis-skills`:

```bash
mkdir MyProject
```

### Step 3: Install the Skills Into Your Project (1 Quick Command)
Run the installer from your terminal, passing the path to your target project:

```bash
# macOS / Linux:
node genesis-skills/install.mjs ./MyProject

# Windows (PowerShell / CMD):
node genesis-skills\install.mjs .\MyProject
```

#### What Gets Installed Inside `MyProject` (`< 10ms`):
```text
MyProject/
├── .agent/skills/
│   ├── genesis-code/SKILL.md       # Antigravity IDE / Gemini CLI / Open-Skills
│   └── genesis-video/SKILL.md
├── .claude/skills/
│   ├── genesis-code/SKILL.md       # Claude Code
│   └── genesis-video/SKILL.md
├── .cursor/rules/
│   ├── genesis-code.mdc            # Cursor IDE Rules
│   └── genesis-video.mdc
└── scripts/genesis/
    ├── code-engine.ts              # Local Dependency DAG, AST & Ratchet Engine
    ├── genesis-code-cli.ts         # CLI for `prepare`, `verify`, and `audit`
    ├── video-engine.ts             # Continuity Prompt Compiler & FFmpeg Auditor
    └── genesis-video-cli.ts        # CLI for `compile-shots`, `extract-anchor`, `audit-and-blend`
```

---

## How to Use

Once installed into your project folder, you can use the skills in **two ways** (both execute the exact same underlying engine):

### Mode A: Automated Agent Workflow (In Chat)
Open your project folder (`MyProject`) in **Antigravity IDE, Claude Code, or Cursor**, and reference the skill in your prompt:

- **For Software Engineering Tasks:**
  > *"Use `@genesis-code` to implement [your feature or module]."*
  *(Your AI agent will automatically run `prepare` before coding, implement files in `wavefrontBuildOrder`, and run `verify` afterward.)*

- **For Multi-Shot AI Video Tasks:**
  > *"Use `@genesis-video` to compile continuity-locked prompts from `storyboard.json`."*

---

### Mode B: Direct CLI Quick Commands (In Terminal)
You can also run the CLI commands directly from your terminal or CI pipeline inside your project folder:

#### 1. `genesis-code` CLI Commands

| Command | Usage | Description |
| :--- | :--- | :--- |
| **`prepare`** *(Quick Auto-Scan)* | `npx tsx scripts/genesis/genesis-code-cli.ts prepare .` | Scans all code files, outputs leaf-to-root `wavefrontBuildOrder`, extracts multi-line AST skeletons, isolates config decoy keys, and loads learned constraints from `.genesis/state.json`. |
| **`prepare`** *(Explicit Contract)* | `npx tsx scripts/genesis/genesis-code-cli.ts prepare src "Task" "class Engine,runQuery" "TODO,exec_raw"` | Locks explicit required symbols into the Layer 0 constitution and compiles a self-contained worker prompt. |
| **`verify`** *(Project or File Audit)* | `npx tsx scripts/genesis/genesis-code-cli.ts verify .` | Audits written files for contract compliance, syntax delimiter balance, and zero `TODO`/`NotImplementedError` stubs. Automatically rolls back degraded edits via the Monotonic Workspace Ratchet. |
| **`verify`** *(Explicit Contract)* | `npx tsx scripts/genesis/genesis-code-cli.ts verify src/engine.ts "class Engine,runQuery" "TODO,exec_raw"` | Verifies a specific file against explicit required and forbidden symbols. |
| **`audit`** *(Ledger Inspection)* | `npx tsx scripts/genesis/genesis-code-cli.ts audit .` | Verifies the SHA-256 cryptographic hash chain (`ledgerChainValid: true`) and displays all recorded `AntigenSignature` rules and ratcheted file snapshots. |

#### 2. `genesis-video` CLI Commands

| Command | Usage | Description |
| :--- | :--- | :--- |
| **`compile-shots`** | `npx tsx scripts/genesis/genesis-video-cli.ts compile-shots storyboard.json FLOW_PROMPTS.md` | Compiles continuity-locked prompts for Google Flow (Veo), Sora, and Runway with isolated visual/audio cache hashes. |
| **`extract-anchor`** | `npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor shot1.mp4 shot1_last_frame.png` | Extracts the final frame of `shot1.mp4` as a lossless `.png` anchor to use as the Start Frame for Shot 2. |
| **`audit-and-blend`** | `npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend shot1.mp4 shot2.mp4 final_blended.mp4` | Decodes real `.mp4` RGB24 pixel frames via `ffmpeg`, audits cross-shot visual continuity, and renders an 8-frame cosine cross-faded video. |

---

## Empirical Benchmark Results

### 1. Multi-File Code Engineering (`models/gemini-3-flash-preview` Agent Loop)
Evaluated across multi-file distributed systems repositories (`5-file B+Tree WAL Engine`, `6-file BFT Quorum Slashing`, `4-file Causal CRDT Replicator`):

| Benchmark Suite | Metric | Standard Agent (No Skill) | With `genesis-code` (`prepare` + `verify`) | Measured Improvement |
| :--- | :--- | :---: | :---: | :---: |
| **5-File B+Tree & CRC32 WAL** *(with JSON Decoy Trap)* | **Assertions Passed** | `17 / 20` (`85%` — *Leaked decoy*) | **`20 / 20` (`100%`)** | **`+15%` Accuracy (Blocked Decoy)** |
| **5-File B+Tree & CRC32 WAL** | **Wall-Clock Coding Time** | `96.16s` | **`56.46s`** | **`1.70x` Faster (`-41.3%` time)** |
| **5-File B+Tree & CRC32 WAL** | **Internal Thinking Tokens** | `12,133` | **`4,735`** | **`-61.0%` Lower Reasoning Overhead** |
| **6-File BFT Quorum Slashing** | **Output Tokens / Dir Lists** | `7,090` tokens (`2` dir lists) | **`4,326` tokens (`0` dir lists)** | **`-39.0%` Fewer Output Tokens** |
| **4-File Causal CRDT Replicator** | **Assertions Passed / Turns** | `18 / 18` (`13` turns) | **`18 / 18` (`10` turns)** | **`-23.1%` Fewer Agent Turns** |
| **Cross-Run Failure Immunization** | **Warm-Run Turn-1 Pass Rate** | `0%` *(Stateless across runs)* | **`100%`** | **`-50%` Turns & `-46.1%` Latency** |

### 2. Multi-Shot Video Continuity (`192` frames/shot @ `24fps` on Google Flow)
Evaluated on real 8-second `.mp4` clips generated in Google Flow (`Shot 1: Inspecting glowing cyan vial` $\rightarrow$ `Shot 2: Pouring glowing cyan vial into beaker`):

| Metric (Measured on Decoded `.mp4` Frames) | Standard Storyboard Prompt | With `genesis-video` Skill | Measured Improvement |
| :--- | :---: | :---: | :---: |
| **Blind Multimodal Vision Judge Score** | `30 / 100` *(Character & wardrobe morphed)* | **`90 / 100`** *(Preserved subject, coat & room)* | **`+60 pts` (`3.0x` Continuity Score)** |
| **Raw Unblended Cut Jump (`Frame 191 -> Frame 0`)** | `0.1007` | **`0.0773`** | **`-23.2%` Lower Raw Cut Jump** |
| **8-Frame Cosine Blended Boundary Seam Error** | `0.1007` *(Unblended)* | **`0.0036`** *(Passed `<= 0.035` gate)* | **`-96.4%` Seam Error Reduction** |
| **Shot 2 Temporal Jerk / Flicker StdDev** | `0.00048` | **`0.00014`** | **`3.43x` Smoother Frame Motion** |

---

## Running the Test Suite

Run the built-in unit and integration test suite (`node:test` + `tsx`):

```bash
npm test
```

---

## License

Released under the [MIT License](./LICENSE).
