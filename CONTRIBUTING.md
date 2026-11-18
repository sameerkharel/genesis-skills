# Contributing to GENESIS Skills

Thank you for contributing to `genesis-skills`!

## Core Engineering Principles

1. **Zero External API Keys in Local Skill CLIs:**
   `genesis-code-cli.ts` and `genesis-video-cli.ts` must execute 100% locally in milliseconds using standard Node.js (`fs`, `path`, `child_process`) and `ffmpeg`/`ffprobe` (for video pixel decoding).
2. **100% Honest Telemetry (Zero Simulated Numbers):**
   Every metric returned by `prepare`, `verify`, or `audit-and-blend` must be computed dynamically from real files on disk or real decoded `rgb24` video frames. Never hardcode benchmark tables or fake scores inside engine modules.
3. **Lazy-First Ergonomics:**
   Every CLI command must work with sensible defaults (e.g., `prepare .` and `verify .`) without forcing the user or LLM agent to manually type long CSV parameter lists.

## Running the Test Suite

Before opening a pull request, run the built-in Node test suite:

```bash
npm test
```

All 8 unit and integration tests (covering topological DAG ordering, decoy config sanitization, AST skeleton extraction, static file verification, multi-shot prompt compilation, semantic track caching, real `ffmpeg` MP4 auditing, and 1-command multi-IDE installation) must pass with zero warnings.
