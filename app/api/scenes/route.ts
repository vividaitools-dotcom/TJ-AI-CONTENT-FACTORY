import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, now, run, touchProject, uid } from '@/lib/db';
import { MOTIONS, TRANSITIONS } from '@/lib/ffmpeg';

export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) return fail('projectId is required.');
    const scenes = await all<any>('SELECT * FROM scenes WHERE project_id = ? AND user_id = ? ORDER BY idx ASC', [
      projectId,
      user.id,
    ]);
    return ok({ scenes });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string;
      text?: string;
      visualPrompt?: string;
      duration?: number;
      motion?: string;
      transition?: string;
    }>(request);
    if (!body.projectId) return fail('projectId is required.');
    const count = await all<any>('SELECT id FROM scenes WHERE project_id = ? AND user_id = ?', [body.projectId, user.id]);
    const id = uid('scn');
    await run(
      `INSERT INTO scenes (id, user_id, project_id, idx, text, visual_prompt, image_asset_id, audio_asset_id, duration, motion, transition, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        user.id,
        body.projectId,
        count.length,
        (body.text || '').slice(0, 1200),
        (body.visualPrompt || '').slice(0, 900),
        null,
        null,
        Math.min(30, Math.max(1.2, Number(body.duration) || 4)),
        MOTIONS.includes((body.motion as any) || 'zoom-in') ? body.motion || 'zoom-in' : 'zoom-in',
        TRANSITIONS.includes((body.transition as any) || 'fade') ? body.transition || 'fade' : 'fade',
        now(),
      ],
    );
    await touchProject(user.id, body.projectId);
    const scene = await import('@/lib/db').then((m) => m.get('SELECT * FROM scenes WHERE id = ?', [id]));
    return ok({ scene }, 201);
  })();
}

export async function PATCH(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<Record<string, any>>(request);
    if (!body.sceneId) return fail('sceneId is required.');
    const scene = await import('@/lib/db').then((m) =>
      m.get<any>('SELECT * FROM scenes WHERE id = ? AND user_id = ?', [body.sceneId, user.id]),
    );
    if (!scene) return fail('Scene not found.', 404);
    const fields: string[] = [];
    const values: any[] = [];
    const assign = (column: string, value: any) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };
    if (typeof body.text === 'string') assign('text', body.text.slice(0, 1200));
    if (typeof body.visualPrompt === 'string') assign('visual_prompt', body.visualPrompt.slice(0, 900));
    if (body.duration !== undefined) assign('duration', Math.min(30, Math.max(1.2, Number(body.duration) || 4)));
    if (typeof body.motion === 'string' && MOTIONS.includes(body.motion as any)) assign('motion', body.motion);
    if (typeof body.transition === 'string' && TRANSITIONS.includes(body.transition as any))
      assign('transition', body.transition);
    if (body.imageAssetId === null || typeof body.imageAssetId === 'string') assign('image_asset_id', body.imageAssetId);
    if (body.audioAssetId === null || typeof body.audioAssetId === 'string') assign('audio_asset_id', body.audioAssetId);
    if (typeof body.idx === 'number') assign('idx', Math.max(0, Math.round(body.idx)));
    if (!fields.length) return fail('Nothing to update.');
    values.push(body.sceneId, user.id);
    await run(`UPDATE scenes SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    await touchProject(user.id, scene.project_id);
    const updated = await import('@/lib/db').then((m) => m.get('SELECT * FROM scenes WHERE id = ?', [body.sceneId]));
    return ok({ scene: updated });
  })();
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const sceneId = new URL(request.url).searchParams.get('sceneId') || '';
    const scene = await import('@/lib/db').then((m) =>
      m.get<any>('SELECT * FROM scenes WHERE id = ? AND user_id = ?', [sceneId, user.id]),
    );
    if (!scene) return fail('Scene not found.', 404);
    await run('DELETE FROM scenes WHERE id = ? AND user_id = ?', [sceneId, user.id]);
    const remaining = await all<any>('SELECT id FROM scenes WHERE project_id = ? AND user_id = ? ORDER BY idx ASC', [
      scene.project_id,
      user.id,
    ]);
    for (let i = 0; i < remaining.length; i += 1) {
      await run('UPDATE scenes SET idx = ? WHERE id = ?', [i, remaining[i].id]);
    }
    return ok({ deleted: true });
  })();
}
