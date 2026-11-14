import fs from 'node:fs';
import path from 'node:path';
import { TMP_DIR } from './db';
import { renderVideo, type SceneInput } from './ffmpeg';
import { extractThumbnail } from './ffmpeg';

/* ------------------------------------------------------------------------- */
/* In-process render queue (concurrency 1) so a 1 vCPU host stays responsive. */
/* Progress and results are persisted on the videos row.                     */
/* ------------------------------------------------------------------------- */

type Task = () => Promise<void>;

let chain: Promise<void> = Promise.resolve();
const pending: string[] = [];

export function queueDepth(): number {
  return pending.length;
}

export function enqueueRender(jobId: string, task: Task): void {
  pending.push(jobId);
  chain = chain
    .then(async () => {
      try {
        await task();
      } catch (error) {
        console.error('[render job] failed', jobId, error);
      } finally {
        const index = pending.indexOf(jobId);
        if (index >= 0) pending.splice(index, 1);
      }
    })
    .catch(() => {
      /* keep the chain alive */
    });
}

export function workDirFor(jobId: string): string {
  const dir = path.join(TMP_DIR, jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupWorkDir(jobId: string): void {
  try {
    fs.rmSync(path.join(TMP_DIR, jobId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export type ProductionJob = {
  jobId: string;
  aspect: string;
  scenes: SceneInput[];
  subtitles: boolean;
  musicPath: string | null;
  musicVolume: number;
  outPath: string;
};

export async function runProduction(
  job: ProductionJob,
  hooks: {
    onProgress: (percent: number, stage: string) => Promise<void>;
    onDone: (result: { path: string; duration: number; width: number; height: number; thumbnailPath: string | null }) => Promise<void>;
    onError: (message: string) => Promise<void>;
  },
): Promise<void> {
  const workDir = workDirFor(job.jobId);
  try {
    const result = await renderVideo({
      aspect: job.aspect,
      scenes: job.scenes,
      subtitles: job.subtitles,
      musicPath: job.musicPath,
      musicVolume: job.musicVolume,
      workDir,
      outPath: job.outPath,
      onProgress: hooks.onProgress,
    });
    let thumbnailPath: string | null = null;
    try {
      const thumb = path.join(workDir, 'thumbnail.jpg');
      await extractThumbnail(result.outPath, thumb, Math.min(1.2, result.duration / 3));
      thumbnailPath = thumb;
    } catch (error) {
      console.warn('[render] thumbnail extraction failed', error);
    }
    await hooks.onDone({
      path: result.outPath,
      duration: result.duration,
      width: result.width,
      height: result.height,
      thumbnailPath,
    });
  } catch (error: any) {
    await hooks.onError(error?.message || 'Render failed');
  } finally {
    cleanupWorkDir(job.jobId);
  }
}
