import { ok } from '@/lib/api';
import { hasBinary, ffprobeVersion } from '@/lib/process';
import { oauthConfigured } from '@/lib/youtube';
import { PROVIDERS } from '@/lib/providers';

export async function GET() {
  const [ffmpegReady, ffprobeReady] = await Promise.all([hasBinary('ffmpeg'), hasBinary('ffprobe')]);
  return ok({
    app: 'TJ AI CONTENT FACTORY',
    status: ffmpegReady && ffprobeReady ? 'ok' : 'degraded',
    ffmpeg: { ready: ffmpegReady, version: ffmpegReady ? await ffprobeVersion() : null },
    ffprobeReady,
    googleOauthConfigured: oauthConfigured(),
    providers: PROVIDERS.map((provider) => ({
      id: provider.id,
      name: provider.name,
      freeModels: provider.models.filter((model) => model.free).map((model) => model.id),
    })),
  });
}
