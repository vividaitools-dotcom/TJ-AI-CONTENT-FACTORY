import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, logActivity, now, run, touchProject, uid } from '@/lib/db';
import { chatJson, hasProvider } from '@/lib/providers';

type IdeaShape = {
  ideas: Array<{ title: string; hook: string; angle: string; format: string; score?: number; notes?: string }>;
};

export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    const rows = projectId
      ? await all<any>('SELECT * FROM ideas WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC', [user.id, projectId])
      : await all<any>('SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', [user.id]);
    return ok({ ideas: rows });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      projectId?: string | null;
      topic?: string;
      audience?: string;
      count?: number;
      platform?: string;
      trendContext?: string;
    }>(request);
    const topic = (body.topic || '').trim();
    if (topic.length < 2) return fail('Enter the topic to generate ideas for.');
    if (!(await hasProvider(user.id))) {
      return fail('Connect an AI provider key in Settings to generate ideas (OpenRouter and Gemini have free tiers).', 400);
    }
    const count = Math.min(12, Math.max(3, Number(body.count) || 8));
    const platform = body.platform || 'YouTube Shorts';
    const prompt = [
      `Topic: ${topic}`,
      `Audience: ${body.audience || 'general audience'}`,
      `Platform: ${platform}`,
      body.trendContext ? `Current trend signals:\n${body.trendContext}` : '',
      `Generate ${count} distinct video ideas. Each needs a scroll-stopping title, a 1-2 sentence hook, a unique angle, and a format (shorts, long-form, carousel, etc.).`,
      'Score each 0-100 for predicted engagement.',
    ]
      .filter(Boolean)
      .join('\n');
    const result = await chatJson<IdeaShape>(user.id, {
      system:
        'You are a senior content strategist. Reply with JSON only: {"ideas":[{"title":"","hook":"","angle":"","format":"","score":0,"notes":""}]}',
      user: prompt,
      temperature: 0.85,
      maxTokens: 2000,
    });
    const ideas = Array.isArray(result?.ideas) ? result.ideas.slice(0, count) : [];
    if (!ideas.length) return fail('The model returned no ideas. Try again or switch models.', 502);
    const saved: any[] = [];
    for (const idea of ideas) {
      const id = uid('ida');
      await run(
        `INSERT INTO ideas (id, user_id, project_id, title, hook, angle, format, score, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, user.id, body.projectId || null, String(idea.title || '').slice(0, 300), String(idea.hook || '').slice(0, 900), String(idea.angle || '').slice(0, 600), String(idea.format || platform).slice(0, 60), Number(idea.score) || 0, String(idea.notes || '').slice(0, 600), now()],
      );
      saved.push({ id, ...idea });
    }
    if (body.projectId) await touchProject(user.id, body.projectId);
    await logActivity(user.id, 'ideas', 'generated', `${ideas.length} ideas · ${topic}`);
    return ok({ ideas: saved });
  })();
}
