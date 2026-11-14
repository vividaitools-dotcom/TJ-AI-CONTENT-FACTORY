import fs from 'node:fs';
import path from 'node:path';
import { fail, ok, readBody, withUser } from '@/lib/api';
import { logActivity, now, run, touchProject, TMP_DIR, uid } from '@/lib/db';
import { ASPECTS, dimsFor, PALETTES, renderPoster } from '@/lib/design';
import { generateImageAI } from '@/lib/providers';
import { getAsset, saveAsset } from '@/lib/media';

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string | null;
      sceneId?: string | null;
      prompt?: string;
      title?: string;
      subtitle?: string;
      aspect?: string;
      palette?: string;
      mode?: 'designer' | 'ai';
      provider?: string;
      model?: string;
    }>(request);
    const aspect = body.aspect && ASPECTS[body.aspect] ? body.aspect : '9:16';
    const prompt = (body.prompt || '').trim();
    const title = (body.title || prompt || '').trim();
    if (!title && !prompt) return fail('Describe the visual you want.');
    const mode = body.mode === 'ai' ? 'ai' : 'designer';
    const dims = dimsFor(aspect);

    let asset;
    if (mode === 'ai') {
      const generated = await generateImageAI({
        userId: user.id,
        prompt: prompt || title,
        aspect,
        provider: (body.provider as any) || 'auto',
        model: body.model,
      });
      asset = await saveAsset({
        userId: user.id,
        projectId: body.projectId || null,
        kind: 'image',
        buffer: generated.buffer,
        mime: generated.mime,
        name: `${title.slice(0, 60)}.${generated.mime.includes('png') ? 'png' : 'jpg'}`,
        width: dims.w,
        height: dims.h,
        meta: { mode, provider: generated.provider, model: generated.model, prompt: prompt || title, aspect },
      });
    } else {
      const tempPath = path.join(TMP_DIR, `poster-${uid('tmp')}.png`);
      fs.mkdirSync(TMP_DIR, { recursive: true });
      try {
        await renderPoster({
          title: title.slice(0, 120),
          subtitle: (body.subtitle || '').slice(0, 200),
          kicker: 'TJ AI CONTENT FACTORY',
          aspect,
          palette: body.palette || PALETTES[0].id,
          outPath: tempPath,
          workDir: TMP_DIR,
          seed: prompt || title,
        });
        const buffer = fs.readFileSync(tempPath);
        asset = await saveAsset({
          userId: user.id,
          projectId: body.projectId || null,
          kind: 'image',
          buffer,
          mime: 'image/png',
          name: `${title.slice(0, 60)}.png`,
          width: dims.w,
          height: dims.h,
          meta: { mode, palette: body.palette || 'auto', prompt: prompt || title, aspect },
        });
      } finally {
        fs.rmSync(tempPath, { force: true });
      }
    }

    if (body.sceneId) {
      await run('UPDATE scenes SET image_asset_id = ? WHERE id = ? AND user_id = ?', [asset.id, body.sceneId, user.id]);
    }
    if (body.projectId) await touchProject(body.projectId);
    await logActivity(user.id, 'visuals', mode === 'ai' ? 'ai_image' : 'designer_image', title.slice(0, 120));
    return ok({ asset, url: `/api/media/${asset.id}` }, 201);
  })();
}

export async function GET(request: Request) {
  return withUser(async (user) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    const rows = projectId
      ? await import('@/lib/db').then((m) =>
          m.all<any>('SELECT * FROM assets WHERE user_id = ? AND project_id = ? AND kind = ? ORDER BY created_at DESC', [user.id, projectId, 'image']),
        )
      : await import('@/lib/db').then((m) =>
          m.all<any>('SELECT * FROM assets WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 60', [user.id, 'image']),
        );
    return ok({ images: rows });
  })();
}

export async function DELETE(request: Request) {
  return withUser(async (user) => {
    const assetId = new URL(request.url).searchParams.get('assetId') || '';
    const asset = await getAsset(user.id, assetId);
    if (!asset) return fail('Image not found.', 404);
    await run('UPDATE scenes SET image_asset_id = NULL WHERE image_asset_id = ? AND user_id = ?', [assetId, user.id]);
    const { deleteAsset } = await import('@/lib/media');
    await deleteAsset(user.id, assetId);
    return ok({ deleted: true });
  })();
}
