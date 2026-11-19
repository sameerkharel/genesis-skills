# Quickstart Guide (`genesis-code`)

Get running in under 60 seconds with zero API keys and zero runtime dependencies.

---

## 1. Install Into Your Project

```bash
# Clone once
git clone https://github.com/sameerkharel/genesis-skills.git

# Create or select your project folder
mkdir MyProject

# Install genesis-code into your project
node genesis-skills/install.mjs ./MyProject
```

---

## 2. Use in Your IDE or Terminal

### In Chat (Antigravity, Claude Code, Cursor)
Open `MyProject` and prompt:
> *"Use `@genesis-code` to implement [your feature]."*

### In Terminal (Quick Commands)
```bash
# 1. Scan dependency build order, symbol skeletons, config decoys & saved lessons
npx tsx scripts/genesis/genesis-code-cli.ts prepare .

# 2. Verify code + real syntax & tests (auto-rolls back on regression)
npx tsx scripts/genesis/genesis-code-cli.ts verify . --syntax --test "npm test"

# 3. Inspect Failure Memory lessons or verify the SHA-256 ledger
npx tsx scripts/genesis/genesis-code-cli.ts lessons .
npx tsx scripts/genesis/genesis-code-cli.ts audit .
```

### Enable Automatic `PostToolUse` Hooks (Claude Code)
Copy `.claude/genesis-hooks.example.json` into `.claude/settings.json` to run verification automatically after every `Write`, `Edit`, or `MultiEdit` tool call.
