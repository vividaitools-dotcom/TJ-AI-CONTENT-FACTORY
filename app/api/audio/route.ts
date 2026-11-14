import fs from 'node:fs';
import path from 'node:path';
import { fail, ok, readBody, withUser } from '@/lib/api';
import { logActivity, run, TMP_DIR, uid } from '@/lib/db';
import { generateAmbientBed } from '@/lib/ffmpeg';
import { synthesizeSpeech, TTS_VOICES } from '@/lib/providers';
import { saveAsset } from '@/lib/media';

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** TTS narration, ambient music generation and user audio uploads. */
export async function POST(request: Request) {
  return withUser(async (user) => {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      const projectId = (form.get('projectId') as string) || null;
      const sceneId = (form.get('sceneId') as string) || null;
      const kind = ((form.get('kind') as string) || 'music') === 'voice' ? 'audio' : 'music';
      if (!(file instanceof File)) return fail('Attach an audio file.');
      if (file.size > MAX_UPLOAD_BYTES) return fail('Audio file is larger than 30 MB.');
      if (!/^audio\/|^video\//.test(file.type || '')) return fail('Upload an audio file (mp3, m4a, wav, ogg).');
      const buffer = Buffer.from(await file.arrayBuffer());
      const asset = await saveAsset({
        userId: user.id,
        projectId,
        kind: kind as any,
        buffer,
        mime: file.type || 'audio/mpeg',
        name: file.name.slice(0, 120),
        meta: { source: 'upload', originalName: file.name },
      });
      if (sceneId && kind === 'audio') {
        await run('UPDATE scenes SET audio_asset_id = ? WHERE id = ? AND user_id = ?', [asset.id, sceneId, user.id]);
      }
      await logActivity(user.id, 'audio', 'uploaded', file.name.slice(0, 120));
      return ok({ asset, url: `/api/media/${asset.rel_path}` }, 201);
    }

    const body = await readBody<{
      mode?: 'tts' | 'ambient';
      projectId?: string | null;
      sceneId?: string | null;
      text?: string;
      voice?: string;
      speed?: number;
      seconds?: number;
    }>(request);

    if (body.mode === 'ambient') {
      const seconds = Math.min(180, Math.max(10, Number(body.seconds) || 45));
      const tempPath = path.join(TMP_DIR, `bed-${uid('tmp')}.m4a`);
      fs.mkdirSync(TMP_DIR, { recursive: true });
      try {
        await generateAmbientBed(seconds, tempPath);
        const buffer = fs.readFileSync(tempPath);
        const asset = await saveAsset({
          userId: user.id,
          projectId: body.projectId || null,
          kind: 'music',
          buffer,
          mime: 'audio/mp4',
          name: `ambient-${seconds}s.m4a`,
          meta: { source: 'ambient-generator', seconds },
        });
        await logActivity(user.id, 'audio', 'ambient_created', `${seconds}s bed`);
        return ok({ asset, url: `/api/media/${asset.rel_path}` }, 201);
      } finally {
        fs.rmSync(tempPath, { force: true });
      }
    }

    const text = (body.text || '').trim();
    if (text.length < 2) return fail('Enter the narration text.');
    const generated = await synthesizeSpeech({
      userId: user.id,
      text,
      voice: TTS_VOICES.includes(body.voice || '') ? body.voice : 'alloy',
      speed: Number(body.speed) || 1,
    });
    const asset = await saveAsset({
      userId: user.id,
      projectId: body.projectId || null,
      kind: 'audio',
      buffer: generated.buffer,
      mime: generated.mime,
      name: `narration-${Date.now()}.mp3`,
      meta: { source: 'tts', provider: generated.provider, model: generated.model, voice: body.voice || 'alloy', text: text.slice(0, 400) },
    });
    if (body.sceneId) {
      await run('UPDATE scenes SET audio_asset_id = ? WHERE id = ? AND user_id = ?', [asset.id, body.sceneId, user.id]);
    }
    await logActivity(user.id, 'audio', 'narration_created', text.slice(0, 80));
    return ok({ asset, url: `/api/media/${asset.rel_path}` }, 201);
  })();
}
