import crypto from 'node:crypto';

/* ------------------------------------------------------------------------- */
/* Encryption for user-supplied API keys (AES-256-GCM).                       */
/* The key is derived from APP_SECRET, which lives only in the server env.    */
/* ------------------------------------------------------------------------- */

const SALT = 'tj-ai-content-factory/v1';

function masterKey(): Buffer {
  const secret =
    process.env.APP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'tj-content-factory-local-development-secret';
  return crypto.scryptSync(secret, SALT, 32);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const parts = String(payload || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Unsupported secret format');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function maskSecret(value: string): string {
  if (!value) return '';
  const tail = value.slice(-4);
  return `${'•'.repeat(Math.min(12, Math.max(4, value.length - 4)))}${tail}`;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
