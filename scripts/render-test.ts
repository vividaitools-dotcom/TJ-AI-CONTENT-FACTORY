/**
 * Real render verification for the TJ AI CONTENT FACTORY production engine.
 * Uses the same modules the API route uses (lib/design poster renderer and
 * lib/ffmpeg video engine) and validates the exported file with ffprobe.
 *
 * Run: npx tsx scripts/render-test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderPoster } from '../lib/design';
import { extractThumbnail, generateAmbientBed, renderVideo, type SceneInput } from '../lib/ffmpeg';

let passed = 0;
let failed = 0;
const good = (msg: string) => { console.log(`  [PASS] ${msg}`); passed++; };
const bad = (msg: string) => { console.log(`  [FAIL] ${msg}`); failed++; };

function probe(file: string) {
  const raw = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-show_entries', 'format=duration,format_name', '-of', 'json', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(raw) as {
    streams?: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>;
    format?: { duration?: string; format_name?: string };
  };
}

async function main() {
  console.log('TJ AI CONTENT FACTORY · production engine render test');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tjcf-render-'));
  const outPath = path.join(workDir, 'shorts-9x16.mp4');

  // 1. Multi-image visuals: two distinct AI-styled posters (no API key needed).
  const posters: string[] = [];
  for (const [i, spec] of [
    { title: 'Discover the signal', kicker: 'TREND RADAR', sub: 'What is actually rising today', palette: 'aurora' },
    { title: 'Produce and publish', kicker: 'FACTORY LINE', sub: 'Script, voice, edit, ship', palette: 'ember' },
  ].entries()) {
    const file = path.join(workDir, `poster-${i}.png`);
    await renderPoster({ ...spec, aspect: '9:16', outPath: file, workDir, seed: spec.palette, watermark: 'TJ AI CONTENT FACTORY' });
    if (fs.existsSync(file) && fs.statSync(file).size > 5000) good(`visuals: poster ${i + 1} rendered (${fs.statSync(file).size} bytes)`);
    else bad(`visuals: poster ${i + 1} missing or empty`);
    posters.push(file);
  }

  // 2. Generated background music bed.
  const music = path.join(workDir, 'bed.m4a');
  try {
    await generateAmbientBed(8, music);
    if (fs.existsSync(music) && fs.statSync(music).size > 2000) good(`audio: ambient music bed generated (${fs.statSync(music).size} bytes)`);
    else bad('audio: music bed missing or empty');
  } catch (error) {
    bad(`audio: music bed failed -> ${(error as Error).message}`);
  }

  // 3. Full production render: 2 scenes, motion, transition, burned subtitles, music.
  const scenes: SceneInput[] = [
    { id: 's1', text: 'Discover trends before your competitors do.', imagePath: posters[0], duration: 3.5, motion: 'zoom-in', transition: 'fade', palette: 'aurora' },
    { id: 's2', text: 'Create, produce and publish in one place.', imagePath: posters[1], duration: 3.5, motion: 'pan-right', transition: 'dissolve', palette: 'ember' },
  ];

  const stages: string[] = [];
  const result = await renderVideo({
    aspect: '9:16',
    scenes,
    subtitles: true,
    musicPath: fs.existsSync(music) ? music : null,
    musicVolume: 0.12,
    workDir,
    outPath,
    onProgress: (percent, stage) => { stages.push(`${stage}:${percent}`); },
  });
  console.log(`  progress events: ${stages.length} (${stages[0]} -> ${stages[stages.length - 1]})`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 50_000) good(`engine: MP4 written (${fs.statSync(outPath).size} bytes)`);
  else bad('engine: MP4 missing or too small');

  // 4. Validate container, codec, resolution, duration, audio.
  const info = probe(outPath);
  const video = info.streams?.find((s) => s.codec_type === 'video');
  const audio = info.streams?.find((s) => s.codec_type === 'audio');
  const duration = Number(info.format?.duration || 0);
  console.log(`  probe: ${video?.codec_name} ${video?.width}x${video?.height} · ${duration.toFixed(2)}s · ${info.format?.format_name}`);

  if (video?.codec_name === 'h264') good('export: H.264 video stream');
  else bad(`export: expected h264, got ${video?.codec_name}`);
  if (video?.width === 1080 && video?.height === 1920) good('export: 9:16 1080x1920 (Shorts ready)');
  else bad(`export: wrong dimensions ${video?.width}x${video?.height}`);
  if (duration > 5) good(`export: duration ${duration.toFixed(2)}s spans both scenes`);
  else bad(`export: duration too short (${duration.toFixed(2)}s)`);
  if (audio) good(`export: audio track present (${audio.codec_name})`);
  else bad('export: no audio track despite music bed');
  if (result && typeof result === 'object') good('engine: render result returned');

  // 5. Thumbnail extraction for publishing.
  const thumb = path.join(workDir, 'thumb.jpg');
  try {
    await extractThumbnail(outPath, thumb, 1.5);
    if (fs.existsSync(thumb) && fs.statSync(thumb).size > 2000) good(`export: thumbnail extracted (${fs.statSync(thumb).size} bytes)`);
    else bad('export: thumbnail missing or empty');
  } catch (error) {
    bad(`export: thumbnail failed -> ${(error as Error).message}`);
  }

  // 6. Second aspect ratio to prove the layout engine is not hard-coded.
  const widePath = path.join(workDir, 'longform-16x9.mp4');
  try {
    await renderVideo({
      aspect: '16:9',
      scenes: [{ id: 'w1', text: 'Long-form mode renders at 1920x1080.', imagePath: posters[0], duration: 2.5, motion: 'static', transition: 'fade', palette: 'aurora' }],
      subtitles: false,
      workDir,
      outPath: widePath,
    });
    const wide = probe(widePath).streams?.find((s) => s.codec_type === 'video');
    if (wide?.width === 1920 && wide?.height === 1080) good('export: 16:9 1920x1080 long-form render');
    else bad(`export: 16:9 render wrong dimensions ${wide?.width}x${wide?.height}`);
  } catch (error) {
    bad(`export: 16:9 render failed -> ${(error as Error).message}`);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  console.log(`Artifacts: ${workDir}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`Fatal: ${error?.stack || error}`);
  process.exit(1);
});
