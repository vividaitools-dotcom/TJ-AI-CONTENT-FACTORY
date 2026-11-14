import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, get, logActivity, now, run, uid } from '@/lib/db';
import { ASPECTS } from '@/lib/design';

export async function GET() {
  return withUser(async (user) => {
    const projects = await all<any>(
      `SELECT p.*,
        (SELECT COUNT(*) FROM scenes s WHERE s.project_id = p.id) AS scene_count,
        (SELECT COUNT(*) FROM videos v WHERE v.project_id = p.id) AS video_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
      [user.id],
    );
    return ok({ projects });
  })();
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const body = await readBody<{ title?: string; topic?: string; niche?: string; aspect?: string; language?: string }>(
      request,
    );
    const title = (body.title || '').trim();
    if (title.length < 2) return fail('Give the project a title.');
    const aspect = body.aspect && ASPECTS[body.aspect] ? body.aspect : '9:16';
    const id = uid('prj');
    const timestamp = now();
    await run(
      `INSERT INTO projects (id, user_id, title, topic, niche, status, aspect, language, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, user.id, title.slice(0, 160), body.topic || null, body.niche || null, 'draft', aspect, body.language || 'en', timestamp, timestamp],
    );
    await logActivity(user.id, 'projects', 'project_created', title);
    const project = await get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    return ok({ project }, 201);
  })();
}
