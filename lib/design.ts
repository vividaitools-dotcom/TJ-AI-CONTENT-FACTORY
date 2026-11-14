import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg } from './process';

/* ------------------------------------------------------------------------- */
/* Free, offline "Designer": renders real PNG artwork with ffmpeg only.       */
/* No API key, no paid service - gradient mesh + typography + accents.        */
/* ------------------------------------------------------------------------- */

export const ASPECTS: Record<string, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: '9:16 Shorts / Reels' },
  '16:9': { w: 1920, h: 1080, label: '16:9 YouTube long-form' },
  '1:1': { w: 1080, h: 1080, label: '1:1 Feed' },
  '4:5': { w: 1080, h: 1350, label: '4:5 Portrait feed' },
};

export function dimsFor(aspect: string): { w: number; h: number } {
  const found = ASPECTS[aspect] || ASPECTS['9:16'];
  return { w: found.w, h: found.h };
}

export type Palette = { id: string; label: string; colors: [string, string, string]; accent: string };

export const PALETTES: Palette[] = [
  { id: 'violet', label: 'Neon Violet', colors: ['0x2a1055', '0x0a0a1a', '0x4c1d95'], accent: '0xa78bfa' },
  { id: 'cyan', label: 'Deep Cyan', colors: ['0x06283d', '0x02070f', '0x0e7490'], accent: '0x22d3ee' },
  { id: 'ember', label: 'Ember', colors: ['0x3b0a12', '0x0a0507', '0x7c2d12'], accent: '0xfb923c' },
  { id: 'mint', label: 'Signal Mint', colors: ['0x052e2b', '0x04100f', '0x065f46'], accent: '0x34d399' },
  { id: 'mono', label: 'Graphite', colors: ['0x1c1c22', '0x08080b', '0x3f3f46'], accent: '0xe4e4e7' },
  { id: 'sunset', label: 'Sunset Grid', colors: ['0x4a1130', '0x12040f', '0x9d174d'], accent: '0xfbbf24' },
];

export function paletteFor(seed: string): Palette {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  return PALETTES[hash % PALETTES.length];
}

const FONT_CANDIDATES_BOLD = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
];

const FONT_CANDIDATES_REGULAR = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/TTF/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

export function resolveFont(bold = true): string {
  const list = bold ? FONT_CANDIDATES_BOLD : FONT_CANDIDATES_REGULAR;
  for (const candidate of list) {
    try {
      if (fs.existsSync(candidate)) return `fontfile=${candidate}`;
    } catch {
      /* keep looking */
    }
  }
  return 'font=sans';
}

export function wrapText(input: string, maxCharsPerLine: number, maxLines = 6): string {
  const words = String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(0, maxCharsPerLine - 1))}…`;
    return kept.join('\n');
  }
  return lines.join('\n');
}

/** drawtext escapes only the characters that break a filtergraph value. */
function escapeFilterValue(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

export type PosterOptions = {
  title: string;
  subtitle?: string;
  kicker?: string;
  aspect?: string;
  palette?: string;
  outPath: string;
  workDir: string;
  seed?: string;
  watermark?: string;
};

/**
 * Renders a real PNG poster (gradient mesh + headline + accents) with ffmpeg.
 * Returns the output path.
 */
export async function renderPoster(options: PosterOptions): Promise<string> {
  const aspect = options.aspect || '9:16';
  const { w, h } = dimsFor(aspect);
  const palette = PALETTES.find((p) => p.id === options.palette) || paletteFor(options.seed || options.title || 'tj');
  const workDir = options.workDir;
  fs.mkdirSync(workDir, { recursive: true });

  const base = path.basename(options.outPath, path.extname(options.outPath));
  const titleFile = path.join(workDir, `${base}-title.txt`);
  const subtitleFile = path.join(workDir, `${base}-sub.txt`);
  const kickerFile = path.join(workDir, `${base}-kick.txt`);

  const portrait = h > w;
  const titleChars = portrait ? 15 : aspect === '1:1' ? 20 : 26;
  const titleSize = portrait ? Math.round(w * 0.105) : Math.round(w * 0.062);
  const subSize = Math.round(titleSize * 0.42);
  const kickerSize = Math.round(titleSize * 0.3);

  const title = wrapText(options.title || 'Untitled scene', titleChars, 5);
  const subtitle = wrapText(options.subtitle || '', portrait ? 26 : 44, 4);
  const kicker = (options.kicker || 'TJ AI CONTENT FACTORY').toUpperCase().slice(0, 46);

  fs.writeFileSync(titleFile, title, 'utf8');
  fs.writeFileSync(subtitleFile, subtitle, 'utf8');
  fs.writeFileSync(kickerFile, kicker, 'utf8');

  const titleY = subtitle ? Math.round(h * 0.34) : Math.round(h * 0.42);
  const accentBarY = titleY - Math.round(h * 0.045);

  const filters: string[] = [];

  // soft accent glow block behind the headline
  filters.push(
    `drawbox=x=0:y=${Math.round(h * 0.22)}:w=${w}:h=${Math.round(h * 0.42)}:color=black@0.28:t=fill`,
  );
  filters.push(
    `drawbox=x=${Math.round(w * 0.08)}:y=${accentBarY}:w=${Math.round(w * 0.18)}:h=${Math.max(6, Math.round(h * 0.008))}:color=0x${palette.accent}@0.95:t=fill`,
  );
  filters.push(
    `drawtext=textfile=${escapeFilterValue(kickerFile)}:${resolveFont(true)}:fontcolor=0x${palette.accent}:fontsize=${kickerSize}:x=${Math.round(w * 0.08)}:y=${Math.round(h * 0.14)}`,
  );
  filters.push(
    `drawtext=textfile=${escapeFilterValue(titleFile)}:${resolveFont(true)}:fontcolor=white:fontsize=${titleSize}:line_spacing=${Math.round(titleSize * 0.22)}:x=${Math.round(w * 0.08)}:y=${titleY}:shadowcolor=black@0.55:shadowx=0:shadowy=6`,
  );
  if (subtitle) {
    filters.push(
      `drawtext=textfile=${escapeFilterValue(subtitleFile)}:${resolveFont(false)}:fontcolor=white@0.82:fontsize=${subSize}:line_spacing=${Math.round(subSize * 0.35)}:x=${Math.round(w * 0.08)}:y=${Math.round(h * 0.66)}`,
    );
  }
  filters.push(
    `drawtext=text:${escapeFilterValue(options.watermark || 'TJ AI CONTENT FACTORY')}:${resolveFont(true)}:fontcolor=white@0.45:fontsize=${Math.max(16, Math.round(w * 0.026))}:x=${Math.round(w * 0.08)}:y=${h - Math.round(h * 0.07)}`,
  );
  filters.push('vignette=PI/5');

  const gradientSource = `gradients=s=${w}x${h}:c0=0x${palette.colors[0].replace('0x', '')}:c1=0x${palette.colors[1].replace('0x', '')}:c2=0x${palette.colors[2].replace('0x', '')}:x0=0:y0=0:x1=${w}:y1=${h}:nb_colors=3:duration=1:rate=25`;

  await ffmpeg([
    '-f',
    'lavfi',
    '-i',
    gradientSource,
    '-frames:v',
    '1',
    '-vf',
    filters.join(','),
    options.outPath,
  ]);

  return options.outPath;
}
