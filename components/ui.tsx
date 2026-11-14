'use client';

import React from 'react';

/* Shared UI primitives for the TJ AI CONTENT FACTORY studio. */

export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export async function apiForm<T = any>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: 'POST', body: form, cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export function Panel({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: any;
}) {
  return <Tag className={`panel p-4 sm:p-5 ${className}`}>{children}</Tag>;
}

export function SectionTitle({
  eyebrow,
  title,
  hint,
  action,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">{eyebrow}</p>
        ) : null}
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-100">{title}</h2>
        {hint ? <p className="mt-1 text-[0.78rem] leading-relaxed text-slate-400">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  kind = 'info',
  children,
  onClose,
}: {
  kind?: 'info' | 'error' | 'success' | 'warn';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const tone =
    kind === 'error'
      ? 'border-rose-400/40 bg-rose-500/10 text-rose-100'
      : kind === 'success'
        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
        : kind === 'warn'
          ? 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          : 'border-violet-400/30 bg-violet-500/10 text-violet-100';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[0.8rem] leading-relaxed ${tone}`}>
      <p className="flex-1">{children}</p>
      {onClose ? (
        <button type="button" onClick={onClose} className="shrink-0 text-xs opacity-70" aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[0.78rem] text-slate-400">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
      {label}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[0.7rem] leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="panel-tight px-3 py-2.5">
      <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${accent || 'text-slate-100'}`}>{value}</p>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-sm text-[0.78rem] leading-relaxed text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-300 transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function fmtDate(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function fmtBytes(bytes: number | null | undefined): string {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function statusTone(status: string): string {
  switch (status) {
    case 'ready':
    case 'published':
    case 'connected':
      return 'text-emerald-300';
    case 'failed':
      return 'text-rose-300';
    case 'rendering':
    case 'uploading':
      return 'text-amber-300';
    default:
      return 'text-slate-300';
  }
}
