import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { all, get, now, run, uid } from './db';

/* ------------------------------------------------------------------------- */
/* Independent authentication: email + password (scrypt) with a signed       */
/* server-side session. No third-party auth service, no shared user store.   */
/* ------------------------------------------------------------------------- */

export const SESSION_COOKIE = 'tjcf_session';
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  created_at: number;
};

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function createUser(email: string, password: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await get<{ id: string }>('SELECT id FROM users WHERE email = ?', [normalized]);
  if (existing) throw new Error('An account with that email already exists.');
  const id = uid('usr');
  await run(
    'INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)',
    [id, normalized, name?.trim() || null, hashPassword(password), now()],
  );
  return { id, email: normalized, name: name?.trim() || null };
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const row = await get<{ id: string; email: string; name: string | null; password_hash: string; created_at: number }>(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?',
    [normalized],
  );
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export async function createSession(userId: string): Promise<string> {
  const id = crypto.randomBytes(32).toString('hex');
  const created = now();
  await run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)', [
    id,
    userId,
    created,
    created + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run('DELETE FROM sessions WHERE id = ?', [token]);
  jar.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await all<{ id: string; email: string; name: string | null; created_at: number; expires_at: number }>(
    `SELECT u.id, u.email, u.name, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? LIMIT 1`,
    [token],
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (row.expires_at < now()) {
    await run('DELETE FROM sessions WHERE id = ?', [token]);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated');
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
