import fs from 'node:fs';
import path from 'node:path';
import { fail, ok, withUser } from '@/lib/api';
import { get } from '@/lib/db';
import { mediaAbsPath } from '@/lib/media';

type Params = { params: Promise<{ assetId: string }> };

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.vtt': 'text/vtt',
  '.srt': 'text/plain',
};

/**
 * Owner-scoped media streaming. The asset id is resolved against the signed-in
 * user, so no filesystem path from the URL is ever trusted. Range requests are
 * supported because iOS Safari requires them to play MP4 video.
 */
export async function GET(request: Request, { params }: Params) {
  const { assetId } = await params;
  return withUser(async (user) => {
    const asset = await get<any>('SELECT * FROM assets WHERE id = ? AND user_id = ?', [assetId, user.id]);
    if (!asset) return fail('Not found.', 404);
    const abs = mediaAbsPath(asset.rel_path);
    if (!fs.existsSync(abs)) return fail('File missing on disk.', 404);

    const stat = fs.statSync(abs);
    const type = MIME[path.extname(abs).toLowerCase()] || asset.mime || 'application/octet-stream';
    const range = request.headers.get('range');

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) {
          return new Response(null, { status: 416, headers: { 'content-range': `bytes */${stat.size}` } });
        }
        const stream = fs.createReadStream(abs, { start, end });
        return new Response(stream as any, {
          status: 206,
          headers: {
            'content-type': type,
            'content-length': String(end - start + 1),
            'content-range': `bytes ${start}-${end}/${stat.size}`,
            'accept-ranges': 'bytes',
            'cache-control': 'private, max-age=3600',
          },
        });
      }
    }

    const stream = fs.createReadStream(abs);
    return new Response(stream as any, {
      status: 200,
      headers: {
        'content-type': type,
        'content-length': String(stat.size),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=3600',
      },
    });
  })();
}
