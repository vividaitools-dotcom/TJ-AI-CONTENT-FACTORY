import fs from 'node:fs';
import path from 'node:path';
import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, get, logActivity, now, run, TMP_DIR, uid } from '@/lib/db';
import { dimsFor, renderPoster } from '@/lib/design';
import { enqueueRender, runProduction, type ProductionJob } from '@/lib/jobs';
import { getAsset, mediaAbsPath } from '@/lib/media';

export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    const videos = projectId
      ? await all<any>('SELECT * FROM videos WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC', [user.id, projectId])
      : await all<any>('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 40', [user.id]);
    return ok({ videos });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string;
      aspect?: string;
      subtitles?: boolean;
      musicAssetId?: string | null;
      musicVolume?: number;
      sceneIds?: string[];
    }>(request);
    if (!body.projectId) return fail('Open a project before rendering.');
    const project = await get<any>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [body.projectId, user.id]);
    if (!project) return fail('Project not found.', 404);

    let sceneRows = await all<any>('SELECT * FROM scenes WHERE project_id = ? AND user_id = ? ORDER BY idx ASC', [
      body.projectId,
      user.id,
    ]);
    if (Array.isArray(body.sceneIds) && body.sceneIds.length) {
      const keep = new Set(body.sceneIds);
      sceneRows = sceneRows.filter((scene) => keep.has(scene.id));
    }
    if (!sceneRows.length) return fail('This project has no scenes yet. Generate a script first.');

    const aspect = body.aspect && dimsFor(body.aspect) ? body.aspect : project.aspect || '9:16';
    const dims = dimsFor(aspect);
    const jobId = uid('vid');
    const workDir = path.join(TMP_DIR, `render-${jobId}`);
    fs.mkdirSync(workDir, { recursive: true });

    // Resolve (or generate) a still for every scene so rendering never fails on a missing image.
    const scenes = [];
    for (let i = 0; i < sceneRows.length; i += 1) {
      const scene = sceneRows[i];
      let imagePath: string | null = null;
      if (scene.image_asset_id) {
        const asset = await getAsset(user.id, scene.image_asset_id);
        if (asset) imagePath = mediaAbsPath(asset.rel_path);
      }
      if (!imagePath || !fs.existsSync(imagePath)) {
        const generated = path.join(workDir, `auto-${i}.png`);
        await renderPoster({
          title: (scene.text || `Scene ${i + 1}`).slice(0, 140),
          kicker: project.title,
          aspect,
          outPath: generated,
          workDir,
          seed: `${project.id}-${i}`,
        });
        imagePath = generated;
      }
      let audioPath: string | null = null;
      if (scene.audio_asset_id) {
        const audio = await getAsset(user.id, scene.audio_asset_id);
        if (audio) audioPath = mediaAbsPath(audio.rel_path);
      }
      scenes.push({
        id: scene.id,
        text: scene.text || '',
        imagePath,
        audioPath,
        duration: Number(scene.duration) || 4,
        motion: scene.motion || 'zoom-in',
        transition: scene.transition || 'fade',
      });
    }

    let musicPath: string | null = null;
    if (body.musicAssetId) {
      const music = await getAsset(user.id, body.musicAssetId);
      if (music) musicPath = mediaAbsPath(music.rel_path);
    }

    const relPath = `${user.id}/${jobId}.mp4`;
    const outPath = mediaAbsPath(relPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const timestamp = now();
    const spec = {
      aspect,
      subtitles: body.subtitles !== false,
      scenes: scenes.length,
      width: dims.w,
      height: dims.h,
      musicVolume: body.musicVolume ?? 0.18,
      hasMusic: Boolean(musicPath),
    };
    await run(
      `INSERT INTO videos (id, user_id, project_id, status, progress, stage, rel_path, duration, error, spec, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [jobId, user.id, body.projectId, 'queued', 0, 'Queued', relPath, null, null, JSON.stringify(spec), timestamp, timestamp],
    );
    await run('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', ['rendering', timestamp, body.projectId]);

    const job: ProductionJob = {
      jobId,
      aspect,
      scenes,
      subtitles: body.subtitles !== false,
      musicPath,
      musicVolume: body.musicVolume ?? 0.18,
      outPath,
    };

    enqueueRender(jobId, async () => {
      await run('UPDATE videos SET status = ?, updated_at = ? WHERE id = ?', ['rendering', now(), jobId]);
      await runProduction(job, {
        onProgress: async (percent, stage) => {
          await run('UPDATE videos SET progress = ?, stage = ?, updated_at = ? WHERE id = ?', [
            Math.max(0, Math.min(99, percent)),
            stage,
            now(),
            jobId,
          ]);
        },
        onDone: async (result) => {
          const bytes = fs.existsSync(result.path) ? fs.statSync(result.path).size : 0;
          const assetId = uid('ast');
          await run(
            `INSERT INTO assets (id, user_id, project_id, kind, name, mime, rel_path, bytes, width, height, meta, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              assetId,
              user.id,
              body.projectId,
              'video',
              `${project.title}.mp4`.slice(0, 120),
              'video/mp4',
              relPath,
              bytes,
              result.width,
              result.height,
              JSON.stringify({ duration: result.duration, aspect }),
              now(),
            ],
          );
          let thumbnailAssetId: string | null = null;
          if (result.thumbnailPath && fs.existsSync(result.thumbnailPath)) {
            const thumbRel = `${user.id}/${jobId}.jpg`;
            fs.copyFileSync(result.thumbnailPath, mediaAbsPath(thumbRel));
            const thumbId = uid('ast');
            const thumbBytes = fs.statSync(mediaAbsPath(thumbRel)).size;
            await run(
              `INSERT INTO assets (id, user_id, project_id, kind, name, mime, rel_path, bytes, width, height, meta, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              [thumbId, user.id, body.projectId, 'thumbnail', `thumb-${jobId}.jpg`, 'image/jpeg', thumbRel, thumbBytes, result.width, result.height, null, now()],
            );
            thumbnailAssetId = thumbId;
          }
          await run(
            'UPDATE videos SET status = ?, progress = 100, stage = ?, duration = ?, error = NULL, spec = ?, updated_at = ? WHERE id = ?',
            [
              'ready',
              'Ready',
              result.duration,
              JSON.stringify({ ...spec, videoAssetId: assetId, thumbnailAssetId }),
              now(),
              jobId,
            ],
          );
          await run('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', ['ready', now(), body.projectId]);
          await logActivity(user.id, 'video', 'rendered', `${project.title} · ${result.duration.toFixed(1)}s`);
        },
        onError: async (message) => {
          await run('UPDATE videos SET status = ?, error = ?, stage = ?, updated_at = ? WHERE id = ?', [
            'failed',
            message.slice(0, 900),
            'Failed',
            now(),
            jobId,
          ]);
          await run('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', ['draft', now(), body.projectId]);
        },
      });
    });

    return ok({ videoId: jobId, status: 'queued' }, 202);
  })();
}
