import { fail, ok, readBody, withUser } from '@/lib/api';
import { all, get, logActivity, now, run } from '@/lib/db';
import { ASPECTS } from '@/lib/design';
import { deleteAsset } from '@/lib/media';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return withUser(async (user) => {
    const project = await get<any>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    if (!project) return fail('Project not found.', 404);
    const [scenes, scripts, ideas, trends, assets, videos, publications] = await Promise.all([
      all<any>('SELECT * FROM scenes WHERE project_id = ? AND user_id = ? ORDER BY idx ASC', [id, user.id]),
      all<any>('SELECT * FROM scripts WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC', [id, user.id]),
      all<any>('SELECT * FROM ideas WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC', [id, user.id]),
      all<any>('SELECT * FROM trends WHERE project_id = ? AND user_id = ? ORDER BY score DESC, created_at DESC', [id, user.id]),
      all<any>('SELECT * FROM assets WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC', [id, user.id]),
      all<any>('SELECT * FROM videos WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC', [id, user.id]),
      all<any>('SELECT * FROM publications WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC', [id, user.id]),
    ]);
    return ok({ project, scenes, scripts, ideas, trends, assets, videos, publications });
  })();
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return withUser(async (user) => {
    const body = await readBody<Record<string, any>>(request);
    const project = await get<any>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    if (!project) return fail('Project not found.', 404);
    const fields: string[] = [];
    const values: any[] = [];
    const assign = (column: string, value: any) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };
    if (typeof body.title === 'string' && body.title.trim()) assign('title', body.title.trim().slice(0, 160));
    if (typeof body.topic === 'string') assign('topic', body.topic.slice(0, 500));
    if (typeof body.niche === 'string') assign('niche', body.niche.slice(0, 200));
    if (typeof body.status === 'string') assign('status', body.status.slice(0, 40));
    if (typeof body.aspect === 'string' && ASPECTS[body.aspect]) assign('aspect', body.aspect);
    if (typeof body.language === 'string') assign('language', body.language.slice(0, 12));
    if (!fields.length) return fail('Nothing to update.');
    assign('updated_at', now());
    values.push(id, user.id);
    await run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
    const updated = await get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    return ok({ project: updated });
  })();
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return withUser(async (user) => {
    const project = await get<any>('SELECT * FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    if (!project) return fail('Project not found.', 404);
    const assets = await all<any>('SELECT id FROM assets WHERE project_id = ? AND user_id = ?', [id, user.id]);
    for (const asset of assets) await deleteAsset(user.id, asset.id);
    for (const table of ['scenes', 'scripts', 'ideas', 'trends', 'videos', 'publications']) {
      await run(`DELETE FROM ${table} WHERE project_id = ? AND user_id = ?`, [id, user.id]);
    }
    await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [id, user.id]);
    await logActivity(user.id, 'projects', 'project_deleted', project.title);
    return ok({ deleted: true });
  })();
}
