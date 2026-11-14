import { fail, ok, withUser } from '@/lib/api';
import { get } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return withUser(async (user) => {
    const video = await get<any>('SELECT * FROM videos WHERE id = ? AND user_id = ?', [id, user.id]);
    if (!video) return fail('Render not found.', 404);
    const spec = video.spec ? JSON.parse(video.spec) : {};
    return ok({
      video: {
        ...video,
        spec,
        url: video.status === 'ready' && spec.videoAssetId ? `/api/media/${spec.videoAssetId}` : null,
        thumbnailUrl: spec.thumbnailAssetId ? `/api/media/${spec.thumbnailAssetId}` : null,
      },
    });
  })();
}
