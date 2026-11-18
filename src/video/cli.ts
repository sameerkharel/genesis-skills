#!/usr/bin/env npx tsx
/**
 * ============================================================================
 * GENESIS VIDEO CLI (`src/video/cli.ts`)
 * Cross-Shot Continuity Prompt Compiler, Last-Frame Anchor Extractor &
 * Real FFmpeg MP4 Pixel Auditor / 8-Frame Cosine Seam Blender
 * ============================================================================
 *
 * Commands:
 *   1. Compile multi-shot prompts for Google Flow / Veo / Sora / Runway:
 *      npx tsx scripts/genesis/genesis-video-cli.ts compile-shots [storyboard.json] [out_prompts.md]
 *
 *   2. Extract exact final frame of Shot 1 as a PNG Start-Frame Anchor for Shot 2:
 *      npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor <shot1.mp4> [shot1_last_frame.png]
 *
 *   3. Audit & seamlessly blend two real `.mp4` video shots via `ffmpeg`:
 *      npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend <shot1.mp4> <shot2.mp4> [blended_out.mp4]
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  MultiShotStoryboardSpec,
  compileMultiShotContinuityPack,
  extractLastFrameAnchorPng,
  auditAndBlendRealMp4Pair,
} from './engine';

const [, , rawCommand, ...args] = process.argv;
const command = (rawCommand || '').toLowerCase();

const DEFAULT_DEMO_STORYBOARD: MultiShotStoryboardSpec = {
  projectTitle: 'Observatory Bioluminescent Vial Sequence',
  character: {
    name: 'Dr. Elena Vance',
    physicalDescription: '35-year-old woman with dark hair tied in a neat low bun',
    wardrobeDescription: 'a tailored silver-gray lab coat over a dark navy turtleneck',
  },
  environment: {
    settingDescription:
      'a high-altitude glass observatory at night with rain streaks on the glass behind her',
    cameraFocalLengthMm: 35,
    lightingDescription: 'Soft cyan-white key light from top-left',
    primaryLightVector: [-0.5, 0.8, -0.3],
  },
  shots: [
    {
      shotId: 'shot_01_inspect_vial',
      durationSec: 8,
      atomicAction:
        'She slowly lifts a glowing cyan glass vial with her bare right hand from the steel table to eye level and inspects the swirling bioluminescent liquid.',
      startPoseAnchor:
        'Standing centered behind the brushed-steel console, right hand resting on the base of the glowing cyan glass vial on the table.',
      endPoseAnchor:
        'Holding the glowing cyan glass vial steady at chest-to-chin height in her bare right hand, looking calmly at the vial.',
      dialogueLine: 'Phase-two bioluminescence is stable.',
      activeProp: 'glowing_cyan_glass_vial',
      directorNote: 'Keep tripod locked; do not cut early.',
    },
    {
      shotId: 'shot_02_pour_beaker',
      durationSec: 8,
      atomicAction:
        'She smoothly tilts the glowing cyan glass vial in her bare right hand and pours a steady laminar stream of glowing cyan liquid downward into a clear glass beaker on the brushed-steel console.',
      startPoseAnchor:
        'CONTINUATION FROM SHOT 1 END FRAME: Holding the glowing cyan glass vial at chest-to-chin height in her bare right hand above a clear glass beaker on the brushed-steel console.',
      endPoseAnchor:
        'The glowing cyan liquid settles calmly at the bottom of the glass beaker as she lowers the empty vial back toward the table.',
      dialogueLine: 'Transfer complete.',
      activeProp: 'glowing_cyan_glass_vial_and_beaker',
      directorNote: 'Ensure natural downward fluid gravity.',
    },
  ],
};

function main() {
  if (command === 'compile-shots' || command === 'compile') {
    const startedAt = performance.now();
    const specArg = args[0];
    const outMdArg = args[1];

    let spec: MultiShotStoryboardSpec = DEFAULT_DEMO_STORYBOARD;
    if (specArg && fs.existsSync(path.resolve(specArg))) {
      spec = JSON.parse(fs.readFileSync(path.resolve(specArg), 'utf8')) as MultiShotStoryboardSpec;
    }

    const pack = compileMultiShotContinuityPack(spec);
    let savedMdPath: string | null = null;
    if (outMdArg) {
      savedMdPath = path.resolve(outMdArg);
      fs.mkdirSync(path.dirname(savedMdPath), { recursive: true });
      fs.writeFileSync(savedMdPath, pack.markdownGuide, 'utf8');
    }

    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(
      JSON.stringify(
        {
          skill: 'genesis-video',
          command: 'compile-shots',
          elapsedMs,
          projectTitle: pack.projectTitle,
          romHash: pack.romHash,
          savedMarkdownPath: savedMdPath,
          compiledShots: pack.compiledShots,
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'extract-anchor') {
    const startedAt = performance.now();
    const mp4Path = args[0];
    if (!mp4Path || !fs.existsSync(path.resolve(mp4Path))) {
      console.error(
        'Usage: npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor <shot1.mp4> [output_last_frame.png]'
      );
      process.exit(1);
    }
    const defaultOut = mp4Path.replace(/\.mp4$/i, '_last_frame_anchor.png');
    const outPng = args[1] || defaultOut;
    const res = extractLastFrameAnchorPng(mp4Path, outPng);
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));

    console.log(
      JSON.stringify(
        {
          skill: 'genesis-video',
          command: 'extract-anchor',
          elapsedMs,
          ...res,
          nextStepTip:
            'Upload this extracted PNG as the Start Frame / Image Reference for Shot 2 in Google Flow, Runway, or Sora to physically lock cross-shot pixel continuity.',
        },
        null,
        2
      )
    );
    return;
  }

  if (command === 'audit-and-blend' || command === 'audit') {
    const startedAt = performance.now();
    const shot1 = args[0];
    const shot2 = args[1];
    const outBlended = args[2];

    if (
      !shot1 ||
      !shot2 ||
      !fs.existsSync(path.resolve(shot1)) ||
      !fs.existsSync(path.resolve(shot2))
    ) {
      console.error(
        'Usage: npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend <shot1.mp4> <shot2.mp4> [output_blended.mp4]'
      );
      process.exit(1);
    }

    const report = auditAndBlendRealMp4Pair(shot1, shot2, outBlended);
    const elapsedMs = Number((performance.now() - startedAt).toFixed(2));

    console.log(
      JSON.stringify(
        {
          skill: 'genesis-video',
          command: 'audit-and-blend',
          elapsedMs,
          ...report,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`====================================================================
🎬 GENESIS VIDEO SKILL CLI (Continuity Prompt Compiler & FFmpeg Auditor)
====================================================================
Commands:
  1. Compile Information-Hidden Shot Prompts (Google Flow / Veo / Sora / Runway):
     npx tsx scripts/genesis/genesis-video-cli.ts compile-shots [storyboard.json] [FLOW_PROMPTS.md]

  2. Extract Final Frame of Shot 1 as a PNG Start-Frame Anchor for Shot 2:
     npx tsx scripts/genesis/genesis-video-cli.ts extract-anchor <shot1.mp4> [shot1_anchor.png]

  3. Real FFmpeg RGB24 Pixel Audit & 8-Frame Cosine Boundary Seam Blender:
     npx tsx scripts/genesis/genesis-video-cli.ts audit-and-blend <shot1.mp4> <shot2.mp4> [blended.mp4]
`);
}

main();
