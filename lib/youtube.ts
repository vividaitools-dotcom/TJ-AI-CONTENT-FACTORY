import { get, now, run } from './db';
import { decryptSecret, encryptSecret } from './crypto';

/* ------------------------------------------------------------------------- */
/* YOUTUBE PUBLISHING - official Google OAuth 2.0 + YouTube Data API v3.     */
/* Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in the server env.       */
/* Nothing is uploaded without an explicit approval action from the user.    */
/* ------------------------------------------------------------------------- */

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export function oauthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenRow = {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
  channel_title: string | null;
  channel_id: string | null;
  created_at: number;
  updated_at: number;
};

export function getYouTubeConnection(userId: string): TokenRow | null {
  return get<TokenRow>(`SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = 'youtube'`, [userId]);
}

export function connectionSummary(userId: string) {
  const row = getYouTubeConnection(userId);
  if (!row) return { connected: false, configured: oauthConfigured() };
  return {
    connected: true,
    configured: oauthConfigured(),
    channelTitle: row.channel_title,
    channelId: row.channel_id,
    scopes: row.scope ? row.scope.split(' ') : [],
    updatedAt: row.updated_at,
  };
}

export async function exchangeCode(userId: string, code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'Google token exchange failed');
  }
  const expiresAt = Date.now() + (payload.expires_in || 3600) * 1000 - 60_000;
  const existing = getYouTubeConnection(userId);
  const values = [
    encryptSecret(payload.access_token),
    payload.refresh_token ? encryptSecret(payload.refresh_token) : existing?.refresh_token || null,
    expiresAt,
    payload.scope || YOUTUBE_SCOPES.join(' '),
  ];
  if (existing) {
    run(
      `UPDATE oauth_tokens SET access_token = ?, refresh_token = ?, expires_at = ?, scope = ?, updated_at = ? WHERE id = ?`,
      [...values, now(), existing.id],
    );
  } else {
    run(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scope, created_at, updated_at)
       VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?)`,
      [`yt_${userId}_${Date.now()}`, userId, ...values, now(), now()],
    );
  }
  try {
    const channel = await getChannel(payload.access_token);
    run(`UPDATE oauth_tokens SET channel_title = ?, channel_id = ? WHERE user_id = ? AND provider = 'youtube'`, [
      channel.title,
      channel.id,
      userId,
    ]);
  } catch (error) {
    console.warn('[youtube] channel lookup failed', error);
  }
  return connectionSummary(userId);
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const row = getYouTubeConnection(userId);
  if (!row?.access_token) return null;
  const access = decryptSecret(row.access_token);
  if (!access) return null;
  if (row.expires_at && row.expires_at > Date.now()) return access;
  const refresh = row.refresh_token ? decryptSecret(row.refresh_token) : null;
  if (!refresh) return access;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const payload = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !payload.access_token) return access;
  run(`UPDATE oauth_tokens SET access_token = ?, expires_at = ?, updated_at = ? WHERE id = ?`, [
    encryptSecret(payload.access_token),
    Date.now() + (payload.expires_in || 3600) * 1000 - 60_000,
    now(),
    row.id,
  ]);
  return payload.access_token;
}

export async function getChannel(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as {
    items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } }; statistics?: { subscriberCount?: string; videoCount?: string } }>;
    error?: { message: string };
  };
  if (!response.ok) throw new Error(payload.error?.message || 'YouTube channel lookup failed');
  const item = payload.items?.[0];
  return {
    id: item?.id || '',
    title: item?.snippet?.title || '',
    thumbnail: item?.snippet?.thumbnails?.default?.url || '',
    subscribers: item?.statistics?.subscriberCount || '0',
    videos: item?.statistics?.videoCount || '0',
  };
}

export async function disconnectYouTube(userId: string) {
  run(`DELETE FROM oauth_tokens WHERE user_id = ? AND provider = 'youtube'`, [userId]);
}

export type UploadInput = {
  accessToken: string;
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'unlisted' | 'public';
  publishAt?: string | null;
  madeForKids?: boolean;
  categoryId?: string;
  thumbnailPath?: string | null;
};

/**
 * Resumable upload to YouTube. Scheduling is expressed as privacyStatus
 * "private" + publishAt, exactly as the Data API requires.
 */
export async function uploadVideo(input: UploadInput) {
  const fs = await import('node:fs');
  const stat = fs.statSync(input.filePath);
  const metadata: Record<string, unknown> = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 4900),
      tags: input.tags.slice(0, 15),
      categoryId: input.categoryId || '22',
    },
    status: {
      privacyStatus: input.publishAt ? 'private' : input.privacyStatus,
      selfDeclaredMadeForKids: !!input.madeForKids,
      ...(input.publishAt ? { publishAt: input.publishAt } : {}),
    },
  };

  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json',
        'x-upload-content-length': String(stat.size),
        'x-upload-content-type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!init.ok) {
    const text = await init.text();
    throw new Error(parseYouTubeError(text));
  }
  const location = init.headers.get('location');
  if (!location) throw new Error('YouTube did not return an upload URL.');

  const body = fs.readFileSync(input.filePath);
  const upload = await fetch(location, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'content-length': String(stat.size) },
    body,
  });
  const text = await upload.text();
  if (!upload.ok) throw new Error(parseYouTubeError(text));
  const payload = JSON.parse(text) as { id?: string; snippet?: { title?: string } };
  const videoId = payload.id || '';

  let thumbnailError: string | null = null;
  if (videoId && input.thumbnailPath) {
    try {
      const thumb = fs.readFileSync(input.thumbnailPath);
      const response = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'image/jpeg' },
          body: thumb,
        },
      );
      if (!response.ok) thumbnailError = parseYouTubeError(await response.text());
    } catch (error: any) {
      thumbnailError = error?.message || 'thumbnail upload failed';
    }
  }

  return {
    videoId,
    url: videoId ? `https://youtube.com/watch?v=${videoId}` : '',
    privacyStatus: input.publishAt ? 'scheduled' : input.privacyStatus,
    publishAt: input.publishAt || null,
    thumbnailError,
  };
}

function parseYouTubeError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; errors?: Array<{ reason?: string }> } };
    const reason = parsed.error?.errors?.[0]?.reason;
    const message = parsed.error?.message || raw.slice(0, 300);
    return reason ? `${message} (${reason})` : message;
  } catch {
    return raw.slice(0, 300) || 'YouTube request failed';
  }
}
