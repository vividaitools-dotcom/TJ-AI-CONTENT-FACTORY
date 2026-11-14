'use client';

import { useCallback, useEffect, useState } from 'react';
import { Notice, Panel, SectionTitle, Spinner, apiJson, fmtDate } from '@/components/ui';

type Model = { id: string; label: string; free?: boolean; note?: string };
type Provider = { id: string; name: string; keyLabel: string; docsUrl?: string; models: Model[]; notes?: string };
type Saved = { provider: string; model: string | null; updated_at: number; hint: string };
type Health = {
  status: string;
  ffmpeg: { ready: boolean; version: string | null };
  ffprobeReady: boolean;
  googleOauthConfigured: boolean;
};

export default function SettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [provider, setProvider] = useState('openrouter');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      const [keyData, healthData] = await Promise.all([
        apiJson<{ providers: Provider[]; saved: Saved[] }>('/api/keys'),
        apiJson<Health>('/api/health'),
      ]);
      setProviders(keyData.providers);
      setSaved(keyData.saved);
      setHealth(healthData);
    } catch (err: any) {
      setError(err.message || 'Could not load settings.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const current = providers.find((entry) => entry.id === provider);

  async function save() {
    if (key.trim().length < 8) return setError('Paste a valid API key.');
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiJson('/api/keys', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          key: key.trim(),
          model: model || undefined,
          baseUrl: provider === 'custom' ? baseUrl.trim() : undefined,
        }),
      });
      setKey('');
      setInfo(`${provider} key saved and encrypted.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not save the key.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(providerId: string) {
    try {
      await apiJson(`/api/keys?provider=${encodeURIComponent(providerId)}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not remove that key.');
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.22em] text-violet-300/70">Configuration</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">Settings</h1>
        <p className="mt-1 text-[0.8rem] leading-relaxed text-slate-400">
          Your own API keys, encrypted at rest. Free tiers are marked so you can start at zero cost.
        </p>
      </header>

      {error ? (
        <Notice kind="error" onClose={() => setError('')}>
          {error}
        </Notice>
      ) : null}
      {info ? (
        <Notice kind="success" onClose={() => setInfo('')}>
          {info}
        </Notice>
      ) : null}

      <Panel>
        <SectionTitle eyebrow="AI providers" title="Add a key" hint="One key is enough to unlock ideas, scripts and visuals." />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="label">Provider</span>
            <select className="select" value={provider} onChange={(event) => setProvider(event.target.value)}>
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Default model</span>
            <select className="select" value={model} onChange={(event) => setModel(event.target.value)}>
              <option value="">Provider default</option>
              {(current?.models || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.free ? ' · free' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {provider === 'custom' ? (
          <label className="mt-2 block">
            <span className="label">Base URL</span>
            <input
              className="input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>
        ) : null}

        <label className="mt-2 block">
          <span className="label">API key</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={current?.keyLabel || 'sk-…'}
          />
        </label>

        {current?.notes ? <p className="mt-2 text-[0.72rem] leading-relaxed text-slate-500">{current.notes}</p> : null}

        <button type="button" className="btn btn-primary mt-3 w-full" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
        {busy ? <div className="mt-2"><Spinner /></div> : null}
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Free tier" title="Zero-cost model picks" hint="Free quotas change — these are the documented free options." />
        <div className="space-y-2">
          {providers.map((entry) => {
            const free = entry.models.filter((m) => m.free);
            if (!free.length) return null;
            return (
              <div key={entry.id} className="panel-tight p-3">
                <p className="text-[0.8rem] font-semibold text-slate-200">{entry.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {free.map((m) => (
                    <span key={m.id} className="chip chip-on">
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {!providers.some((entry) => entry.models.some((m) => m.free)) ? (
            <p className="text-[0.78rem] text-slate-500">Provider catalog unavailable.</p>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Saved" title={`${saved.length} keys`} />
        {saved.length ? (
          <ul className="divide-y divide-white/5">
            {saved.map((entry) => (
              <li key={entry.provider} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-medium text-slate-200">{entry.provider}</p>
                  <p className="text-[0.66rem] text-slate-500">
                    {entry.hint} · {entry.model || 'default model'} · {fmtDate(entry.updated_at)}
                  </p>
                </div>
                <button type="button" className="shrink-0 text-[0.7rem] text-rose-300" onClick={() => remove(entry.provider)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.78rem] text-slate-500">No keys stored yet.</p>
        )}
      </Panel>

      <Panel>
        <SectionTitle eyebrow="Runtime" title="System status" />
        <ul className="space-y-1.5 text-[0.8rem]">
          <li className="flex justify-between gap-2">
            <span className="text-slate-400">ffmpeg</span>
            <span className={health?.ffmpeg.ready ? 'text-emerald-300' : 'text-rose-300'}>
              {health ? (health.ffmpeg.ready ? health.ffmpeg.version || 'ready' : 'missing') : '…'}
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-slate-400">ffprobe</span>
            <span className={health?.ffprobeReady ? 'text-emerald-300' : 'text-rose-300'}>
              {health ? (health.ffprobeReady ? 'ready' : 'missing') : '…'}
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span className="text-slate-400">Google OAuth</span>
            <span className={health?.googleOauthConfigured ? 'text-emerald-300' : 'text-amber-300'}>
              {health ? (health.googleOauthConfigured ? 'configured' : 'not configured') : '…'}
            </span>
          </li>
        </ul>
        {health && !health.googleOauthConfigured ? (
          <p className="mt-2 text-[0.72rem] leading-relaxed text-slate-500">
            Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (plus GOOGLE_REDIRECT_URI) to enable YouTube publishing.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
