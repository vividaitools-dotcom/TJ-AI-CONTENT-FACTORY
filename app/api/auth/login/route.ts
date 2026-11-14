import { authenticate, createSession } from '@/lib/auth';
import { fail, ok, readBody } from '@/lib/api';

export async function POST(request: Request) {
  const body = await readBody<{ email?: string; password?: string }>(request);
  const email = (body.email || '').trim();
  const password = body.password || '';
  if (!email || !password) return fail('Email and password are required.');
  const user = await authenticate(email, password);
  if (!user) return fail('Email or password is incorrect.', 401);
  await createSession(user.id);
  return ok({ user: { id: user.id, email: user.email, name: user.name } });
}
