import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, logActivity, now, run, touchProject, uid } from '@/lib/db';
import { researchTrends } from '@/lib/trends';
import { getYouTubeConnection } from '@/lib/youtube';

export async function GET(request: Request) {
  return withUser(async (user) => {
    const projectId = new URL(request.url).searchParams.get('projectId');
    const rows = projectId
      ? await all<any>('SELECT * FROM trends WHERE user_id = ? AND project_id = ? ORDER BY score DESC, created_at DESC LIMIT 60', [user.id, projectId])
      : await all<any>('SELECT * FROM trends WHERE user_id = ? ORDER BY created_at DESC LIMIT 60', [user.id]);
    return ok({ trends: rows });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{
      topic?: string;
      subreddit?: string;
      region?: string;
      includeYouTube?: boolean;
      projectId?: string | null;
      save?: boolean;
    }>(request);
    const topic = (body.topic || '').trim();
    if (topic.length < 2) return fail('Enter a topic or niche to research.');
    let youtubeKey: string | null = null;
    if (body.includeYouTube) {
      const connection = await getYouTubeConnection(user.id);
      youtubeKey = connection ? null : null; // trending is fetched with the server key only when present
      youtubeKey = process.env.YOUTUBE_API_KEY || null;
    }
    const result = await researchTrends({
      userId: user.id,
      topic,
      subreddit: (body.subreddit || 'technology').replace(/[^a-zA-Z0-9_]/g, ''),
      region: (body.region || 'US').slice(0, 2).toUpperCase(),
      includeYouTube: Boolean(body.includeYouTube),
      youtubeKey,
    });
    if (body.save !== false && body.projectId) {
      for (const item of result.items.slice(0, 30)) {
        await run(
          `INSERT INTO trends (id, user_id, project_id, source, title, url, score, summary, keywords, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [uid('trd'), user.id, body.projectId, item.source, item.title.slice(0, 300), item.url || null, item.score || 0, item.summary || null, JSON.stringify(item.keywords || []), now()],
        );
      }
      await touchProject(user.id, body.projectId);
    }
    await logActivity(user.id, 'trends', 'research', `${topic} · ${result.items.length} signals`);
    return ok(result);
  })();
}
