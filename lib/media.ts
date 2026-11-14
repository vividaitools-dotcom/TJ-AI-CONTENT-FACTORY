import fs from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR, get, now, run, uid } from './db';

/* ------------------------------------------------------------------------- */
/* Media store. Files live under DATA_DIR/media/<userId>/ and are only served */
/* to their owner through an authenticated route.                             */
/* ------------------------------------------------------------------------- */

export type AssetKind = 'image' | 'audio' | 'music' | 'video' | 'thumbnail';

export type Asset = {
  id: string;
  user_id: string;
  project_id: string | null;
  kind: AssetKind;
  name: string;
  mime: string;
  rel_path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  meta: string | null;
  created_at: number;
};

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export function extensionFor(mime: string, fallback = 'bin'): string {
  return MIME_EXT[String(mime || '').toLowerCase()] || fallback;
}

export function mediaAbsPath(relPath: string): string {
  const safe = relPath.replace(/\.\./g, '').replace(/^\/+/, '');
  return path.join(MEDIA_DIR, safe);
}

export async function saveAsset(options: {
  userId: string;
  projectId?: string | null;
  kind: AssetKind;
  buffer: Buffer;
  mime: string;
  name?: string;
  width?: number | null;
  height?: number | null;
  meta?: Record<string, unknown>;
  ext?: string;
}): Promise<Asset> {
  const id = uid('ast');
  const ext = options.ext || extensionFor(options.mime);
  const relPath = `${options.userId}/${id}.${ext}`;
  const abs = mediaAbsPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, options.buffer);
  const record: Asset = {
    id,
    user_id: options.userId,
    project_id: options.projectId || null,
    kind: options.kind,
    name: options.name || `${options.kind}-${id}.${ext}`,
    mime: options.mime,
    rel_path: relPath,
    bytes: options.buffer.length,
    width: options.width ?? null,
    height: options.height ?? null,
    meta: options.meta ? JSON.stringify(options.meta) : null,
    created_at: now(),
  };
  await run(
    `INSERT INTO assets (id, user_id, project_id, kind, name, mime, rel_path, bytes, width, height, meta, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      record.id,
      record.user_id,
      record.project_id,
      record.kind,
      record.name,
      record.mime,
      record.rel_path,
      record.bytes,
      record.width,
      record.height,
      record.meta,
      record.created_at,
    ],
  );
  return record;
}

export async function getAsset(userId: string, assetId: string): Promise<Asset | null> {
  return get<Asset>('SELECT * FROM assets WHERE id = ? AND user_id = ?', [assetId, userId]);
}

export async function listAssets(userId: string, projectId?: string | null, kind?: AssetKind): Promise<Asset[]> {
  const clauses = ['user_id = ?'];
  const params: any[] = [userId];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(projectId);
  }
  if (kind) {
    clauses.push('kind = ?');
    params.push(kind);
  }
  return get_all(`SELECT * FROM assets WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params);
}

async function get_all(sql: string, params: any[]): Promise<Asset[]> {
  const { all } = await import('./db');
  return all<Asset>(sql, params);
}

export async function deleteAsset(userId: string, assetId: string): Promise<void> {
  const asset = await getAsset(userId, assetId);
  if (!asset) return;
  try {
    fs.unlinkSync(mediaAbsPath(asset.rel_path));
  } catch {
    /* already gone */
  }
  await run('DELETE FROM assets WHERE id = ? AND user_id = ?', [assetId, userId]);
}

export function assetUrl(asset: { id: string } | null | undefined): string {
  if (!asset) return '';
  return `/api/media/${asset.id}`;
}

export async function fileExists(relPath: string): Promise<boolean> {
  try {
    return fs.existsSync(mediaAbsPath(relPath));
  } catch {
    return false;
  }
}
