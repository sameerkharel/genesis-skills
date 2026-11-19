# Contributing to GENESIS Code

Contributions, bug reports, and benchmark improvements are welcome.

## Development Setup

```bash
# Run the full unit and integration test suite (Node >= 18)
npm test

# Run the CLI directly against the sample project
npm run prepare-code -- examples/sample-project
npm run verify-code -- examples/sample-project --syntax
```

## Engineering Principles

1. **Zero runtime dependencies:** Core verification modules (`src/*.ts`) should rely only on Node.js built-in modules (`node:fs`, `node:path`, `node:crypto`, `node:child_process`).
2. **100% measured outputs:** Never emit synthetic, mocked, or hardcoded metrics in CLI responses. Every reported value must come directly from disk content, subprocess exit codes, or real SHA-256 digests.
3. **Tests for every change:** Add unit tests in `tests/genesis-code.test.ts` covering any new parser rule, verifier flag, or hook behavior.
