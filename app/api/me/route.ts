import { getSessionUser } from '@/lib/auth';
import { ok } from '@/lib/api';
import { all, get } from '@/lib/db';
import { configuredProviders } from '@/lib/providers';
import { connectionSummary, oauthConfigured } from '@/lib/youtube';
import { hasBinary } from '@/lib/process';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return ok({ user: null }, 200);
  const providers = await configuredProviders(user.id);
  const counts = await get<{ projects: number; videos: number; assets: number }>(
    `SELECT
       (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS projects,
       (SELECT COUNT(*) FROM videos WHERE user_id = ?) AS videos,
       (SELECT COUNT(*) FROM assets WHERE user_id = ?) AS assets`,
    [user.id, user.id, user.id],
  );
  const [youtube, ffmpegReady] = await Promise.all([connectionSummary(user.id), hasBinary('ffmpeg')]);
  const recent = await all<{ module: string; action: string; detail: string; created_at: number }>(
    'SELECT module, action, detail, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 8',
    [user.id],
  );
  return ok({
    user,
    providers,
    counts: counts || { projects: 0, videos: 0, assets: 0 },
    youtube,
    googleOauthConfigured: oauthConfigured(),
    ffmpegReady,
    recent,
  });
}
