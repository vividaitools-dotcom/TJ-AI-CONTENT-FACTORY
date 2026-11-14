import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth';
import { exchangeCode } from '@/lib/youtube';

/** Google redirect target: verifies state, stores the encrypted tokens. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const store = await cookies();
  const expected = store.get('tjyt_state')?.value;
  const back = (status: string) => Response.redirect(`${url.origin}/studio/settings?youtube=${status}`, 302);

  if (error) return back('denied');
  const user = await getSessionUser();
  if (!user) return Response.redirect(`${url.origin}/?error=signin`, 302);
  if (!code || !state || !expected || state !== expected) return back('state_mismatch');

  try {
    await exchangeCode(user.id, code, `${url.origin}/api/youtube/callback`);
    store.delete('tjyt_state');
    return back('connected');
  } catch (err: any) {
    console.error('[youtube callback]', err?.message);
    return back('failed');
  }
}
