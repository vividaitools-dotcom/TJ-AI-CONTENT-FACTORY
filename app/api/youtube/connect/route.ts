import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { fail } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { buildAuthUrl, oauthConfigured } from '@/lib/youtube';

/** Starts the official Google OAuth consent flow. */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch {
    return fail('Sign in first.', 401);
  }
  if (!oauthConfigured()) {
    return fail(
      'YouTube publishing needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment. Add them in Settings → Environment variables.',
      400,
    );
  }
  const state = crypto.randomBytes(24).toString('hex');
  const store = await cookies();
  store.set('tjyt_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/youtube/callback`;
  return Response.redirect(buildAuthUrl(redirectUri, state), 302);
}
