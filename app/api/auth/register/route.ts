import { createSession, createUser } from '@/lib/auth';
import { fail, ok, readBody } from '@/lib/api';
import { logActivity } from '@/lib/db';

export async function POST(request: Request) {
  const body = await readBody<{ email?: string; password?: string; name?: string }>(request);
  const email = (body.email || '').trim();
  const password = body.password || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return fail('Enter a valid email address.');
  if (password.length < 8) return fail('Use a password with at least 8 characters.');
  try {
    const user = await createUser(email, password, body.name);
    await createSession(user.id);
    await logActivity(user.id, 'auth', 'account_created', email);
    return ok({ user });
  } catch (error: any) {
    return fail(error?.message || 'Could not create the account.', 400);
  }
}
