# Quickstart Guide (`genesis-skills`)

Get up and running with `genesis-code` and `genesis-video` in under 60 seconds. Zero API keys required.

---

## 1. Install into Any Project (1 Quick Command)

Clone `genesis-skills` once, then pass the path to any target project folder where you want the skills installed:

```bash
# 1. Clone the repository once
git clone https://github.com/sameerkharel/genesis-skills.git

# 2. Create or choose your project directory
mkdir MyProject

# 3. Install the skills into your project
node genesis-skills/install.mjs ./MyProject
```
*(Or if you are already inside the `genesis-skills` directory: `npm run init -- /path/to/MyProject`)*

**What gets installed inside `MyProject` (`~5ms`):**
- **Antigravity IDE / Gemini CLI / Open-Skills:** `.agent/skills/genesis-code/SKILL.md` & `.agent/skills/genesis-video/SKILL.md`
- **Claude Code:** `.claude/skills/genesis-code/SKILL.md` & `.claude/skills/genesis-video/SKILL.md`
- **Cursor IDE:** `.cursor/rules/genesis-code.mdc` & `.cursor/rules/genesis-video.mdc`
- **Local Zero-Key CLIs:** `scripts/genesis/genesis-code-cli.ts` & `scripts/genesis/genesis-video-cli.ts`

---

## 2. How to Use `genesis-code`

Open `MyProject` in **Antigravity, Claude Code, or Cursor**.

### Option A: Automated Agent Mode (In Chat)
Prompt your AI coding agent directly:
> *"Use `@genesis-code` to build/refactor this feature."*

### Option B: Direct CLI Quick Commands (In Terminal)
```bash
# 1. Scan dependency build order, multi-line AST skeletons, config traps & learned constraints
npx tsx scripts/genesis/genesis-code-cli.ts prepare .

# 2. Verify all files + commit to the Monotonic Workspace Ratchet (auto-rolls back degraded edits)
npx tsx scripts/genesis/genesis-code-cli.ts verify .

# 3. (Optional) Verify the cryptographic AuditLedger chain & inspect recorded constraints
npx tsx scripts/genesis/genesis-code-cli.ts audit .
```

---

## 3. How to Use `genesis-video`

Prevent character, wardrobe, and environment morphing across multi-shot AI videos in **Google Flow (Veo), Sora, or Runway**:

### Option A: Automated Agent Mode (In Chat)
> *"Use `@genesis-video` to compile continuity-locked prompts from `storyboard.json`."*

### Option B: Direct CLI Quick Commands (In Terminal)
```bash
# Step 1: Compile continuity-locked prompts from your storyboard JSON
npx tsx scripts/genesis/genesis-video-cli.ts compile-shots examples/sample-storyboard.json FLOW_PROMPTS.md

# Step 2 (Optional): Extract the exact final frame of Shot 1 as a PNG Start-Frame anchor for Shot 2
npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor shot1.mp4 shot1_last_frame.png

# Step 3: Audit real MP4 pixel continuity & blend Shot 1 + Shot 2 with an 8-frame cosine cross-fade
npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend shot1.mp4 shot2.mp4 final_blended.mp4
```
