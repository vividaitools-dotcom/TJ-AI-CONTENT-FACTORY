import fs from 'node:fs';
import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, get, logActivity, now, run, uid } from '@/lib/db';
import { getAsset, mediaAbsPath } from '@/lib/media';
import { getValidAccessToken, uploadVideo } from '@/lib/youtube';

/**
 * Publishing desk. A publication is prepared as a draft first; the upload only
 * runs when the user explicitly approves it (POST with approve: true).
 */
export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    const rows = projectId
      ? await all<any>('SELECT * FROM publications WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC', [user.id, projectId])
      : await all<any>('SELECT * FROM publications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [user.id]);
    return ok({ publications: rows });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string;
      videoId?: string;
      title?: string;
      description?: string;
      tags?: string[] | string;
      privacy?: string;
      scheduledAt?: string | null;
      thumbnailAssetId?: string | null;
    }>(request);
    if (!body.videoId) return fail('Render a video before preparing a publication.');
    const video = await get<any>('SELECT * FROM videos WHERE id = ? AND user_id = ?', [body.videoId, user.id]);
    if (!video) return fail('Render not found.', 404);
    if (video.status !== 'ready') return fail('That render is not finished yet.');
    const title = (body.title || '').trim();
    if (title.length < 3) return fail('Add a title for the upload.');
    const tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
    const privacy = ['private', 'unlisted', 'public'].includes(body.privacy || '') ? body.privacy : 'private';
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return fail('That schedule date is not valid.');
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) return fail('Pick a schedule time in the future.');

    const id = uid('pub');
    const timestamp = now();
    await run(
      `INSERT INTO publications (id, user_id, project_id, video_id, platform, title, description, tags, privacy, thumbnail_asset_id, status, scheduled_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        user.id,
        body.projectId || video.project_id,
        body.videoId,
        'youtube',
        title.slice(0, 100),
        (body.description || '').slice(0, 4900),
        JSON.stringify(tags.slice(0, 30)),
        privacy,
        body.thumbnailAssetId || null,
        'awaiting_approval',
        scheduledAt ? scheduledAt.toISOString() : null,
        timestamp,
        timestamp,
      ],
    );
    await logActivity(user.id, 'publish', 'draft_prepared', title.slice(0, 90));
    const publication = await get('SELECT * FROM publications WHERE id = ?', [id]);
    return ok({ publication }, 201);
  })();
}

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{ id?: string; approve?: boolean; action?: string }>(request);
    if (!body.id) return fail('id is required.');
    const publication = await get<any>('SELECT * FROM publications WHERE id = ? AND user_id = ?', [body.id, user.id]);
    if (!publication) return fail('Publication not found.', 404);

    if (body.action === 'cancel') {
      await run('UPDATE publications SET status = ?, updated_at = ? WHERE id = ?', ['cancelled', now(), body.id]);
      return ok({ publication: await get('SELECT * FROM publications WHERE id = ?', [body.id]) });
    }
    if (body.approve !== true) {
      return fail('Explicit approval is required: send approve: true after reviewing the upload.');
    }
    if (publication.status === 'uploading' || publication.status === 'published') {
      return fail('This upload already ran.');
    }

    const video = await get<any>('SELECT * FROM videos WHERE id = ? AND user_id = ?', [publication.video_id, user.id]);
    if (!video) return fail('The source render is missing.', 404);
    const spec = video.spec ? JSON.parse(video.spec) : {};
    if (!spec.videoAssetId) return fail('The rendered MP4 asset is missing. Render again.', 409);
    const videoAsset = await getAsset(user.id, spec.videoAssetId);
    if (!videoAsset) return fail('The rendered MP4 asset is missing. Render again.', 409);
    const filePath = mediaAbsPath(videoAsset.rel_path);
    if (!fs.existsSync(filePath)) return fail('The MP4 file is missing on disk. Render again.', 409);

    const accessToken = await getValidAccessToken(user.id);
    if (!accessToken) {
      return fail('Connect your YouTube channel first (Settings → Publishing).', 400);
    }

    let thumbnailPath: string | null = null;
    if (publication.thumbnail_asset_id) {
      const thumb = await getAsset(user.id, publication.thumbnail_asset_id);
      if (thumb) thumbnailPath = mediaAbsPath(thumb.rel_path);
    } else if (spec.thumbnailAssetId) {
      const thumb = await getAsset(user.id, spec.thumbnailAssetId);
      if (thumb) thumbnailPath = mediaAbsPath(thumb.rel_path);
    }

    await run('UPDATE publications SET status = ?, error = NULL, updated_at = ? WHERE id = ?', ['uploading', now(), body.id]);
    try {
      const result = await uploadVideo({
        accessToken,
        filePath,
        title: publication.title,
        description: publication.description || '',
        tags: publication.tags ? JSON.parse(publication.tags) : [],
        privacyStatus: publication.privacy,
        publishAt: publication.scheduled_at,
        thumbnailPath,
      });
      await run(
        'UPDATE publications SET status = ?, external_id = ?, external_url = ?, updated_at = ? WHERE id = ?',
        ['published', result.videoId, result.url, now(), body.id],
      );
      await logActivity(user.id, 'publish', 'uploaded', `${publication.title} · ${result.url}`);
      return ok({ publication: await get('SELECT * FROM publications WHERE id = ?', [body.id]), result });
    } catch (error: any) {
      const message = String(error?.message || 'Upload failed').slice(0, 900);
      await run('UPDATE publications SET status = ?, error = ?, updated_at = ? WHERE id = ?', [
        'failed',
        message,
        now(),
        body.id,
      ]);
      return fail(message, 502);
    }
  })();
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const id = new URL(request.url).searchParams.get('id') || '';
    const publication = await get<any>('SELECT * FROM publications WHERE id = ? AND user_id = ?', [id, user.id]);
    if (!publication) return fail('Publication not found.', 404);
    if (publication.status === 'uploading') return fail('Wait for the current upload to finish.');
    await run('DELETE FROM publications WHERE id = ? AND user_id = ?', [id, user.id]);
    return ok({ deleted: true });
  })();
}
