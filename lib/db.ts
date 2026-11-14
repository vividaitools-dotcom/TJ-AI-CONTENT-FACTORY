import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import initSqlJs from 'sql.js';

/* ------------------------------------------------------------------------- */
/* Independent storage layer for TJ AI CONTENT FACTORY.                       */
/* SQLite (compiled to WebAssembly by sql.js) persisted to a local file.      */
/* No shared database, schema or credentials with any other application.      */
/* ------------------------------------------------------------------------- */

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
const DB_FILE = path.join(DATA_DIR, 'app.db');

type Row = Record<string, any>;
type SqlDb = {
  run: (sql: string, params?: any[]) => void;
  prepare: (sql: string) => any;
  export: () => Uint8Array;
  close: () => void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT,
  secret TEXT NOT NULL,
  base_url TEXT,
  default_model TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  topic TEXT,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  aspect TEXT NOT NULL DEFAULT '9:16',
  language TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  source TEXT,
  title TEXT,
  url TEXT,
  score REAL DEFAULT 0,
  summary TEXT,
  keywords TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  hook TEXT,
  angle TEXT,
  format TEXT,
  score REAL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scripts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT,
  hook TEXT,
  body TEXT,
  cta TEXT,
  tags TEXT,
  duration INTEGER,
  model TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT,
  visual_prompt TEXT,
  image_asset_id TEXT,
  audio_asset_id TEXT,
  duration REAL DEFAULT 4,
  motion TEXT DEFAULT 'zoom-in',
  transition TEXT DEFAULT 'fade',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  kind TEXT NOT NULL,
  name TEXT,
  mime TEXT,
  rel_path TEXT NOT NULL,
  bytes INTEGER DEFAULT 0,
  width INTEGER,
  height INTEGER,
  meta TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER DEFAULT 0,
  stage TEXT,
  rel_path TEXT,
  duration REAL,
  error TEXT,
  spec TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  video_id TEXT,
  platform TEXT NOT NULL DEFAULT 'youtube',
  title TEXT,
  description TEXT,
  tags TEXT,
  privacy TEXT DEFAULT 'private',
  thumbnail_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  external_id TEXT,
  external_url TEXT,
  error TEXT,
  approved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS youtube_accounts (
  user_id TEXT PRIMARY KEY,
  channel_id TEXT,
  channel_title TEXT,
  access_token TEXT,
  refresh_token TEXT,
  scope TEXT,
  expires_at INTEGER,
  connected_at INTEGER
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  module TEXT,
  action TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id, idx);
CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_trends_project ON trends(project_id);
CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id);
CREATE INDEX IF NOT EXISTS idx_videos_project ON videos(project_id);
CREATE INDEX IF NOT EXISTS idx_pubs_project ON publications(project_id);
`;

function ensureDirs() {
  for (const dir of [DATA_DIR, MEDIA_DIR, TMP_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveWasm(): Buffer {
  const candidates: string[] = [];
  if (process.env.SQL_WASM_PATH) candidates.push(process.env.SQL_WASM_PATH);
  candidates.push(
    path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(process.cwd(), '.next/standalone/node_modules/sql.js/dist/sql-wasm.wasm'),
    path.join(process.cwd(), '../node_modules/sql.js/dist/sql-wasm.wasm'),
  );
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return fs.readFileSync(candidate);
    } catch {
      /* keep looking */
    }
  }
  throw new Error(
    'sql.js wasm binary not found. Install dependencies with `npm install` or set SQL_WASM_PATH.',
  );
}

type Holder = { db: SqlDb | null; loading: Promise<SqlDb> | null; timer: NodeJS.Timeout | null };
const holder: Holder = ((globalThis as any).__tjcf_db ??= {
  db: null,
  loading: null,
  timer: null,
});

function persistNow() {
  if (!holder.db) return;
  try {
    ensureDirs();
    const bytes = holder.db.export();
    const tmp = `${DB_FILE}.${randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(bytes));
    fs.renameSync(tmp, DB_FILE);
  } catch (error) {
    console.error('[db] persist failed', error);
  }
}

function schedulePersist() {
  if (holder.timer) clearTimeout(holder.timer);
  holder.timer = setTimeout(() => {
    holder.timer = null;
    persistNow();
  }, 120);
  if (typeof holder.timer.unref === 'function') holder.timer.unref();
}

async function open(): Promise<SqlDb> {
  ensureDirs();
  const wasmBinary = resolveWasm();
  const ab = wasmBinary.buffer.slice(
    wasmBinary.byteOffset,
    wasmBinary.byteOffset + wasmBinary.byteLength,
  ) as ArrayBuffer;
  const SQL = await initSqlJs({ wasmBinary: ab } as any);
  let db: SqlDb;
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE))) as unknown as SqlDb;
  } else {
    db = new SQL.Database() as unknown as SqlDb;
  }
  db.run(SCHEMA);
  holder.db = db;
  persistNow();
  return db;
}

export async function getDb(): Promise<SqlDb> {
  if (holder.db) return holder.db;
  if (!holder.loading) {
    holder.loading = open().finally(() => {
      holder.loading = null;
    });
  }
  return holder.loading;
}

export async function all<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  const out: T[] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) out.push(stmt.getAsObject() as T);
  } finally {
    stmt.free();
  }
  return out;
}

export async function get<T = Row>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows.length ? rows[0] : null;
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  db.run(sql, params);
  schedulePersist();
}

export async function tx(fn: (db: SqlDb) => void): Promise<void> {
  const db = await getDb();
  fn(db);
  schedulePersist();
}

export function uid(prefix = ''): string {
  const id = randomUUID().replace(/-/g, '').slice(0, 20);
  return prefix ? `${prefix}_${id}` : id;
}

export function now(): number {
  return Date.now();
}

export async function logActivity(
  userId: string,
  moduleName: string,
  action: string,
  detail = '',
  projectId: string | null = null,
): Promise<void> {
  await run(
    'INSERT INTO activity (id, user_id, project_id, module, action, detail, created_at) VALUES (?,?,?,?,?,?,?)',
    [uid('act'), userId, projectId, moduleName, action, detail.slice(0, 500), now()],
  );
}

export async function touchProject(projectId: string): Promise<void> {
  await run('UPDATE projects SET updated_at = ? WHERE id = ?', [now(), projectId]);
}

export function json<T>(value: T | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}
