import { UnauthorizedError, requireUser, type SessionUser } from './auth';

/* Shared helpers for route handlers: JSON responses and auth wrapping. */

export function ok(data: unknown, status = 200): Response {
  return Response.json ? Response.json(data, { status }) : new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return ok({ error: message, ...extra }, status);
}

export async function readBody<T = any>(request: Request): Promise<T> {
  try {
    const text = await request.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/** Wraps a handler with session auth + uniform error mapping. */
export function withUser(
  handler: (user: SessionUser, request?: Request) => Promise<Response>,
): (request?: Request) => Promise<Response> {
  return async (request?: Request) => {
    try {
      const user = await requireUser();
      return await handler(user, request);
    } catch (error: any) {
      if (error instanceof UnauthorizedError) return fail('Sign in to continue.', 401);
      console.error('[api]', error);
      return fail(error?.message || 'Unexpected server error.', 500);
    }
  };
}

export function methodNotAllowed(allowed: string[]): Response {
  return fail(`Method not allowed. Use ${allowed.join(', ')}.`, 405);
}
