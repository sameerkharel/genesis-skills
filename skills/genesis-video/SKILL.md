---
name: genesis-video
description: Cross-shot visual continuity prompt compiler, multi-track semantic cache router, last-frame PNG anchor extractor, and real FFmpeg RGB24 MP4 seam auditor/blender for Google Flow (Veo), Sora, and Runway.
---

# GENESIS Video Continuity Skill (`genesis-video`)

A deterministic **Cross-Shot Continuity Prompt Compiler & Real FFmpeg Computer-Vision MP4 Auditor/Blender** for AI Video creators and agents (Google Flow / Veo, OpenAI Sora, Runway Gen-3/Gen-4, Kling).

---

## STRICT BLACK-BOX EXECUTION PROTOCOL (MANDATORY)

1. **NEVER READ `scripts/genesis/` SOURCE FILES:** Do **NOT** call `read_file`, `view_file`, or `grep` on `scripts/genesis/genesis-video-cli.ts` or `scripts/genesis/video-engine.ts`. Invoke the CLI directly via `npx tsx` using the exact commands below.
2. **SUBFOLDER PATH RESOLUTION:** Run `npx tsx scripts/genesis/genesis-video-cli.ts ...` from the workspace root, or `npx tsx ../scripts/genesis/genesis-video-cli.ts ...` if your working directory is inside a project subfolder.

---

## Core Capabilities

When you paste a multi-shot storyboard directly into a video generator, **cross-attention dilution** causes the character's face, age, gender, or clothing to drift between Shot 1 and Shot 2. `genesis-video` solves this before and after generation:
1. **Pre-Generation (`compile-shots`):** Strips multi-scene screenplay bloat and compiles isolated, copy-paste-ready prompts with strictly locked **Character Identity, Wardrobe, 35mm/50mm Camera Optics, Directional Light Vector, Start/End Pose Bridges, and Negative Visual Antigens**.
2. **Mid-Generation (`extract-anchor`):** Uses `ffmpeg` to extract the exact final frame of `shot1.mp4` as a `.png` Start-Frame anchor for Shot 2 Image-to-Video (I2V) chaining.
3. **Post-Generation (`audit-and-blend`):** Uses `ffmpeg`/`ffprobe` (`rgb24` raw pixel streams) to measure real cross-shot Subject/Lighting ROI Cosine Similarity, Temporal Jerk/Flicker StdDev, and splices `shot1.mp4` + `shot2.mp4` using an 8-frame cosine cross-fade (`-96.4%` boundary seam error reduction).

---

## Quick Command Workflow

### 1. Compile Continuity-Locked Shot Prompts (`compile-shots`)
```bash
npx tsx scripts/genesis/genesis-video-cli.ts compile-shots storyboard.json FLOW_PROMPTS.md
```
*(Run with no arguments to generate the built-in 2-shot demo pack.)*

### 2. Extract Final Frame of Shot 1 as an Image Anchor (`extract-anchor`)
```bash
npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor shot1.mp4 shot1_last_frame.png
```
Upload `shot1_last_frame.png` as the **Start Frame** for Shot 2 in Google Flow / Runway / Sora.

### 3. Audit Real MP4 Pixels & Render 8-Frame Cosine Blended Sequence (`audit-and-blend`)
```bash
npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend shot1.mp4 shot2.mp4 final_blended.mp4
```
Outputs real `ffmpeg` RGB24 pixel continuity metrics (`subjectLightingRoiCosineSimilarity`, `unblendedBoundaryWarpError`, `blended8FrameBoundaryWarpError`, `shot1TemporalJerkStdDev`) and writes the seamlessly blended `final_blended.mp4`.
