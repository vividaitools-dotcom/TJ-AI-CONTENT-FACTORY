import fs from 'node:fs';
import path from 'node:path';
import { ASPECTS, dimsFor, renderPoster } from './design';
import { ffmpeg, ffprobeDuration, ffprobeDimensions } from './process';

/* ------------------------------------------------------------------------- */
/* VIDEO EDITOR AND PRODUCTION ENGINE                                        */
/* Real MP4 production with the local ffmpeg binary:                          */
/*   - one or more images per video (Ken Burns motion per scene)              */
/*   - animated motion graphics (zoom / pan / static)                         */
/*   - scene transitions (xfade family)                                       */
/*   - AI narration tracks, background music or a generated ambient bed       */
/*   - burned-in subtitles (libass) + .srt sidecar                            */
/*   - 9:16, 16:9, 1:1, 4:5 exports                                           */
/* ------------------------------------------------------------------------- */

export const MOTIONS = ['zoom-in', 'zoom-out', 'pan-right', 'pan-left', 'pan-up', 'pan-down', 'static'] as const;
export type Motion = (typeof MOTIONS)[number];

export const TRANSITIONS = [
  'fade',
  'dissolve',
  'wipeleft',
  'wiperight',
  'slideleft',
  'slideright',
  'slideup',
  'fadeblack',
  'circleopen',
  'smoothleft',
  'pixelize',
  'zoomin',
  'none',
] as const;
export type Transition = (typeof TRANSITIONS)[number];

export type SceneInput = {
  id: string;
  text: string;
  imagePath: string | null;
  audioPath?: string | null;
  duration: number;
  motion: string;
  transition: string;
  palette?: string;
};

export type RenderOptions = {
  aspect: string;
  scenes: SceneInput[];
  subtitles: boolean;
  musicPath?: string | null;
  musicVolume?: number;
  workDir: string;
  outPath: string;
  fps?: number;
  onProgress?: (percent: number, stage: string) => void | Promise<void>;
};

const TRANSITION_SECONDS = 0.55;

function even(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function sanitizeDuration(value: number): number {
  const clamped = Math.min(30, Math.max(1.2, Number(value) || 4));
  return Math.round(clamped * 100) / 100;
}

function motionFilter(motion: string, width: number, height: number, frames: number): string {
  const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  const base = `s=${width}x${height}:fps=30:d=1`;
  switch (motion) {
    case 'zoom-out':
      return `zoompan=z='max(1.22-0.0020*on,1.0)':${center}:${base}`;
    case 'pan-right':
      return `zoompan=z='1.16':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':${base}`;
    case 'pan-left':
      return `zoompan=z='1.16':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':${base}`;
    case 'pan-up':
      return `zoompan=z='1.16':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${frames})':${base}`;
    case 'pan-down':
      return `zoompan=z='1.16':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${frames}':${base}`;
    case 'static':
      return `zoompan=z='1.0':${center}:${base}`;
    case 'zoom-in':
    default:
      return `zoompan=z='min(1+0.0020*on,1.22)':${center}:${base}`;
  }
}

function srtTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(ms, 3)}`;
}

function wrapCue(text: string, perLine = 34): string {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > perLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

/** Royalty-free by construction: two detuned sine pads + tremolo. */
export async function generateAmbientBed(seconds: number, outPath: string): Promise<string> {
  const duration = Math.max(2, Math.round(seconds * 100) / 100);
  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=196:duration=${duration}:sample_rate=48000`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=293.66:duration=${duration}:sample_rate=48000`,
    '-filter_complex',
    '[0:a][1:a]amix=inputs=2:normalize=0,tremolo=f=0.14:d=0.35,lowpass=f=1100,volume=0.16,aformat=channel_layouts=stereo[a]',
    '-map',
    '[a]',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outPath,
  ]);
  return outPath;
}

export async function extractThumbnail(videoPath: string, outPath: string, atSeconds = 1.2): Promise<string> {
  await ffmpeg([
    '-ss',
    String(Math.max(0, atSeconds)),
    '-i',
    videoPath,
    '-frames:v',
    '1',
    '-vf',
    'scale=1280:-2',
    '-q:v',
    '3',
    outPath,
  ]);
  return outPath;
}

export type RenderResult = {
  outPath: string;
  duration: number;
  width: number;
  height: number;
  subtitlePath: string | null;
  scenes: number;
};

/**
 * Produces a finished MP4. Runs three isolated ffmpeg passes so a failure is
 * attributable: per-scene clips -> transition chain -> audio + subtitle mux.
 */
export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { w, h } = dimsFor(options.aspect);
  const fps = options.fps || 30;
  const workDir = options.workDir;
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });

  const scenes = options.scenes.filter(Boolean);
  if (!scenes.length) throw new Error('Add at least one scene before rendering.');
  const progress = async (pct: number, stage: string) => {
    if (options.onProgress) await options.onProgress(Math.round(pct), stage);
  };

  const durations = scenes.map((scene) => sanitizeDuration(scene.duration));
  const joinDuration = (index: number) => {
    const transition = scenes[index]?.transition || 'fade';
    if (transition === 'none' || scenes.length === 1) return 0;
    return TRANSITION_SECONDS;
  };

  const starts: number[] = [0];
  for (let i = 1; i < scenes.length; i += 1) {
    starts[i] = starts[i - 1] + durations[i - 1] - joinDuration(i);
  }
  const totalDuration = Math.max(
    1.5,
    starts[starts.length - 1] + durations[durations.length - 1],
  );

  /* ------------------------- pass 1: scene clips ------------------------- */
  const clipPaths: string[] = [];
  const supersample = 1.5;
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const dur = durations[i];
    const frames = Math.max(1, Math.round(dur * fps));
    let imagePath = scene.imagePath;
    if (!imagePath || !fs.existsSync(imagePath)) {
      imagePath = await renderPoster({
        title: scene.text || `Scene ${i + 1}`,
        subtitle: '',
        kicker: `SCENE ${i + 1}`,
        aspect: options.aspect,
        palette: scene.palette,
        outPath: path.join(workDir, `auto-${i}.png`),
        workDir,
        seed: scene.id,
      });
    }
    const clipPath = path.join(workDir, `clip-${String(i).padStart(2, '0')}.mp4`);
    const sw = even(w * supersample);
    const sh = even(h * supersample);
    const filters = [
      `scale=${sw}:${sh}:force_original_aspect_ratio=increase`,
      `crop=${sw}:${sh}`,
      'setsar=1',
      motionFilter(scene.motion, w, h, frames),
      'format=yuv420p',
    ].join(',');
    await ffmpeg([
      '-loop',
      '1',
      '-framerate',
      String(fps),
      '-i',
      imagePath,
      '-t',
      dur.toFixed(2),
      '-vf',
      filters,
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-an',
      clipPath,
    ]);
    clipPaths.push(clipPath);
    await progress(5 + (35 * (i + 1)) / scenes.length, `Rendering scene ${i + 1}/${scenes.length}`);
  }

  /* -------------------- pass 2: transitions / concat --------------------- */
  const silentPath = path.join(workDir, 'silent.mp4');
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], silentPath);
  } else {
    const args: string[] = [];
    for (const clip of clipPaths) args.push('-i', clip);
    const filters: string[] = [];
    let previous = '0:v';
    let cursor = durations[0];
    for (let i = 1; i < clipPaths.length; i += 1) {
      const transition = (scenes[i].transition || 'fade') as string;
      const type = transition === 'none' ? 'fade' : transition;
      const offset = Math.max(0, cursor - joinDuration(i));
      const label = `v${i}`;
      filters.push(
        `[${previous}][${i}:v]xfade=transition=${type}:duration=${joinDuration(i).toFixed(2)}:offset=${offset.toFixed(2)}[${label}]`,
      );
      previous = label;
      cursor = offset + durations[i];
    }
    args.push(
      '-filter_complex',
      filters.join(';'),
      '-map',
      `[${previous}]`,
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-an',
      silentPath,
    );
    try {
      await ffmpeg(args);
    } catch (error) {
      console.warn('[render] xfade chain failed, falling back to concat', error);
      const listPath = path.join(workDir, 'concat.txt');
      fs.writeFileSync(listPath, clipPaths.map((clip) => `file '${clip}'`).join('\n'), 'utf8');
      await ffmpeg([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-an',
        silentPath,
      ]);
    }
  }
  await progress(72, 'Applying transitions');

  /* ---------------------------- subtitles -------------------------------- */
  let subtitlePath: string | null = null;
  if (options.subtitles) {
    const cues: string[] = [];
    scenes.forEach((scene, index) => {
      const text = String(scene.text || '').trim();
      if (!text) return;
      const start = starts[index];
      const end = start + durations[index] - 0.05;
      cues.push(
        `${cues.length + 1}\n${srtTime(start)} --> ${srtTime(Math.max(start + 0.4, end))}\n${wrapCue(text)}\n`,
      );
    });
    if (cues.length) {
      subtitlePath = path.join(workDir, 'subtitles.srt');
      fs.writeFileSync(subtitlePath, cues.join('\n'), 'utf8');
    }
  }

  /* ------------------------------ audio ---------------------------------- */
  const narration = scenes
    .map((scene, index) => ({ path: scene.audioPath, start: starts[index] }))
    .filter((item): item is { path: string; start: number } => !!item.path && fs.existsSync(item.path));

  let musicPath = options.musicPath && fs.existsSync(options.musicPath) ? options.musicPath : null;
  if (!musicPath && narration.length === 0) {
    musicPath = await generateAmbientBed(totalDuration, path.join(workDir, 'ambient.m4a'));
  }

  const audioPath = path.join(workDir, 'audio.m4a');
  const audioArgs: string[] = [];
  const chains: string[] = [];
  let inputIndex = 0;

  for (const item of narration) {
    audioArgs.push('-i', item.path);
    chains.push(
      `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${Math.round(item.start * 1000)}|${Math.round(item.start * 1000)},volume=1.0[n${inputIndex}]`,
    );
    inputIndex += 1;
  }
  let musicLabel: string | null = null;
  if (musicPath) {
    audioArgs.push('-stream_loop', '-1', '-i', musicPath);
    const volume = Math.min(1, Math.max(0.02, options.musicVolume ?? 0.22));
    chains.push(
      `[${inputIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=0:${totalDuration.toFixed(2)},volume=${volume.toFixed(2)},afade=t=in:st=0:d=1.2,afade=t=out:st=${Math.max(0, totalDuration - 2).toFixed(2)}:d=2[m]`,
    );
    musicLabel = 'm';
    inputIndex += 1;
  }

  if (!narration.length && !musicPath) {
    audioArgs.push('-f', 'lavfi', '-t', totalDuration.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo');
    chains.push(`[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[sil]`);
    musicLabel = 'sil';
    inputIndex += 1;
  }

  const mixLabels: string[] = [];
  narration.forEach((_item, index) => mixLabels.push(`[n${index}]`));
  if (musicLabel) mixLabels.push(`[${musicLabel}]`);
  const mix = `${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.97[aout]`;
  chains.push(mix);

  await ffmpeg([
    ...audioArgs,
    '-filter_complex',
    chains.join(';'),
    '-map',
    '[aout]',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-t',
    totalDuration.toFixed(2),
    audioPath,
  ]);
  await progress(86, 'Mixing audio');

  /* --------------------------- final mux --------------------------------- */
  const muxArgs = ['-i', silentPath, '-i', audioPath];
  if (subtitlePath) {
    muxArgs.push(
      '-vf',
      `subtitles=${subtitlePath}:force_style='FontName=DejaVu Sans,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=80'`,
    );
  }
  muxArgs.push(
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-shortest',
    '-movflags',
    '+faststart',
    options.outPath,
  );
  try {
    await ffmpeg(muxArgs);
  } catch (error) {
    if (subtitlePath) {
      console.warn('[render] subtitle burn failed, exporting without burned subtitles', error);
      const retry = muxArgs.filter((arg, index) => {
        const previous = muxArgs[index - 1];
        return previous !== '-vf';
      });
      const cleaned = retry.filter((arg) => !String(arg).startsWith('subtitles='));
      await ffmpeg(cleaned);
    } else {
      throw error;
    }
  }
  await progress(96, 'Finalising MP4');

  const [duration, dimensions] = await Promise.all([
    ffprobeDuration(options.outPath),
    ffprobeDimensions(options.outPath),
  ]);

  return {
    outPath: options.outPath,
    duration: duration || totalDuration,
    width: dimensions.width || w,
    height: dimensions.height || h,
    subtitlePath,
    scenes: scenes.length,
  };
}

export function aspectOptions() {
  return Object.entries(ASPECTS).map(([id, value]) => ({ id, label: value.label, width: value.w, height: value.h }));
}
