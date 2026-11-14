import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, logActivity, now, run, touchProject, uid } from '@/lib/db';
import { chatJson, hasProvider } from '@/lib/providers';

type ScriptShape = {
  title: string;
  hook: string;
  body: string;
  cta: string;
  tags: string[];
  scenes: Array<{ text: string; visual: string; seconds?: number }>;
};

export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    const rows = projectId
      ? await all<any>('SELECT * FROM scripts WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC', [user.id, projectId])
      : await all<any>('SELECT * FROM scripts WHERE user_id = ? ORDER BY created_at DESC LIMIT 40', [user.id]);
    return ok({ scripts: rows });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string | null;
      topic?: string;
      idea?: string;
      tone?: string;
      seconds?: number;
      language?: string;
      aspect?: string;
      saveScenes?: boolean;
    }>(request);
    const topic = (body.topic || '').trim();
    if (topic.length < 2) return fail('Enter a topic or pick an idea first.');
    if (!(await hasProvider(user.id))) {
      return fail('Connect an AI provider key in Settings to write scripts.', 400);
    }
    const seconds = Math.min(600, Math.max(15, Number(body.seconds) || 45));
    const sceneCount = Math.min(12, Math.max(3, Math.round(seconds / 6)));
    const prompt = [
      `Topic: ${topic}`,
      body.idea ? `Chosen idea: ${body.idea}` : '',
      `Tone: ${body.tone || 'confident, fast, informative'}`,
      `Target length: about ${seconds} seconds of narration`,
      `Language: ${body.language || 'English'}`,
      `Break the narration into exactly ${sceneCount} scenes of roughly ${Math.round(seconds / sceneCount)} seconds each.`,
      'Every scene needs the narration line and a concrete visual prompt for an image generator.',
    ]
      .filter(Boolean)
      .join('\n');
    const { data: script } = await chatJson<ScriptShape>(user.id, {
      system:
        'You are an elite short-form video scriptwriter. Reply with JSON only: {"title":"","hook":"","body":"","cta":"","tags":[""],"scenes":[{"text":"narration","visual":"image prompt","seconds":5}]}',
      user: prompt,
      temperature: 0.8,
      maxTokens: 3200,
    });
    if (!script?.title || !Array.isArray(script.scenes) || !script.scenes.length) {
      return fail('The model did not return a usable script. Try again.', 502);
    }
    const id = uid('scr');
    const fullBody = [script.hook, script.body].filter(Boolean).join('\n\n').slice(0, 20000);
    await run(
      `INSERT INTO scripts (id, user_id, project_id, title, hook, body, cta, tags, duration, model, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, user.id, body.projectId || null, String(script.title).slice(0, 200), String(script.hook || '').slice(0, 1200), fullBody, String(script.cta || '').slice(0, 600), JSON.stringify(script.tags || []), seconds, 'ai', now()],
    );

    let scenesSaved = 0;
    if (body.projectId && body.saveScenes !== false) {
      await run('DELETE FROM scenes WHERE project_id = ? AND user_id = ?', [body.projectId, user.id]);
      let index = 0;
      for (const scene of script.scenes.slice(0, 14)) {
        const duration = Math.min(30, Math.max(2, Number(scene.seconds) || Math.round(seconds / script.scenes.length)));
        await run(
          `INSERT INTO scenes (id, user_id, project_id, idx, text, visual_prompt, image_asset_id, audio_asset_id, duration, motion, transition, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uid('scn'), user.id, body.projectId, index, String(scene.text || '').slice(0, 1200), String(scene.visual || '').slice(0, 900), null, null, duration, index % 2 === 0 ? 'zoom-in' : 'pan-right', 'fade', now()],
        );
        index += 1;
      }
      scenesSaved = index;
      await touchProject(body.projectId);
    }
    await logActivity(user.id, 'scripts', 'generated', `${script.title} · ${scenesSaved} scenes`);
    return ok({ script: { id, ...script, body: fullBody }, scenesSaved });
  })();
}
